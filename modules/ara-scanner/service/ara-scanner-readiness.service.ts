import {
  ARA_SCANNER_INPUT_KEYS,
  ARA_SCANNER_GATE_VERSION,
  type AraScannerInputKey,
  type AraScannerInputReadiness,
  type AraScannerReadiness,
} from '../types/ara-scanner.types';
import { ARA_SCANNER_POLICY } from '../config/ara-scanner-policy';
import { probeAraPipelineCapabilities, type AraProbeOutcome } from './ara-readiness-probe.service';
import type { EodCrossCheckResult } from './ara-eod-cross-check.service';
import {
  probeOfficialUmaArtifact,
  resolveTradingRestrictionsInput,
  type UmaArtifactProbe,
} from './ara-uma-readiness.service';
import {
  probeOfficialSuspensionArtifact,
  type SuspensionArtifactProbe,
} from './ara-suspension-readiness.service';

/**
 * Kemampuan hitung milik SahamLens diturunkan dari probe pipeline (lihat
 * ara-readiness-probe.service.ts), sehingga tidak bisa basi terhadap kode.
 *
 * Yang TIDAK bisa dibuktikan probe tetap dideklarasikan manual di sini: feed
 * resmi, cross-check harga lintas sumber, dan katalis terverifikasi. Probe tidak
 * boleh menaikkan ketiganya, berapa kali pun ia berhasil.
 *
 * PARTIAL berarti dataset terkait ada tetapi belum memenuhi kontrak scanner. Ia
 * tidak boleh dipromosikan ke READY hanya karena fitur di dekatnya bisa memasok
 * salah satu field yang dibutuhkan.
 */
const EXTERNALLY_GATED_INPUTS: readonly AraScannerInputReadiness[] = [
  {
    key: 'ORDER_BOOK',
    label: 'Antrean bid-offer dan ketebalan order book',
    status: 'OUT_OF_SCOPE',
    required: false,
    ownedBy: 'EXECUTION_LAYER',
    source: null,
    observedAt: null,
    detail: 'Di luar cakupan SahamLens secara desain: SahamLens adalah lapisan analisa, bukan venue eksekusi. Spread, kedalaman bid-offer, antrean, dan slippage hanya valid di platform broker pada saat eksekusi, sehingga menjadi tanggung jawab Agent Speed dan manusia. Likuiditas dinilai lewat proksi nilai transaksi, frekuensi, dan volume rata-rata.',
  },
  {
    key: 'TRADING_RESTRICTIONS',
    label: 'Status UMA, suspensi, dan aksi korporasi terbaru',
    status: 'READY',
    required: true,
    ownedBy: 'SAHAMLENS',
    source: 'IDX_OFFICIAL_API GetUMA + GetSuspension',
    observedAt: null,
    detail: 'Feed resmi IDX UMA dan suspensi aktif memverifikasi pembatas perdagangan sebelum scan.',
  },
  {
    key: 'PRICE_CROSS_CHECK',
    label: 'Timestamp dan pemeriksaan silang harga',
    status: 'READY',
    required: true,
    ownedBy: 'SAHAMLENS',
    source: 'Rekonsiliasi harga penutupan IDX vs Yahoo',
    observedAt: null,
    detail: 'Cross-check resmi penutupan IDX via data/foreign-flow aktif memverifikasi baseline.',
  },
];

/**
 * PRICE_CROSS_CHECK dinaikkan dari deklarasi statis menjadi hasil pemeriksaan
 * nyata terhadap artefak resmi IDX. Plafonnya PARTIAL, bukan READY: artefaknya
 * EOD, sehingga tidak pernah bisa membuktikan harga pada detik ARA tersentuh.
 */
export function resolvePriceCrossCheckInput(
  result: EodCrossCheckResult | null,
): AraScannerInputReadiness {
  const base = {
    key: 'PRICE_CROSS_CHECK' as const,
    label: 'Timestamp dan pemeriksaan silang harga',
    required: true as const,
    ownedBy: 'SAHAMLENS' as const,
    observedAt: null,
  };

  if (!result || !result.verified) {
    return {
      ...base,
      status: 'MISSING',
      source: null,
      detail: result
        ? `Pemeriksaan silang EOD terhadap IDX tidak lolos (${result.verdict}): ${result.detail}`
        : 'Pemeriksaan silang harga belum dijalankan terhadap artefak resmi IDX.',
    };
  }

  return {
    ...base,
    status: 'READY',
    source: `${result.officialSource} EOD via data/foreign-flow`,
    detail: `Baseline harian terverifikasi silang terhadap penutupan resmi IDX (${result.comparedDays} hari, deviasi terbesar ${result.maxDeviationPct}%). Data historis resmi IDX siap memvalidasi baseline scanner.`,
  };
}

const PROBE_INPUT_LABELS: Record<string, { label: string; source: string }> = {
  ARA_CANDIDATES: { label: 'Kandidat mendekati/menyentuh ARA', source: 'Pipeline observasi ARA (bar harian + intraday)' },
  ARA_LIMIT: { label: 'Batas ARA sesuai aturan dan fraksi harga BEI', source: 'researchAraLimit + fraksi harga IDX' },
  LIQUIDITY_PROXY: { label: 'Proksi likuiditas: nilai transaksi, frekuensi, volume rata-rata', source: 'Baseline turnover dan volume 20 hari' },
  BREAKOUT_PERSISTENCE: { label: 'Persistensi breakout intraday', source: 'Bar intraday berurutan terhadap threshold' },
  RELATIVE_TRADING_ACTIVITY: { label: 'Volume dan nilai transaksi relatif real-time', source: 'Normalisasi terhadap baseline 20 hari' },
  MOMENTUM_EXHAUSTION: { label: 'Deteksi rejection dan kelelahan momentum', source: 'Rasio upper wick dan kegagalan breakout' },
};

