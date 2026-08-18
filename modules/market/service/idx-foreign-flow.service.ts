import fs from 'fs';
import path from 'path';

// Arus dana asing RESMI per emiten - Net Foreign Buy/Sell yang diumumkan Bursa Efek
// Indonesia sendiri lewat endpoint publik ListedCompany/GetTradingInfoSS, BUKAN proxy
// tekanan beli/jual hasil hitungan dari harga+volume (lihat foreign-flow-proxy.ts yang
// kini hanya dipakai sebagai fallback saat artefak resmi belum tersedia untuk sebuah
// emiten). Perbedaannya bukan kosmetik: ForeignBuy/ForeignSell adalah lembar saham yang
// benar-benar ditransaksikan investor asing menurut catatan Bursa, sedangkan CMF hanya
// menyimpulkan tekanan beli/jual dari posisi close di dalam range harian.
//
// Artefaknya ditulis oleh scripts/sync-idx-foreign-flow.py, bukan di-fetch dari sini:
// idx.co.id berada di belakang Cloudflare yang menolak klien tanpa fingerprint TLS
// browser (403), sehingga fetch() dari Node tidak bisa dipakai. Skrip Python memakai
// curl_cffi impersonate="chrome124" dan menyimpan hasilnya ke data/foreign-flow/.
//
// ZERO DUMMY: modul ini tidak pernah mengarang, menambal, atau menginterpolasi angka.
// Baris yang tidak lengkap DIBUANG, emiten tanpa artefak mengembalikan null - supaya
// pemanggil menangani ketidaktersediaan data secara eksplisit, bukan menampilkan angka
// yang tidak berasal dari Bursa.

export const IDX_FOREIGN_FLOW_SOURCE = 'IDX_OFFICIAL_API' as const;

/** Satu lot = 100 lembar saham (aturan Bursa Efek Indonesia sejak 2014). */
const SHARES_PER_LOT = 100;

export interface IdxForeignFlowPoint {
  date: string;
  close: number;
  volume: number;
  /** Volume LEMBAR saham yang dibeli investor asing (bukan Rupiah). */
  foreignBuy: number;
  /** Volume LEMBAR saham yang dijual investor asing (bukan Rupiah). */
  foreignSell: number;
  netForeignVolume: number;
  netForeignValueBillion: number;
}

export interface IdxForeignFlowSeries {
  ticker: string;
  source: typeof IDX_FOREIGN_FLOW_SOURCE;
  /** Kapan artefak terakhir disinkronkan dari BEI, null kalau file lama tidak mencatatnya. */
  updatedAt: string | null;
  history: IdxForeignFlowPoint[];
}

export type ForeignFlowStatus = 'AKUMULASI' | 'DISTRIBUSI' | 'NETRAL';

export interface IdxForeignFlowSummary {
  status: ForeignFlowStatus;
  netTodayBillion: number | null;
  netTodayLot: number | null;
  net5DBillion: number | null;
  accumulationStreak: number;
  distributionStreak: number;
  foreignBuyVolume: number | null;
  foreignSellVolume: number | null;
  foreignParticipationPct: number | null;
  latestDate: string | null;
  latestClose: number | null;
}

export interface ForeignFlowReadOptions {
  /** Folder artefak. Default `<cwd>/data/foreign-flow`. Diisi eksplisit oleh test. */
  dataDir?: string;
}

// Kode emiten IDX selalu 4 huruf. Pola ketat ini sekaligus mencegah path traversal -
// nama file dibentuk dari input pemanggil, jadi "../../package" tidak boleh pernah
// lolos jadi bagian path.
const TICKER_PATTERN = /^[A-Z]{4}$/;

function defaultDataDir(): string {
  return path.join(process.cwd(), 'data', 'foreign-flow');
}

