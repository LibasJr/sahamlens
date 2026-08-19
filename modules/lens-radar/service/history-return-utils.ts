export interface DatedCloseEntry {
  date: string;
  closePrice: number;
}

export const LENS_RADAR_HOLDING_DAYS = 20;
export const MAX_SANE_DAILY_MOVE = 0.4;

/**
 * Batas bawah tick IDX (saham "gocap"). Hanya boleh diterapkan pada harga RAW.
 * Harga TOTAL_RETURN_ADJUSTED bisa sah berada di bawah 50 setelah faktor split
 * dipakai mundur, jadi memfilter harga adjusted dengan ambang ini akan membuang
 * histori yang valid.
 */
export const MIN_TRADABLE_PRICE_IDR = 50;

/**
 * Drawdown terburuk antar trade, dalam persen (nilai <= 0).
 *
 * Metrik ini SENGAJA bukan drawdown equity curve. Sinyal LensRadar tumpang tindih:
 * ratusan ticker bisa memberi sinyal di hari yang sama, dan tiap trade T+20 masih
 * berjalan saat sinyal berikutnya muncul. Mengalikan ribuan return T+20 secara
 * berurutan seolah-olah satu modal berpindah trade menghasilkan volatility drag
 * (E[log(1+r)] < log(1+E[r])) yang menekan equity ke nol, sehingga drawdown selalu
 * jatuh ke -100% tanpa peduli kualitas sinyal. Lihat docs/operations/DEPLOYMENT.md.
 *
 * Drawdown level portofolio butuh position sizing dan aturan alokasi yang belum ada;
 * sampai itu dibangun, worst-trade adalah angka yang bisa dipertanggungjawabkan.
 */
export function worstTradeDrawdownPct(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((worst, value) => Math.min(worst, value), 0);
}

/**
 * Drawdown pada persentil 95, dalam persen (nilai <= 0): hanya 5% trade yang turun
 * lebih dalam dari angka ini.
 *
 * Persentil diambil dari BESARAN penurunan (nearest-rank), bukan dari nilai bertanda.
 * Mengurutkan drawdown bertanda menaik lalu mengambil P95 akan mengembalikan angka
 * paling dekat ke nol - yaitu trade yang nyaris tidak turun - sehingga justru
 * menyembunyikan risiko yang mau diukur.
 *
 * Berbeda dari worstTradeDrawdownPct yang hanya melihat satu trade terburuk, angka ini
 * tidak ikut bergerak saat satu emiten kolaps.
 */
export function drawdownPercentile95Pct(values: number[]): number | null {
  if (!values.length) return null;
  const magnitudes = values.map((value) => Math.abs(Math.min(0, value))).sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(magnitudes.length * 0.95));
  return -magnitudes[rank - 1];
}

/**
 * Kalender hari bursa dari tanggal yang ADA DI DATA.
 *
 * FALLBACK, bukan pilihan utama - lihat buildIdxTradingCalendar(). Kalender ini benar
 * hanya selama setidaknya satu ticker ter-scan pada setiap hari bursa. Kalau satu hari
 * gagal di-scan untuk SELURUH universe, hari itu lenyap dari kalender dan seluruh offset
 * T+5/T+20 bergeser satu hari untuk semua ticker, tanpa satu pun tanda di layar.
 */
export function buildTradingCalendar(rows: { date: string }[]): string[] {
  return Array.from(new Set(rows.map((row) => row.date))).sort();
}

export type TradingCalendarSource = 'IDX_BENCHMARK_BARS' | 'OBSERVED_SIGNAL_DATES';

export interface TradingCalendar {
  dates: string[];
  source: TradingCalendarSource;
}

/**
 * Kalender hari bursa IDX dari tanggal bar indeks acuan (^JKSE).
 *
 * BUG FIX (audit kuantitatif 2026-08-11, temuan M-14): kalender sebelumnya dibangun dari
 * tanggal yang kebetulan ada di lens_radar_history, bukan dari kalender bursa. Indeks
 * komposit diperdagangkan pada SETIAP hari bursa dan tidak pernah disuspensi, jadi
 * tanggal barnya ADALAH kalender bursa IDX - sumber yang benar dan sudah tersedia,
 * berbeda dari shared/calendar/idx-trading-calendar.ts yang sengaja hanya mengelola jam
 * sesi dan menyatakan sendiri bahwa hari libur bursa belum dikelola di sana.
 *
 * Kalau benchmark tidak tersedia (fetch gagal), fungsi ini jatuh balik ke tanggal yang
 * terobservasi dan MENYATAKANNYA lewat `source`. Sumbernya wajib ikut dilaporkan ke
 * pemanggil: kalender yang berbeda menghasilkan horizon yang berbeda, dan pembaca berhak
 * tahu yang mana yang dipakai.
 */
