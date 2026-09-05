import {
  ARA_SCANNER_INPUT_KEYS,
  ARA_SCANNER_GATE_VERSION,
  type AraScannerInputReadiness,
  type AraScannerReadiness,
} from '../types/ara-scanner.types';
import { ARA_SCANNER_POLICY } from '../config/ara-scanner-policy';

/**
 * Capability audit for the current SahamLens backend.
 *
 * PARTIAL means that a related dataset exists, but it does not satisfy the ARA
 * scanner contract. It must never be promoted to READY merely because a nearby
 * feature can provide one of the required fields.
 */
export const CURRENT_ARA_INPUT_READINESS: readonly AraScannerInputReadiness[] = [
  {
    key: 'ARA_CANDIDATES',
    label: 'Kandidat mendekati/menyentuh ARA',
    status: 'PARTIAL',
    required: true,
    source: 'LensScanner dan data harga intraday terpisah',
    observedAt: null,
    detail: 'Belum ada adaptor yang membentuk universe kandidat near-ARA dari harga pasar aktual.',
  },
  {
    key: 'ARA_LIMIT',
    label: 'Batas ARA sesuai aturan dan fraksi harga BEI',
    status: 'PARTIAL',
    required: true,
    source: 'Utilitas fraksi harga internal',
    observedAt: null,
    detail: 'Fraksi harga tersedia, tetapi aturan ARA aktif belum menjadi sumber terverifikasi dalam pipeline scanner.',
  },
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
    key: 'LIQUIDITY_PROXY',
    label: 'Proksi likuiditas: nilai transaksi, frekuensi, volume rata-rata',
    status: 'PARTIAL',
    required: true,
    ownedBy: 'SAHAMLENS',
    source: 'Ringkasan perdagangan harian dan OHLCV',
    observedAt: null,
    detail: 'Nilai transaksi dan volume tersedia, tetapi baseline likuiditas per saham belum dikontrakkan khusus untuk gerbang ARA. Ini pengganti order book yang sah untuk lapisan analisa, bukan substitusi kedalaman pasar.',
  },
  {
    key: 'BREAKOUT_PERSISTENCE',
    label: 'Persistensi breakout intraday',
    status: 'PARTIAL',
    required: true,
    source: 'Bar intraday 5 menit Yahoo',
    observedAt: null,
    detail: 'Bar historis intraday tersedia, tetapi belum ada state real-time untuk mengukur persistensi breakout ARA.',
  },
  {
    key: 'RELATIVE_TRADING_ACTIVITY',
    label: 'Volume dan nilai transaksi relatif real-time',
    status: 'PARTIAL',
    required: true,
    source: 'OHLCV dan ringkasan transaksi terpisah',
    observedAt: null,
    detail: 'Belum ada normalisasi volume dan nilai berjalan terhadap baseline pada timestamp yang sama.',
  },
  {
    key: 'MOMENTUM_EXHAUSTION',
    label: 'Deteksi rejection dan kelelahan momentum',
    status: 'PARTIAL',
    required: true,
    source: 'Analyzer teknikal umum',
    observedAt: null,
    detail: 'Analyzer momentum tersedia, tetapi belum menghasilkan kontrak rejection/exhaustion khusus ARA.',
  },
  {
    key: 'TRADING_RESTRICTIONS',
    label: 'Status UMA, suspensi, dan aksi korporasi terbaru',
    status: 'MISSING',
    required: true,
    source: null,
    observedAt: null,
    detail: 'Belum ada feed resmi terintegrasi yang memverifikasi seluruh pembatas dan aksi korporasi sebelum scan.',
  },
  {
    key: 'PRICE_CROSS_CHECK',
    label: 'Timestamp dan pemeriksaan silang harga',
    status: 'PARTIAL',
    required: true,
    source: 'Rekonsiliasi harga penutupan IDX vs Yahoo',
    observedAt: null,
    detail: 'Cross-check EOD tersedia, tetapi belum ada verifikasi harga intraday lintas sumber pada timestamp scan.',
  },
];

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
