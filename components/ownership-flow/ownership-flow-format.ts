// FORMATTER BERSAMA UNTUK UI OWNERSHIP FLOW.
//
// Dipakai halaman /ownership-flow DAN kartu ringkas di halaman detail saham.
// Satu tempat, karena aturan penulisan angkanya bukan selera tampilan melainkan
// soal ketepatan makna:
//
//   - Persentase kepemilikan ditulis dengan "%"      -> 42,75%
//   - PERUBAHAN kepemilikan ditulis dengan "pp"      -> +0,51 pp
//
// Menukar keduanya membuat pembaca menyimpulkan besaran yang salah: 40% -> 41%
// adalah +1 pp, sedangkan perubahan relatifnya +2,5%. Lihat §36.

export type OwnershipTrendKey =
  | 'FOREIGN_ACCUMULATION'
  | 'FOREIGN_DISTRIBUTION'
  | 'STABLE'
  | 'DATA_ONLY'
  | 'INSUFFICIENT_DATA';

export type FreshnessKey = 'FRESH' | 'STALE' | 'MISSING';

type BadgeVariant = 'neutral' | 'success' | 'danger' | 'warning' | 'gold' | 'info';

export interface OwnershipFlowApiRow {
  ticker: string;
  observedDate: string | null;
  foreignPct: number | null;
  localPct: number | null;
  delta: { '1d': number | null; '7d': number | null; '30d': number | null };
  deltaGapDays: { '1d': number | null; '7d': number | null; '30d': number | null };
  previous: {
    basisObservedDate: string | null;
    actualGapDays: number | null;
    foreignPp: number | null;
    localPp: number | null;
    scriplessPp: number | null;
    structuralBreak: boolean;
    structuralBreakReason: 'TOTAL_SECURITIES_CHANGED' | null;
    basisTotalSecurities: number | null;
    currentTotalSecurities: number | null;
  };
  trend: OwnershipTrendKey;
  freshness: FreshnessKey;
  ageDays: number | null;
}

export interface OwnershipFlowApiResponse {
  source: { id: string; name: string; baseUrl: string; cadence: string; auditStatus: string };
  universeSize: number;
  latestObservedDate: string | null;
  coverage: {
    tickersWithData: number;
    tickersOnLatestDate: number;
    totalObservations: number;
    firstObservedDate: string | null;
  };
  deltaUnit: string;
  experimental: boolean;
  inFinalScore: boolean;
  rows: OwnershipFlowApiRow[];
}

/** Persentase kepemilikan. Nilai null ditulis "—", TIDAK PERNAH "0%". */
export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/**
 * Perubahan kepemilikan dalam percentage point.
 *
 * null ditulis "—" dan bukan "0,00 pp": tidak adanya pembanding BUKAN berarti
 * kepemilikan tidak berubah. Nol adalah pengukuran; tanda pisah adalah kejujuran.
 */
export function formatPpCell(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Versi lengkap dengan satuan - dipakai di kartu, bukan di sel tabel sempit. */
export function formatPpWithUnit(value: number | null): string {
  const cell = formatPpCell(value);
  return cell === '—' ? cell : `${cell} pp`;
}

/** "15 Agu 2026". null -> "Belum ada data". */
export function formatObservedDate(value: string | null): string {
  if (!value) return 'Belum ada data';
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Label tren.
 *
 * Perhatikan tidak ada satu pun label transaksi (BELI/JUAL) di sini, dan
 * DATA_ONLY sengaja memakai kata "hanya data" - selama ambang belum divalidasi,
 * yang kita punya memang cuma angkanya.
 */
export const TREND_LABEL: Record<OwnershipTrendKey, { label: string; variant: BadgeVariant }> = {
  FOREIGN_ACCUMULATION: { label: 'Akumulasi asing', variant: 'success' },
  FOREIGN_DISTRIBUTION: { label: 'Distribusi asing', variant: 'danger' },
  STABLE: { label: 'Stabil', variant: 'neutral' },
  DATA_ONLY: { label: 'Hanya data', variant: 'info' },
  INSUFFICIENT_DATA: { label: 'Data belum cukup', variant: 'neutral' },
};

export const FRESHNESS_LABEL: Record<FreshnessKey, { label: string; variant: BadgeVariant }> = {
  FRESH: { label: 'Segar', variant: 'success' },
  STALE: { label: 'Basi', variant: 'warning' },
  MISSING: { label: 'Kosong', variant: 'neutral' },
};
