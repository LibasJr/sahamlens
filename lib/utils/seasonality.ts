export interface MonthlyReturnData {
  year: number;
  months: (number | null)[]; // 12 elements (index 0 = Jan, index 11 = Dec), null if no data
}

export interface SeasonalitySummary {
  matrix: MonthlyReturnData[];
  monthAverages: (number | null)[]; // 12 elements (average % return per month)
  monthWinRates: (number | null)[]; // 12 elements (% of positive months)
  monthCounts: number[]; // 12 elements (number of sample years with data)
  bestMonth: { monthIndex: number; monthName: string; avgReturn: number } | null;
  worstMonth: { monthIndex: number; monthName: string; avgReturn: number } | null;
  /** `'TOTAL_RETURN_ADJUSTED'` = return sah. `'UNAVAILABLE'` = tidak dihitung, lihat catatan. */
  basis: 'TOTAL_RETURN_ADJUSTED' | 'UNAVAILABLE';
  /** Alasan `basis === 'UNAVAILABLE'`. Kosong kalau matriks terhitung. */
  unavailableReason: string | null;
}

export const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

export interface SeasonalityCandle {
  date?: string | number | Date;
  time?: string | number;
  /** Harga perdagangan. TIDAK dipakai menghitung return - lihat catatan H-03 di bawah. */
  close?: number;
  /** Adjusted close (dividen + split). SATU-SATUNYA basis return yang sah di sini. */
  adjClose?: number | null;
}

// ZONA WAKTU BURSA, BUKAN ZONA WAKTU SERVER (temuan M-06).
//
// Versi sebelumnya mengelompokkan bar dengan `Date#getFullYear()`/`getMonth()`, yang
// membaca zona waktu proses Node. Pada server dengan offset negatif terhadap UTC, bar
// bursa tanggal 1 masuk ke ember bulan sebelumnya - matriks musiman jadi bergantung pada
// lokasi deploy, bug yang tidak pernah muncul saat dikembangkan di WIB. Konvensi proyek
// untuk ini sudah ada di shared/market/previous-close.ts dan trading-session.ts.
const JAKARTA_MONTH_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
});

function jakartaYearMonth(date: Date): { year: number; month: number } | null {
  const parts = JAKARTA_MONTH_KEY.formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month: month - 1 }; // month 0-11
}

/** Nomor bulan absolut, untuk memeriksa dua bulan benar-benar bersebelahan. */
function monthOrdinal(year: number, month: number): number {
  return year * 12 + month;
}

function emptySummary(reason: string | null): SeasonalitySummary {
  return {
    matrix: [],
    monthAverages: Array(12).fill(null),
    monthWinRates: Array(12).fill(null),
    monthCounts: Array(12).fill(0),
    bestMonth: null,
    worstMonth: null,
    basis: reason == null ? 'TOTAL_RETURN_ADJUSTED' : 'UNAVAILABLE',
    unavailableReason: reason,
  };
}

/**
 * Matriks return bulanan per tahun, beserta rata-rata & win rate per bulan.
 *
 * BASIS HARGA: ADJUSTED CLOSE, WAJIB (temuan H-03, audit kuantitatif 2026-08-19).
 *
 * Versi sebelumnya menghitung return dari `close` - harga perdagangan yang oleh provider
 * hanya disesuaikan terhadap stock split, bukan dividen (lihat `TRADING_PRICE_BASIS` vs
 * `RETURN_PRICE_BASIS` di shared/market/price-basis.ts; konstanta yang tepat sudah ada
 * dan tidak pernah dipakai di sini). Akibatnya setiap bulan cum-dividen mencatat
 * penurunan harga ex-date sebagai return bulanan negatif yang sesungguhnya tidak pernah
 * dialami pemegang saham. Untuk emiten IDX ber-yield tinggi (PTBA, ITMG, HMSP, UNVR,
 * TLKM, BBCA) distorsinya beberapa poin persen pada bulan pembayaran, dan SELALU satu
 * arah - sehingga bulan pembayaran dividen sistematis tampak sebagai bulan terburuk,
 * persis kebalikan dari kesimpulan yang benar.
 *
 * Kalau adjusted close tidak tersedia, fungsi ini TIDAK jatuh balik ke `close`. Ia
 * mengembalikan `basis: 'UNAVAILABLE'` beserta alasannya, dan pemanggil menampilkan
 * status itu - lebih baik tidak ada matriks daripada matriks yang salah arah.
 */