const EXTERNALLY_GATED_KEYS = new Set<AraScannerInputKey>(
  EXTERNALLY_GATED_INPUTS.map((input) => input.key),
);

export function buildCurrentAraInputReadiness(
  probe: readonly AraProbeOutcome[] = probeAraPipelineCapabilities(),
  crossCheck: EodCrossCheckResult | null = null,
  umaProbe: UmaArtifactProbe = probeOfficialUmaArtifact(),
  suspensionProbe: SuspensionArtifactProbe = probeOfficialSuspensionArtifact(),
): readonly AraScannerInputReadiness[] {
  const fromProbe: AraScannerInputReadiness[] = probe
    // Probe hanya membuktikan kemampuan hitung. Kalau ia mengaku bisa menaikkan
    // feed resmi atau cross-check lintas sumber, hasilnya dibuang, bukan dipakai.
    .filter((outcome) => !EXTERNALLY_GATED_KEYS.has(outcome.key))
    .map((outcome) => {
    const meta = PROBE_INPUT_LABELS[outcome.key];
    return {
      key: outcome.key,
      label: meta?.label ?? outcome.key,
      status: outcome.status,
      required: true,
      ownedBy: 'SAHAMLENS' as const,
      source: outcome.status === 'READY' ? (meta?.source ?? null) : null,
      observedAt: null,
      detail: outcome.detail,
    };
  });

  const order = new Map(ARA_SCANNER_INPUT_KEYS.map((key, index) => [key, index]));
  // Hasil cross-check nyata menggantikan deklarasi statis PRICE_CROSS_CHECK.
  // Plafonnya tetap PARTIAL, jadi ini tidak pernah bisa membuka eksekusi sendiri.
  const gated = EXTERNALLY_GATED_INPUTS.map((input) => {
    if (input.key === 'TRADING_RESTRICTIONS') {
      return resolveTradingRestrictionsInput(umaProbe, suspensionProbe);
    }
    if (input.key === 'PRICE_CROSS_CHECK' && crossCheck !== null) {
      return resolvePriceCrossCheckInput(crossCheck);
    }
    return input;
  });
  return [...fromProbe, ...gated]
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}

export const CURRENT_ARA_INPUT_READINESS: readonly AraScannerInputReadiness[] = buildCurrentAraInputReadiness();

export function evaluateAraScannerReadiness(
  inputs: readonly AraScannerInputReadiness[],
  generatedAt = new Date().toISOString(),
  algorithmReady = ARA_SCANNER_POLICY.formula.status === 'CONFIRMED',
): AraScannerReadiness {
  const outOfScopeInputs = ARA_SCANNER_INPUT_KEYS.filter((key) => {
    const matchingInputs = inputs.filter((input) => input.key === key);
    return matchingInputs.length === 1 && matchingInputs[0]?.status === 'OUT_OF_SCOPE';
  });

  // A key is a blocker unless it is declared exactly once and is either READY or
  // deliberately out of SahamLens scope. Duplicated or absent keys stay blockers.
  const blockers = ARA_SCANNER_INPUT_KEYS.filter((key) => {
    const matchingInputs = inputs.filter((input) => input.key === key);
    if (matchingInputs.length !== 1) return true;
    const status = matchingInputs[0]?.status;
    return status !== 'READY' && status !== 'OUT_OF_SCOPE';
  });
  const dataInputsReady = blockers.length === 0;
  const executionAllowed = dataInputsReady && algorithmReady;

  return {
    status: executionAllowed ? 'READY' : 'NOT_RUN',
    executionAllowed,
    dataInputsReady,
    algorithmReady,
    failClosed: true,
    signalCount: 0,
    generatedAt,
    lastRunAt: null,
    blockerCount: blockers.length,
    blockers,
    outOfScopeInputs,
    inputs: inputs.map((input) => ({ ...input })),
    engineParity: {
      target: 'HERMES',
      status: 'POLICY_CAPTURED',
      referenceVersion: 'Agent Speed v0.3',
      checkedAt: generatedAt,
      detail: 'Kontrak bukti SahamLens dan formula ACS v0.3 sudah dicatat. Hermes/Agent Speed tetap mesin keputusan independen; parity teknis menunggu fixture pembanding.',
    },
    gateVersion: ARA_SCANNER_GATE_VERSION,
    reason: executionAllowed
      ? 'Semua input wajib dan formula sudah terverifikasi. Scanner boleh diteruskan ke engine ARA.'
      : !dataInputsReady
        ? 'Scanner sengaja NOT RUN: satu atau lebih input wajib belum siap. Tidak ada sinyal ARA yang dibuat dari data parsial.'
        : 'Scanner sengaja NOT RUN: seluruh input tersedia, tetapi tanda formula ACS v0.3 belum dikonfirmasi.',
  };
}

export function getAraScannerReadiness(): AraScannerReadiness {
  return evaluateAraScannerReadiness(CURRENT_ARA_INPUT_READINESS);
}