function normalizeTicker(raw: string): string | null {
  const ticker = String(raw || '').trim().toUpperCase().replace(/\.JK$/, '');
  return TICKER_PATTERN.test(ticker) ? ticker : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Ubah satu baris artefak jadi titik histori tervalidasi, atau null kalau cacat. */
function toPoint(raw: unknown): IdxForeignFlowPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const date = typeof row.date === 'string' ? row.date.slice(0, 10) : null;
  const close = finiteNumber(row.close);
  const foreignBuy = finiteNumber(row.foreignBuy);
  const foreignSell = finiteNumber(row.foreignSell);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (close === null || close <= 0) return null;
  if (foreignBuy === null || foreignSell === null) return null;
  if (foreignBuy < 0 || foreignSell < 0) return null;

  const volume = finiteNumber(row.volume);
  const netForeignVolume = finiteNumber(row.netForeignVolume) ?? foreignBuy - foreignSell;
  // netForeignValueBillion dihitung ulang di sini kalau artefak tidak memuatnya -
  // rumusnya (net lembar x harga penutupan) sama persis dengan skrip sinkronisasi.
  const netForeignValueBillion =
    finiteNumber(row.netForeignValueBillion) ?? (netForeignVolume * close) / 1_000_000_000;

  return {
    date,
    close,
    volume: volume !== null && volume >= 0 ? volume : 0,
    foreignBuy,
    foreignSell,
    netForeignVolume,
    netForeignValueBillion,
  };
}

interface CacheEntry {
  mtimeMs: number;
  series: IdxForeignFlowSeries;
}

// Cache di module scope, di-invalidasi oleh mtime file - artefak hanya berubah saat
// skrip sinkronisasi jalan (sekali sehari setelah pasar tutup), jadi tidak ada gunanya
// membaca+parse JSON 90 baris di setiap request.
const cache = new Map<string, CacheEntry>();

/**
 * Baca arus dana asing resmi BEI untuk satu emiten.
 *
 * @param days jumlah hari bursa terakhir yang diambil (default 20).
 * @returns null kalau artefak belum ada, tidak terbaca, atau tidak punya baris valid.
 */
export function getRealForeignFlow(
  ticker: string,
  days = 20,
  options: ForeignFlowReadOptions = {}
): IdxForeignFlowSeries | null {
  const code = normalizeTicker(ticker);
  if (!code) return null;

  const dir = options.dataDir ?? defaultDataDir();
  const filePath = path.join(dir, `${code}.json`);

  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }

  const cacheKey = filePath;
  const cached = cache.get(cacheKey);
  let series: IdxForeignFlowSeries;

  if (cached && cached.mtimeMs === mtimeMs) {
    series = cached.series;
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
    const document = (parsed ?? {}) as Record<string, unknown>;
    const rawHistory = Array.isArray(document.history) ? document.history : [];
    const history = rawHistory
      .map(toPoint)
      .filter((point): point is IdxForeignFlowPoint => point !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (history.length === 0) return null;

    series = {
      ticker: code,
      source: IDX_FOREIGN_FLOW_SOURCE,
      updatedAt: typeof document.updatedAt === 'string' ? document.updatedAt : null,
      history,
    };
    cache.set(cacheKey, { mtimeMs, series });
  }

  const limit = Number.isFinite(days) && days > 0 ? Math.floor(days) : 20;
  return { ...series, history: series.history.slice(-limit) };
}

/**
 * Porsi transaksi investor asing terhadap seluruh transaksi emiten hari itu, persen.
 *
 * Pembaginya 2x volume pasar, BUKAN volume mentah: setiap lembar yang berpindah tangan
 * punya satu sisi beli dan satu sisi jual, sedangkan foreignBuy + foreignSell menjumlah
 * kedua sisi. Tanpa faktor 2 angkanya bisa tembus 100% pada saham yang didominasi asing.
 *
 * @returns null kalau volume pasar tidak positif (tidak ada yang bisa dibandingkan).
 */
export function getForeignParticipationRatio(
  buy: number,
  sell: number,
  totalVol: number
): number | null {
  const buyVolume = finiteNumber(buy);
  const sellVolume = finiteNumber(sell);
  const marketVolume = finiteNumber(totalVol);
  if (buyVolume === null || sellVolume === null || marketVolume === null) return null;
  if (marketVolume <= 0) return null;
  if (buyVolume < 0 || sellVolume < 0) return null;

  const pct = ((buyVolume + sellVolume) / (2 * marketVolume)) * 100;
  // Data Bursa sesekali mencatat foreign volume melebihi volume reguler (transaksi
  // negosiasi/crossing ikut terhitung di satu sisi) - dibatasi 100 supaya tidak
  // menampilkan "partisipasi asing 143%" yang tidak punya arti.
  return round(Math.min(pct, 100), 1);
}

