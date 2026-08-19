export const displayTicker = (symbol: string) => symbol.replace('.JK', '');

export type ScoreBreakdown = { technical: number; fundamental: number; flow: number };

export type AiPickItem = {
  symbol: string;
  price: number;
  changePct: number;
  baseScore: number;
  /** Sinyal/event hari ini sebagai LABEL (breakout/golden cross/akumulasi) - sejak audit
   * skor 2026-08-05 TIDAK lagi menambah poin, menggantikan `bonuses` yang lama. */
  signals?: string[];
  finalScore: number;
  /** Kelengkapan data di balik skor (persen) - null/undefined untuk entri cache lama. */
  coverage?: number | null;
  flagged: boolean;
  flagReason: string | null;
  // Audit BUILD 003 (Explainable AI) - opsional (bukan required) supaya frontend
  // tidak error kalau response API sempat berasal dari cache lama sebelum field ini
  // ada (lihat guard `?? fallback` di ai-pick.service.ts rankAiPicks()).
  breakdown?: ScoreBreakdown;
  topReasons?: string[];
};

export type HorizonKey = 't1' | 't5' | 't20';
export type BucketBacktest = {
  ready: boolean;
  coverageDays: number;
  /** Ambang hari kalender sebelum tabel validasi ditampilkan (LENS_SCORE_MIN_HISTORY_DAYS). */
  minRequiredDays?: number;
  tradingDays: number;
  minDate: string | null;
  maxDate: string | null;
  roundTripCostPct: number;
  entryRule: string;
  buckets: {
    bucket: string;
    horizons: Record<HorizonKey, { avgReturnPct: number | null; winRatePct: number | null; samples: number }>;
  }[];
  tTests: Record<HorizonKey, {
    meanDiffPct: number | null;
    tStatistic: number | null;
    degreesOfFreedom: number | null;
    pValueApprox: number | null;
    significantAt5Pct: boolean;
    bucket80Better: boolean | null;
    samples80: number;
    samples60: number;
    note: string;
  }>;
  note: string | null;
};

export type RadarColumnKey = 'symbol' | 'price' | 'changePct' | 'finalScore' | 'technicalScore' | 'fundamentalScore' | 'flowScore' | 'coverage';

export interface RadarSortableColumn {
  key: RadarColumnKey;
  label: string;
  align?: 'right';
  getValue: (item: AiPickItem) => string | number | null | undefined;
}

export const RADAR_SORTABLE_COLUMNS: RadarSortableColumn[] = [
  { key: 'symbol', label: 'Saham', getValue: (i) => i.symbol },
  { key: 'price', label: 'Harga', align: 'right', getValue: (i) => i.price },
  { key: 'changePct', label: 'Chg', align: 'right', getValue: (i) => i.changePct },
  // Audit skor 2026-08-05: label "Skor (0-140)" dulu jujur menggambarkan implementasi
  // (skor 0-100 + bonus 0-40), tapi skala 0-140 itu sendiri yang salah - lihat catatan
  // lengkap di ai-pick.service.ts. Bonus sudah dihapus; skor sekarang benar-benar 0-100.
  { key: 'finalScore', label: 'Total', align: 'right', getValue: (i) => i.finalScore },
  // Breakdown dari calculateScore(): Technical maks 40, Fundamental maks 30, Flow maks
  // 30. Ditampilkan sebagai kolom terpisah agar skor tinggi tidak disalahbaca sebagai
  // "semua aspek kuat"; bisa saja dominan teknikal sementara fundamental minim data.
  { key: 'technicalScore', label: 'Teknikal', align: 'right', getValue: (i) => i.breakdown?.technical },
  { key: 'fundamentalScore', label: 'Fundamental', align: 'right', getValue: (i) => i.breakdown?.fundamental },
  { key: 'flowScore', label: 'Flow', align: 'right', getValue: (i) => i.breakdown?.flow },
  { key: 'coverage', label: 'Coverage', align: 'right', getValue: (i) => i.coverage },
];

export function compareRadarValues(a: string | number | null | undefined, b: string | number | null | undefined, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const result = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'id');
  return dir === 'asc' ? result : -result;
}

export function fmtBacktestPct(value: number | null): string {
  if (value == null) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function scoreBarWidth(value: number | null | undefined, max: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || max <= 0) return '0%';
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