export function calculateMonthlySeasonality(candles: SeasonalityCandle[]): SeasonalitySummary {
  if (!candles || candles.length === 0) return emptySummary('Tidak ada data harga.');

  const parsed = candles
    .map((c) => {
      let d: Date;
      if (c.date) {
        d = new Date(c.date);
      } else if (c.time) {
        d = typeof c.time === 'number' ? new Date(c.time * 1000) : new Date(c.time);
      } else {
        return null;
      }
      const adj = c.adjClose;
      if (isNaN(d.getTime()) || typeof adj !== 'number' || !Number.isFinite(adj) || adj <= 0) {
        return null;
      }
      const ym = jakartaYearMonth(d);
      return ym == null ? null : { ...ym, adjClose: adj, time: d.getTime() };
    })
    .filter((c): c is { year: number; month: number; adjClose: number; time: number } => c !== null)
    .sort((a, b) => a.time - b.time);

  if (parsed.length === 0) {
    return emptySummary(
      'Harga adjusted close (basis total return) tidak tersedia dari sumber data untuk emiten ini, '
        + 'sehingga return musiman tidak dihitung. Return dari harga perdagangan akan mencatat '
        + 'setiap bulan ex-dividen sebagai rugi yang tidak pernah terjadi.',
    );
  }

  // Penutupan adjusted TERAKHIR tiap bulan kalender WIB.
  const monthMap = new Map<string, { year: number; month: number; firstClose: number; lastClose: number }>();
  for (const c of parsed) {
    const key = `${c.year}-${String(c.month).padStart(2, '0')}`;
    const existing = monthMap.get(key);
    if (!existing) {
      monthMap.set(key, { year: c.year, month: c.month, firstClose: c.adjClose, lastClose: c.adjClose });
    } else {
      existing.lastClose = c.adjClose;
    }
  }

  const sortedMonthKeys = Array.from(monthMap.keys()).sort();
  const returnMap = new Map<string, number>();

  for (let i = 0; i < sortedMonthKeys.length; i++) {
    const key = sortedMonthKeys[i];
    const current = monthMap.get(key)!;
    const prevKey = sortedMonthKeys[i - 1];
    const prev = prevKey ? monthMap.get(prevKey) : null;

    // BUG FIX (temuan M-05): `prev` adalah entri SEBELUMNYA dalam array terurut, yang
    // belum tentu bulan kalender sebelumnya. Komentar versi lama mengklaim ada
    // pemeriksaan "continuous sequence" yang tidak pernah ditulis, sehingga emiten dengan
    // bulan hilang (suspensi, jeda perdagangan) mendapat return MULTI-BULAN yang
    // diatribusikan ke satu sel matriks - saham yang disuspensi 3 bulan menampilkan
    // lonjakan raksasa pada satu bulan. Sekarang kontinuitasnya benar-benar diperiksa.
    const isContiguous =
      prev != null &&
      monthOrdinal(current.year, current.month) - monthOrdinal(prev.year, prev.month) === 1;

    if (!isContiguous) {
      // Bulan pertama, atau ada lubang sebelum bulan ini. Tidak ada acuan bulan
      // sebelumnya yang sah, jadi selnya dibiarkan kosong - bukan diisi return
      // dalam-bulan yang tidak sebanding dengan sel lain.
      continue;
    }

    if (!(prev!.lastClose > 0)) continue;
    const ret = ((current.lastClose - prev!.lastClose) / prev!.lastClose) * 100;
    if (!Number.isFinite(ret)) continue;
    returnMap.set(key, parseFloat(ret.toFixed(2)));
  }

  if (returnMap.size === 0) {
    return emptySummary('Belum ada dua bulan kalender berurutan dengan data untuk menghitung return bulanan.');
  }

  const years = Array.from(new Set(Array.from(monthMap.values()).map((v) => v.year))).sort((a, b) => b - a);

  const matrix: MonthlyReturnData[] = years.map((year) => {
    const months: (number | null)[] = [];
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      months.push(returnMap.has(key) ? returnMap.get(key)! : null);
    }
    return { year, months };
  });

  const monthAverages: (number | null)[] = [];
  const monthWinRates: (number | null)[] = [];
  const monthCounts: number[] = [];

  for (let m = 0; m < 12; m++) {
    const values: number[] = [];
    for (const row of matrix) {
      const val = row.months[m];
      if (val !== null && !isNaN(val)) values.push(val);
    }

    monthCounts.push(values.length);
    if (values.length === 0) {
      monthAverages.push(null);
      monthWinRates.push(null);
    } else {
      const avg = values.reduce((acc, v) => acc + v, 0) / values.length;
      const winRate = (values.filter((v) => v > 0).length / values.length) * 100;
      monthAverages.push(parseFloat(avg.toFixed(2)));
      monthWinRates.push(parseFloat(winRate.toFixed(1)));
    }
  }

  let bestMonth: SeasonalitySummary['bestMonth'] = null;
  let worstMonth: SeasonalitySummary['worstMonth'] = null;

  monthAverages.forEach((avg, idx) => {
    if (avg !== null && monthCounts[idx] >= 2) {
      if (!bestMonth || avg > bestMonth.avgReturn) {
        bestMonth = { monthIndex: idx, monthName: MONTH_NAMES_SHORT[idx], avgReturn: avg };
      }
      if (!worstMonth || avg < worstMonth.avgReturn) {
        worstMonth = { monthIndex: idx, monthName: MONTH_NAMES_SHORT[idx], avgReturn: avg };
      }
    }
  });

  return {
    matrix,
    monthAverages,
    monthWinRates,
    monthCounts,
    bestMonth,
    worstMonth,
    basis: 'TOTAL_RETURN_ADJUSTED',
    unavailableReason: null,
  };
}