/** Hari bursa beruntun dengan net foreign POSITIF, dihitung dari yang terbaru mundur. */
export function calculateAccumulationStreak(history: IdxForeignFlowPoint[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].netForeignVolume > 0) streak++;
    else break;
  }
  return streak;
}

/** Kebalikan calculateAccumulationStreak - hari beruntun dengan net foreign NEGATIF. */
export function calculateDistributionStreak(history: IdxForeignFlowPoint[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].netForeignVolume < 0) streak++;
    else break;
  }
  return streak;
}

/**
 * Ringkasan status arus dana asing.
 *
 * Aturan status sengaja dibuat sesederhana mungkin dan hanya dari angka resmi Bursa:
 * AKUMULASI kalau net hari ini DAN akumulasi 5 hari terakhir sama-sama positif,
 * DISTRIBUSI kalau dua-duanya negatif, selain itu NETRAL. Syarat dua-duanya searah
 * mencegah satu hari ekstrem membalik label sebuah pekan yang arahnya berlawanan.
 * Tidak ada ambang hasil kalibrasi di sini - tanda plus/minus datang langsung dari
 * ForeignBuy/ForeignSell yang dicatat Bursa.
 */
export function summarizeForeignFlow(history: IdxForeignFlowPoint[]): IdxForeignFlowSummary {
  if (history.length === 0) {
    return {
      status: 'NETRAL',
      netTodayBillion: null,
      netTodayLot: null,
      net5DBillion: null,
      accumulationStreak: 0,
      distributionStreak: 0,
      foreignBuyVolume: null,
      foreignSellVolume: null,
      foreignParticipationPct: null,
      latestDate: null,
      latestClose: null,
    };
  }

  const latest = history[history.length - 1];
  const netTodayBillion = round(latest.netForeignValueBillion, 4);
  const net5DBillion = round(
    history.slice(-5).reduce((sum, point) => sum + point.netForeignValueBillion, 0),
    4
  );

  let status: ForeignFlowStatus = 'NETRAL';
  if (netTodayBillion > 0 && net5DBillion > 0) status = 'AKUMULASI';
  else if (netTodayBillion < 0 && net5DBillion < 0) status = 'DISTRIBUSI';

  return {
    status,
    netTodayBillion,
    netTodayLot: Math.round(latest.netForeignVolume / SHARES_PER_LOT),
    net5DBillion,
    accumulationStreak: calculateAccumulationStreak(history),
    distributionStreak: calculateDistributionStreak(history),
    foreignBuyVolume: latest.foreignBuy,
    foreignSellVolume: latest.foreignSell,
    foreignParticipationPct: getForeignParticipationRatio(
      latest.foreignBuy,
      latest.foreignSell,
      latest.volume
    ),
    latestDate: latest.date,
    latestClose: latest.close,
  };
}

// ---------------------------------------------------------------------------
// Analisis arus asing dari catatan RESMI BEI.
//
// Menggantikan jalur proxy Chaikin Money Flow (foreign-flow-proxy.ts) pada emiten yang
// artefaknya sudah tersedia. Proxy itu dulu dipakai karena tidak ada pilihan lain -
// ForeignBuy/ForeignSell per emiten baru masuk lewat scripts/sync-idx-foreign-flow.py
// pada 2026-08-18. CMF menebak tekanan beli/jual dari posisi close di dalam range harian;
// angka di bawah TIDAK menebak apa pun, ia menghitung lembar saham yang benar-benar dibeli
// dan dijual investor asing menurut Bursa.
//
// Skalanya sengaja dibuat setara CMF20 (-100..100 persen) supaya ambang skor di
// scoreFlowTekanan() tidak perlu dikalibrasi ulang. Bedanya penyebutnya: CMF memakai total
// volume pasar, ini memakai total transaksi ASING (beli + jual) - kalau dibagi volume
// pasar, angkanya akan selalu beberapa persen saja dan seluruh ambangnya jadi mati.
// ---------------------------------------------------------------------------

