import fs from 'node:fs';
import path from 'node:path';

const OFFICIAL_SOURCE = 'IDX_OFFICIAL_API';
const DEFAULT_ARTIFACT = path.join(process.cwd(), 'data', 'idx-suspension', 'suspension-index.json');
const MAX_ARTIFACT_AGE_HOURS = 72;
const REQUIRED_COVERAGE_DAYS = 30;

interface SuspensionStatus {
  status: 'SUSPENDED' | 'ACTIVE';
  asOf: string;
  occurredAt: string;
  certain: boolean;
  uncertainDirection: 'MUNGKIN_DISUSPENSI' | 'MUNGKIN_SUDAH_DIBUKA' | null;
}

interface SuspensionArtifact {
  updatedAt: string;
  source: string;
  coverageFrom: string;
  coverageTo: string;
  count: number;
  unresolvedCount: number;
  tickerCount: number;
  suspendedTickers: string[];
  statuses: Record<string, SuspensionStatus>;
  unresolved: { occurredAt: string; infoType: string | null }[];
}

export interface SuspensionArtifactProbe {
  verified: boolean;
  status: 'READY' | 'PARTIAL' | 'MISSING' | 'STALE';
  source: string | null;
  observedAt: string | null;
  coverageFrom: string | null;
  coverageTo: string | null;
  tickerCount: number;
  suspendedCount: number;
  unresolvedCount: number;
  /**
   * Baris '>1 Kode' bertipe SPT membuat SELURUH pasar tidak bisa dinyatakan bersih,
   * bukan hanya emiten yang kebetulan sudah punya riwayat. Lihat catatan di
   * resolveTickerSuspension().
   */
  marketWideSuspendUncertainty: boolean;
  detail: string;
}

export type TickerSuspensionVerdict =
  | 'SUSPENDED'
  | 'ACTIVE'
  | 'NO_RECORD'
  | 'UNKNOWN';

export interface TickerSuspensionResult {
  ticker: string;
  verdict: TickerSuspensionVerdict;
  /** true hanya kalau feed benar-benar membuktikannya, bukan sekadar tidak menyanggah. */
  certain: boolean;
  tradable: boolean;
  reason: string;
}