export function buildIdxTradingCalendar(
  benchmarkBarDates: string[],
  observedRows: { date: string }[]
): TradingCalendar {
  const benchmark = Array.from(new Set(benchmarkBarDates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))).sort();
  if (benchmark.length) return { dates: benchmark, source: 'IDX_BENCHMARK_BARS' };
  return { dates: buildTradingCalendar(observedRows), source: 'OBSERVED_SIGNAL_DATES' };
}

/**
 * Bar pada offset MAJU dari tanggal sinyal - toleransi hanya boleh ke depan.
 *
 * BUG FIX (audit kuantitatif 2026-08-11, temuan C-03): bar entry dulu dicari dengan
 * `barAtTradingOffset(byDate, calendar, signalIndex, 1)` yang toleransinya DUA ARAH.
 * Urutan probe-nya menjadi
 *
 *     signalIdx+1 -> signalIdx -> signalIdx+2 -> signalIdx-1 -> signalIdx+3
 *
 * dan probe KEDUA adalah tanggal sinyal itu sendiri - bar yang SELALU ada di `byDate`,
 * karena sinyalnya memang lahir dari bar itu. Jadi setiap kali ticker tidak punya baris
 * di hari bursa berikutnya (suspensi, hari scan yang terlewat, ticker yang baru masuk
 * universe, atau baris yang dibuang gerbang likuiditas), entry jatuh ke bar tanggal
 * sinyal dan `entryOpen` menjadi harga pembukaan hari itu - yaitu harga SEBELUM close
 * yang melahirkan sinyalnya diketahui. Probe keempat bahkan mundur satu hari lagi.
 *
 * Biasnya searah positif: skor memberi nilai penuh untuk volume yang mengonfirmasi
 * kenaikan hari itu, dan hari dengan close kuat cenderung dibuka lebih rendah daripada
 * close-nya. Sinyal jadi "dibeli" lebih murah daripada yang bisa dicapai siapa pun.
 *
 * Fungsi ini menutupnya dengan dua cara sekaligus: probe hanya maju, DAN ada penjaga
 * eksplisit `idx > fromIndex` supaya kombinasi argumen apa pun tetap tidak bisa memilih
 * bar pada/sebelum tanggal sinyal.
 */
export function barAtForwardTradingOffset<T extends { date: string }>(
  byDate: Map<string, T>,
  calendar: string[],
  fromIndex: number,
  offset: number,
  forwardTolerance = 2
): T | null {
  if (offset <= 0) return null;
  for (let probe = 0; probe <= forwardTolerance; probe++) {
    const idx = fromIndex + offset + probe;
    if (idx <= fromIndex) continue;
    if (idx >= calendar.length) return null;
    const bar = byDate.get(calendar[idx]!);
    if (bar) return bar;
  }
  return null;
}

export function barAtTradingOffset<T extends { date: string }>(
  byDate: Map<string, T>,
  calendar: string[],
  fromIndex: number,
  offset: number,
  tolerance = 2
): T | null {
  const target = fromIndex + offset;
  const probes = [0];
  for (let i = 1; i <= tolerance; i++) probes.push(-i, i);

  for (const probe of probes) {
    const idx = target + probe;
    if (idx < 0 || idx >= calendar.length) continue;
    const bar = byDate.get(calendar[idx]);
    if (bar) return bar;
  }
  return null;
}

export function hasCorporateActionGap(
  series: DatedCloseEntry[],
  fromDate: string,
  toDate: string,
  maxSaneDailyMove = MAX_SANE_DAILY_MOVE
): boolean {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const from = sorted.findIndex((row) => row.date === fromDate);
  const to = sorted.findIndex((row) => row.date === toDate);
  if (from < 0 || to < 0 || to <= from) return false;

  for (let i = from + 1; i <= to; i++) {
    const prev = sorted[i - 1]?.closePrice;
    const curr = sorted[i]?.closePrice;
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev <= 0 || curr <= 0) return true;
    if (Math.abs(curr / prev - 1) > maxSaneDailyMove) return true;
  }
  return false;
}

export function decorrelateByTicker<T extends { ticker: string; signalDate: string }>(
  observations: T[],
  holdingDays = LENS_RADAR_HOLDING_DAYS
): T[] {
  const calendar = buildTradingCalendar(observations.map((obs) => ({ date: obs.signalDate })));
  const calendarIndex = new Map(calendar.map((date, index) => [date, index]));
  const byTicker = new Map<string, T[]>();

  for (const obs of observations) {
    const list = byTicker.get(obs.ticker) ?? [];
    list.push(obs);
    byTicker.set(obs.ticker, list);
  }

  const kept: T[] = [];
  for (const list of Array.from(byTicker.values())) {
    list.sort((a: T, b: T) => a.signalDate.localeCompare(b.signalDate));
    let lastKeptCalendarIndex = -Infinity;
    for (const obs of list) {
      const idx = calendarIndex.get(obs.signalDate);
      if (idx == null) continue;
      if (idx - lastKeptCalendarIndex >= holdingDays) {
        kept.push(obs);
        lastKeptCalendarIndex = idx;
      }
    }
  }

  return kept;
}
