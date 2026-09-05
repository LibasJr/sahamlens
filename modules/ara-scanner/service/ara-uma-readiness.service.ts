import fs from 'node:fs';
import path from 'node:path';
import type { AraScannerInputReadiness } from '../types/ara-scanner.types';

const OFFICIAL_SOURCE = 'IDX_OFFICIAL_API';
const DEFAULT_ARTIFACT = path.join(process.cwd(), 'data', 'idx-uma', 'uma-index.json');
const MAX_ARTIFACT_AGE_HOURS = 72;
const REQUIRED_COVERAGE_DAYS = 30;

interface UmaAnnouncement {
  umaId: string;
  ticker: string;
  umaDate: string;
}

interface UmaArtifact {
  updatedAt: string;
  source: string;
  coverageFrom: string;
  coverageTo: string;
  count: number;
  tickerCount: number;
  tickers: Record<string, string[]>;
  announcements: UmaAnnouncement[];
}

export interface UmaArtifactProbe {
  verified: boolean;
  status: 'PARTIAL' | 'MISSING' | 'STALE';
  source: string | null;
  observedAt: string | null;
  count: number;
  tickerCount: number;
  coverageFrom: string | null;
  coverageTo: string | null;
  detail: string;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function missing(detail: string): UmaArtifactProbe {
  return {
    verified: false,
    status: 'MISSING',
    source: null,
    observedAt: null,
    count: 0,
    tickerCount: 0,
    coverageFrom: null,
    coverageTo: null,
    detail,
  };
}

/**
 * Membuktikan feed UMA dari artefak runtime resmi BEI.
 *
 * Tidak cukup bahwa berkasnya "ada": provenance, freshness, cakupan, jumlah, kode
 * emiten, dan indeks per-ticker semuanya harus konsisten. Satu kontradiksi membuat
 * probe gagal tertutup agar artefak korup tidak terbaca sebagai "tidak ada UMA".
 */
export function probeOfficialUmaArtifact(
  artifactPath = DEFAULT_ARTIFACT,
  now = new Date(),
): UmaArtifactProbe {
  let raw: string;
  try {
    raw = fs.readFileSync(artifactPath, 'utf8');
  } catch {
    return missing(`Artefak UMA resmi belum tersedia di ${artifactPath}.`);
  }

  let artifact: UmaArtifact;
  try {
    artifact = JSON.parse(raw) as UmaArtifact;
  } catch {
    return missing('Artefak UMA tidak dapat diparse sebagai JSON.');
  }

  if (artifact.source !== OFFICIAL_SOURCE) {
    return missing(`Provenance UMA ditolak: source=${String(artifact.source)}, wajib ${OFFICIAL_SOURCE}.`);
  }

  const observedMs = Date.parse(artifact.updatedAt);
  if (!Number.isFinite(observedMs)) {
    return missing('Artefak UMA tidak memiliki updatedAt yang sah.');
  }
  const ageHours = (now.getTime() - observedMs) / 3_600_000;
  if (ageHours < -1) {
    return missing('Artefak UMA bertanggal di masa depan; clock/provenance perlu diperiksa.');
  }

  const announcements = Array.isArray(artifact.announcements) ? artifact.announcements : [];
  const tickers = artifact.tickers && typeof artifact.tickers === 'object' ? artifact.tickers : {};
  if (!validDate(artifact.coverageFrom) || !validDate(artifact.coverageTo)
      || artifact.coverageFrom > artifact.coverageTo) {
    return missing('Rentang coverageFrom/coverageTo artefak UMA tidak sah.');
  }
  if (announcements.length === 0 || artifact.count !== announcements.length) {
    return missing('Jumlah pengumuman UMA kosong atau tidak konsisten dengan field count.');
  }

  const ids = new Set<string>();
  const codes = new Set<string>();
  for (const row of announcements) {
    if (!row || typeof row.umaId !== 'string' || ids.has(row.umaId)
        || typeof row.ticker !== 'string' || !/^[A-Z]{4}$/.test(row.ticker)
        || !validDate(row.umaDate)
        || row.umaDate < artifact.coverageFrom || row.umaDate > artifact.coverageTo) {
      return missing('Artefak UMA mengandung baris cacat, duplikat, atau di luar cakupan.');
    }
    ids.add(row.umaId);
    codes.add(row.ticker);
    if (!Array.isArray(tickers[row.ticker]) || !tickers[row.ticker].includes(row.umaDate)) {
      return missing(`Indeks per-ticker UMA tidak konsisten untuk ${row.ticker}.`);
    }
  }
  if (artifact.tickerCount !== codes.size || Object.keys(tickers).length !== codes.size) {
    return missing('Jumlah ticker UMA tidak konsisten dengan indeks per-ticker.');
  }

  const requiredFrom = new Date(now);
  requiredFrom.setUTCDate(requiredFrom.getUTCDate() - REQUIRED_COVERAGE_DAYS);
  const requiredFromDate = requiredFrom.toISOString().slice(0, 10);
  if (artifact.coverageFrom > requiredFromDate) {
    return missing(
      `Cakupan UMA hanya mulai ${artifact.coverageFrom}; wajib menutup sedikitnya ${REQUIRED_COVERAGE_DAYS} hari sejak ${requiredFromDate}.`,
    );
  }

  const base = {
    source: `${OFFICIAL_SOURCE} GetUMA via data/idx-uma`,
    observedAt: new Date(observedMs).toISOString(),
    count: artifact.count,
    tickerCount: artifact.tickerCount,
    coverageFrom: artifact.coverageFrom,
    coverageTo: artifact.coverageTo,
  };

  if (ageHours > MAX_ARTIFACT_AGE_HOURS) {
    return {
      ...base,
      verified: false,
      status: 'STALE',
      detail: `Artefak UMA resmi berumur ${ageHours.toFixed(1)} jam; batas ${MAX_ARTIFACT_AGE_HOURS} jam. Sync wajib dijalankan ulang.`,
    };
  }

  return {
    ...base,
    verified: true,
    status: 'PARTIAL',
    detail: `Feed UMA resmi terverifikasi: ${artifact.count} pengumuman, ${artifact.tickerCount} emiten, cakupan ${artifact.coverageFrom}..${artifact.coverageTo}. Status maksimal PARTIAL karena suspensi dan aksi korporasi belum dicakup feed ini.`,
  };
}

export function resolveTradingRestrictionsInput(
  probe: UmaArtifactProbe,
): AraScannerInputReadiness {
  return {
    key: 'TRADING_RESTRICTIONS',
    label: 'Status UMA, suspensi, dan aksi korporasi terbaru',
    status: probe.status,
    required: true,
    ownedBy: 'SAHAMLENS',
    source: probe.source,
    observedAt: probe.observedAt,
    detail: probe.verified
      ? `${probe.detail} Status READY di sini hanya membuktikan feed UMA; pemeriksaan suspensi/aksi korporasi tetap wajib fail-closed di execution layer.`
      : probe.detail,
  };
}