export interface OfficialForeignFlowAnalysis {
  /** Net asing 20 hari sebagai persen dari total transaksi asing, -100..100. Pengganti
   *  langsung CMF20 pada jalur skor. `null` = jendela kosong / tidak ada transaksi asing. */
  netPressure20: number | null;
  /** Tekanan asing pada hari bursa terakhir, -100..100. */
  netPressureToday: number | null;
  status: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNAVAILABLE';
  accumulationStatus: 'AKUMULASI' | 'DISTRIBUSI' | 'NETRAL' | null;
  consecutiveBuyDays: number;
  consecutiveSellDays: number;
  /** Proporsi hari dengan net asing positif dalam jendela (0-1). Pengganti
   *  mfmPositiveRatio20 - ukuran persistensi, bukan panjang streak. */
  positiveRatio20: number | null;
  net5DBillion: number | null;
  latestDate: string | null;
  /** Jumlah hari bursa yang benar-benar dipakai. Dilaporkan apa adanya supaya pembaca
   *  tahu kalau jendelanya belum penuh, bukan disembunyikan. */
  observedDays: number;
}

const KOSONG: OfficialForeignFlowAnalysis = {
  netPressure20: null,
  netPressureToday: null,
  status: 'UNAVAILABLE',
  accumulationStatus: null,
  consecutiveBuyDays: 0,
  consecutiveSellDays: 0,
  positiveRatio20: null,
  net5DBillion: null,
  latestDate: null,
  observedDays: 0,
};

function tekanan(net: number, turnover: number): number | null {
  return turnover > 0 ? (net / turnover) * 100 : null;
}

export function analyzeOfficialForeignFlow(history: IdxForeignFlowPoint[]): OfficialForeignFlowAnalysis {
  if (history.length === 0) return KOSONG;

  const window20 = history.slice(-20);
  const latest = window20[window20.length - 1];

  const netTotal = window20.reduce((sum, row) => sum + row.netForeignVolume, 0);
  const turnoverTotal = window20.reduce((sum, row) => sum + row.foreignBuy + row.foreignSell, 0);
  const netPressure20 = tekanan(netTotal, turnoverTotal);
  const netPressureToday = tekanan(latest.netForeignVolume, latest.foreignBuy + latest.foreignSell);

  let consecutiveBuyDays = 0;
  for (let i = window20.length - 1; i >= 0 && window20[i].netForeignVolume > 0; i--) consecutiveBuyDays++;
  let consecutiveSellDays = 0;
  for (let i = window20.length - 1; i >= 0 && window20[i].netForeignVolume < 0; i--) consecutiveSellDays++;

  const positiveRatio20 = window20.filter((row) => row.netForeignVolume > 0).length / window20.length;
  const net5DBillion = window20.slice(-5).reduce((sum, row) => sum + row.netForeignValueBillion, 0);

  if (netPressure20 == null) {
    return { ...KOSONG, latestDate: latest.date, observedDays: window20.length, net5DBillion };
  }

  // Dua syarat, sama seperti analyzeBandarmology: besaran 20 hari DAN arah hari terakhir.
  // Satu hari besar berlawanan arah tidak boleh membalik label sendirian.
  let status: OfficialForeignFlowAnalysis['status'] = 'NEUTRAL';
  if (netPressure20 > 20 && (netPressureToday ?? 0) > 0) status = 'BULLISH';
  else if (netPressure20 < -20 && (netPressureToday ?? 0) < 0) status = 'BEARISH';

  let accumulationStatus: OfficialForeignFlowAnalysis['accumulationStatus'] = 'NETRAL';
  if (netPressure20 > 10 && positiveRatio20 >= 0.6) accumulationStatus = 'AKUMULASI';
  else if (netPressure20 < -10 && positiveRatio20 <= 0.4) accumulationStatus = 'DISTRIBUSI';

  return {
    netPressure20: parseFloat(netPressure20.toFixed(1)),
    netPressureToday: netPressureToday == null ? null : parseFloat(netPressureToday.toFixed(1)),
    status,
    accumulationStatus,
    consecutiveBuyDays,
    consecutiveSellDays,
    positiveRatio20: parseFloat(positiveRatio20.toFixed(3)),
    net5DBillion: parseFloat(net5DBillion.toFixed(4)),
    latestDate: latest.date,
    observedDays: window20.length,
  };
}
