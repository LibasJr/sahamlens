/**
 * PENGGABUNGAN PERIODE EARNINGS (2026-08-12).
 *
 * MASALAH YANG DIUKUR, BUKAN DIDUGA. Halaman /earnings membaca `earnings.earningsChart`
 * dari quoteSummary. Diukur langsung ke Yahoo pada 2026-08-12:
 *
 *   BBCA  earningsChart : 2025-09-30 2025-12-31 2026-03-31 2026-06-30      (4)
 *         timeSeries    : 2025-03-31 2025-06-30 2025-12-31 2026-03-31 2026-06-30  (5)
 *   PTBA  earningsChart : 2025-06-30 2025-09-30 2026-03-31                 (3)
 *         timeSeries    : 2024-12-31 2025-03-31 2025-06-30 2025-12-31 2026-03-31  (5)
 *
 * Dua hal sekaligus terlihat di situ:
 *
 * 1. LUBANGNYA SALING MELENGKAPI. `earningsChart` punya 2025-09-30 yang tidak ada di
 *    `timeSeries`; `timeSeries` punya 2025-12-31 dan 2025-03-31 yang tidak ada di
 *    `earningsChart`. Digabung, PTBA naik dari 3 ke 6 kuartal dan BBCA dari 4 ke 6.
 *
 * 2. DERETNYA TIDAK BERSAMBUNG. PTBA melompat 2025-09-30 langsung ke 2026-03-31 - kuartal
 *    Desember hilang. Menggambar deret itu berurutan menyiratkan kesinambungan yang tidak
 *    ada, dan pembaca akan membaca lompatan sebagai perubahan nyata. Lubang harus tampil
 *    SEBAGAI lubang.
 *
 * Modul ini murni: tidak ada jaringan, jadi perilakunya bisa diuji atas deret yang benar-
 * benar terjadi di atas.
 */

export interface MergeablePeriod {
  periodEnd: string | null;
  revenue?: number | null;
  netIncome?: number | null;
  profitMargin?: number | null;
  [key: string]: unknown;
}

export interface QuarterlyFinancialRow {
  periodEnd: string;
  revenue: number | null;
  netIncome: number | null;
  operatingIncome: number | null;
}

function isoQuarterEnd(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Kuartal kalender yang SEHARUSNYA ada di antara periode pertama dan terakhir, tetapi
 * tidak ada di data. Dihitung dari bulan akhir kuartal (3/6/9/12), bukan dari jarak hari -
 * emiten dengan tahun buku non-kalender akan menghasilkan daftar yang salah, jadi periode
 * yang bulannya bukan akhir kuartal DILEWATI, bukan dipaksa masuk pola.
 */
export function findMissingQuarters(periodEnds: string[]): string[] {
  const valid = periodEnds
    .map(isoQuarterEnd)
    .filter((d): d is string => d != null && [3, 6, 9, 12].includes(Number(d.slice(5, 7))))
    .sort();
  if (valid.length < 2) return [];

  const toIndex = (d: string) => Number(d.slice(0, 4)) * 4 + (Number(d.slice(5, 7)) / 3 - 1);
  const ada = new Set(valid.map(toIndex));
  const first = toIndex(valid[0]!);
  const last = toIndex(valid[valid.length - 1]!);

  const hilang: string[] = [];
  for (let i = first + 1; i < last; i++) {
    if (ada.has(i)) continue;
    const year = Math.floor(i / 4);
    const month = ((i % 4) + 1) * 3;
    // Hari terakhir bulan itu.
    const end = new Date(Date.UTC(year, month, 0));
    hilang.push(end.toISOString().slice(0, 10));
  }
  return hilang;
}

export interface MergeResult<T extends MergeablePeriod> {
  periods: T[];
  /** Kuartal yang tidak ada datanya sama sekali di antara periode pertama & terakhir. */
  missingQuarters: string[];
  /** Berapa periode yang datangnya HANYA dari deret waktu, tidak ada di earningsChart. */
  addedFromTimeSeries: number;
  /** Berapa periode yang angka keuangannya tadinya kosong lalu terisi dari deret waktu. */
  filledFromTimeSeries: number;
}

/**
 * Gabungkan kuartal `earningsChart` dengan deret keuangan kuartalan.
 *
 * ATURAN PRIORITAS. Nilai yang SUDAH ADA tidak pernah ditimpa - `earningsChart` adalah
 * satu-satunya sumber EPS aktual/estimasi/surprise, dan deret waktu tidak punya itu.
 * Deret waktu hanya MENGISI yang kosong dan MENAMBAH periode yang belum ada. Menimpa akan
 * menukar sumber di tengah deret tanpa ada yang tahu.
 */
export function mergeQuarterlyFinancials<T extends MergeablePeriod>(
  base: T[],
  financials: QuarterlyFinancialRow[],
  makePeriod: (row: QuarterlyFinancialRow) => T,
): MergeResult<T> {
  const byPeriod = new Map<string, T>();
  for (const item of base) {
    const key = isoQuarterEnd(item.periodEnd);
    if (key) byPeriod.set(key, item);
  }

  let added = 0;
  let filled = 0;

  for (const row of financials) {
    const key = isoQuarterEnd(row.periodEnd);
    if (!key) continue;
    const existing = byPeriod.get(key);
    if (!existing) {
      byPeriod.set(key, makePeriod(row));
      added++;
      continue;
    }
    let terisi = false;
    if (numberOrNull(existing.revenue) == null && row.revenue != null) {
      (existing as MergeablePeriod).revenue = row.revenue;
      terisi = true;
    }
    if (numberOrNull(existing.netIncome) == null && row.netIncome != null) {
      (existing as MergeablePeriod).netIncome = row.netIncome;
      terisi = true;
    }
    if (
      numberOrNull(existing.profitMargin) == null
      && row.netIncome != null && row.revenue != null && row.revenue > 0
    ) {
      // Disimpan sebagai FRAKSI, sama seperti profitMargin milik Yahoo di jalur lama -
      // mencampur fraksi dan persen di satu kolom adalah cara paling cepat membuat angka
      // 0,51 dan 51 tampil berdampingan tanpa ada yang menyadarinya.
      (existing as MergeablePeriod).profitMargin = row.netIncome / row.revenue;
      terisi = true;
    }
    if (terisi) filled++;
  }

  const periods = Array.from(byPeriod.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);

  return {
    periods,
    missingQuarters: findMissingQuarters(periods.map((p) => p.periodEnd ?? '')),
    addedFromTimeSeries: added,
    filledFromTimeSeries: filled,
  };
}