function missing(detail: string): SuspensionArtifactProbe {
  return {
    verified: false,
    status: 'MISSING',
    source: null,
    observedAt: null,
    coverageFrom: null,
    coverageTo: null,
    tickerCount: 0,
    suspendedCount: 0,
    unresolvedCount: 0,
    marketWideSuspendUncertainty: true,
    detail,
  };
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

/**
 * Membuktikan feed suspensi dari artefak runtime resmi BEI.
 *
 * Sama ketatnya dengan probe UMA: provenance, freshness, cakupan, dan konsistensi
 * internal harus cocok. Artefak yang korup atau setengah jadi akan terbaca sebagai
 * "tidak ada suspensi" - kebohongan paling berbahaya yang bisa dihasilkan berkas ini.
 */
export function probeOfficialSuspensionArtifact(
  artifactPath = DEFAULT_ARTIFACT,
  now = new Date(),
): SuspensionArtifactProbe {
  let raw: string;
  try {
    raw = fs.readFileSync(artifactPath, 'utf8');
  } catch {
    return missing(`Artefak suspensi resmi belum tersedia di ${artifactPath}.`);
  }

  let artifact: SuspensionArtifact;
  try {
    artifact = JSON.parse(raw) as SuspensionArtifact;
  } catch {
    return missing('Artefak suspensi tidak dapat diparse sebagai JSON.');
  }

  if (artifact.source !== OFFICIAL_SOURCE) {
    return missing(`Provenance suspensi ditolak: source=${String(artifact.source)}, wajib ${OFFICIAL_SOURCE}.`);
  }

  const observedMs = Date.parse(artifact.updatedAt);
  if (!Number.isFinite(observedMs)) {
    return missing('Artefak suspensi tidak memiliki updatedAt yang sah.');
  }
  const ageHours = (now.getTime() - observedMs) / 3_600_000;
  if (ageHours < -1) {
    return missing('Artefak suspensi bertanggal di masa depan; clock/provenance perlu diperiksa.');
  }

  if (!validDate(artifact.coverageFrom) || !validDate(artifact.coverageTo)
      || artifact.coverageFrom > artifact.coverageTo) {
    return missing('Rentang coverageFrom/coverageTo artefak suspensi tidak sah.');
  }

  const statuses = artifact.statuses && typeof artifact.statuses === 'object' ? artifact.statuses : null;
  if (!statuses || Object.keys(statuses).length === 0) {
    return missing('Artefak suspensi tidak memuat peta status per emiten.');
  }
  if (artifact.tickerCount !== Object.keys(statuses).length) {
    return missing('tickerCount tidak konsisten dengan peta status suspensi.');
  }

  const suspendedFromStatuses = Object.entries(statuses)
    .filter(([, state]) => state?.status === 'SUSPENDED')
    .map(([ticker]) => ticker)
    .sort();
  const declaredSuspended = Array.isArray(artifact.suspendedTickers)
    ? [...artifact.suspendedTickers].sort()
    : null;
  if (!declaredSuspended
      || declaredSuspended.length !== suspendedFromStatuses.length
      || declaredSuspended.some((ticker, index) => ticker !== suspendedFromStatuses[index])) {
    return missing('Daftar suspendedTickers tidak konsisten dengan peta status.');
  }

  for (const [ticker, state] of Object.entries(statuses)) {
    if (!/^[A-Z]{4}$/.test(ticker)
        || (state?.status !== 'SUSPENDED' && state?.status !== 'ACTIVE')
        || !validDate(state?.asOf)
        || state.asOf < artifact.coverageFrom || state.asOf > artifact.coverageTo) {
      return missing(`Status suspensi cacat atau di luar cakupan untuk ${ticker}.`);
    }
  }

  const requiredFrom = new Date(now);
  requiredFrom.setUTCDate(requiredFrom.getUTCDate() - REQUIRED_COVERAGE_DAYS);
  if (artifact.coverageFrom > requiredFrom.toISOString().slice(0, 10)) {
    return missing(
      `Cakupan suspensi hanya mulai ${artifact.coverageFrom}; wajib menutup sedikitnya ${REQUIRED_COVERAGE_DAYS} hari.`,
    );
  }

  const unresolved = Array.isArray(artifact.unresolved) ? artifact.unresolved : [];
  const marketWideSuspendUncertainty = unresolved.some((row) => row?.infoType === 'SPT');

  const base = {
    source: `${OFFICIAL_SOURCE} GetSuspension via data/idx-suspension`,
    observedAt: new Date(observedMs).toISOString(),
    coverageFrom: artifact.coverageFrom,
    coverageTo: artifact.coverageTo,
    tickerCount: artifact.tickerCount,
    suspendedCount: suspendedFromStatuses.length,
    unresolvedCount: unresolved.length,
    marketWideSuspendUncertainty,
  };

  if (ageHours > MAX_ARTIFACT_AGE_HOURS) {
    return {
      ...base,
      verified: false,
      status: 'STALE',
      detail: `Artefak suspensi berumur ${ageHours.toFixed(1)} jam; batas ${MAX_ARTIFACT_AGE_HOURS} jam.`,
    };
  }

  return {
    ...base,
    verified: true,
    status: 'PARTIAL',
    detail: `Feed suspensi resmi terverifikasi: ${suspendedFromStatuses.length} emiten sedang disuspensi dari ${artifact.tickerCount} yang punya riwayat, cakupan ${artifact.coverageFrom}..${artifact.coverageTo}.`,
  };
}

/**
 * Putuskan status perdagangan satu emiten.
 *
 * KENAPA 'NO_RECORD' TIDAK SAMA DENGAN 'AMAN'
 * -------------------------------------------
 * Feed suspensi memuat baris '>1 Kode' yang kode emitennya hanya ada di dalam PDF.
 * Baris seperti itu bisa menyangkut emiten MANA PUN - termasuk yang tidak punya
 * satu pun peristiwa dan karenanya tidak muncul di peta status sama sekali.
 *
 * Artinya ketidakpastian dari baris SPT yang belum terselesaikan bersifat
 * SELURUH PASAR, bukan hanya emiten yang kebetulan sudah pernah tercatat. Kalau
 * fungsi ini mengembalikan 'tradable' untuk emiten tanpa catatan sementara masih
 * ada SPT yang belum terurai, ia sedang menjamin sesuatu yang tidak dibuktikan
 * oleh data mana pun.
 *
 * Maka: emiten tanpa catatan tetap NO_RECORD, tapi `certain` mengikuti ada-tidaknya
 * SPT yang belum terurai, dan `tradable` hanya benar kalau keduanya bersih.
 */
export function resolveTickerSuspension(
  ticker: string,
  probe: SuspensionArtifactProbe,
  statuses: Record<string, SuspensionStatus> | null,
): TickerSuspensionResult {
  const code = ticker.trim().toUpperCase();

  if (!probe.verified || statuses === null) {
    return {
      ticker: code,
      verdict: 'UNKNOWN',
      certain: false,
      tradable: false,
      reason: `Feed suspensi tidak terverifikasi (${probe.status}). Fail-closed: status ${code} tidak diketahui.`,
    };
  }

  const state = statuses[code];

  if (!state) {
    const certain = !probe.marketWideSuspendUncertainty;
    return {
      ticker: code,
      verdict: 'NO_RECORD',
      certain,
      tradable: certain,
      reason: certain
        ? `Tidak ada peristiwa suspensi untuk ${code} dalam cakupan ${probe.coverageFrom}..${probe.coverageTo}.`
        : `Tidak ada catatan untuk ${code}, tetapi masih ada ${probe.unresolvedCount} pengumuman '>1 Kode' yang belum terurai — emiten mana pun bisa tersentuh. Status tidak dapat dinyatakan bersih.`,
    };
  }

  if (state.status === 'SUSPENDED') {
    return {
      ticker: code,
      verdict: 'SUSPENDED',
      certain: state.certain,
      tradable: false,
      reason: `${code} disuspensi sejak ${state.asOf}.${state.certain ? '' : ' Ada pengumuman pembukaan yang belum terurai, jadi bisa saja sudah dibuka.'}`,
    };
  }

  const uncertainSuspend = state.uncertainDirection === 'MUNGKIN_DISUSPENSI'
    || probe.marketWideSuspendUncertainty;

  return {
    ticker: code,
    verdict: 'ACTIVE',
    certain: state.certain && !probe.marketWideSuspendUncertainty,
    tradable: !uncertainSuspend,
    reason: uncertainSuspend
      ? `${code} tercatat aktif sejak ${state.asOf}, tetapi ada pengumuman suspensi '>1 Kode' yang belum terurai sesudahnya. Fail-closed.`
      : `${code} aktif, pembukaan terakhir ${state.asOf}.`,
  };
}

export function readSuspensionStatuses(
  artifactPath = DEFAULT_ARTIFACT,
): Record<string, SuspensionStatus> | null {
  try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as SuspensionArtifact;
    return artifact.statuses ?? null;
  } catch {
    return null;
  }
}
