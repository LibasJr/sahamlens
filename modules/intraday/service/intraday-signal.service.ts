// Pembangkitan sinyal LensIntraday dan simulasi hasilnya - fungsi MURNI atas bar
// satu emiten satu hari. Tidak menyentuh jaringan maupun database, jadi seluruh
// aturan bebas look-ahead di bawah bisa diuji langsung.
//
// ATURAN WAKTU (inti dari modul ini):
//   - Timestamp bar dari provider adalah AWAL bar. Bar bertanda 09:25 mencakup
//     09:25-09:30, jadi pada pukul 09:30 bar terakhir yang SUDAH SELESAI adalah 09:25.
//   - Skor pada signal_timestamp T hanya boleh memakai bar yang selesai <= T.
//   - Entry paling cepat adalah bar BERIKUTNYA, yaitu bar yang MULAI pada T, dan
//     harganya harga OPEN bar itu. Tidak pernah close bar sinyal.
//   - Exit horizon H diambil dari bar pertama yang SELESAI pada atau setelah
//     (waktu mulai entry + H). Kalau target jatuh di jeda sesi siang, exit otomatis
//     bergeser ke bar pertama setelah jeda dan ditandai HORIZON_AFTER_BREAK - bukan
//     dipaksakan seolah ada perdagangan pukul 12:30.
//   - Semua posisi ditutup paling lambat di eodExitCutoffMinute pada hari yang sama.

import {
  DEFAULT_INTRADAY_COMPONENT_MAPPING,
  INTRADAY_BAR_INTERVAL_MINUTES,
  INTRADAY_HORIZON_MINUTES,
  INTRADAY_HORIZONS,
  INTRADAY_COMPONENT_KEYS,
  effectiveSlippageBps,
  intradayScoreBucket,
  isIntradayTradable,
  minHalfSpreadBps,
  MOMENTUM_DOC_BARS,
  TREND_DOC_BARS,
  type IntradayComponentMapping,
  type IntradayHorizon,
  type IntradayRunConfig,
  type IntradayScoreBucket,
  type IntradayWeights,
} from '../constants/intraday-model';
import {
  formatWibMinute,
  isInsideSession,
  sessionsForDate,
  toWibIso,
  type IntradayBar,
} from './intraday-bars.service';

// ---------------------------------------------------------------------------
// Sinyal
// ---------------------------------------------------------------------------

export interface IntradayComponentSnapshot {
  /** Nilai mentah tiap komponen sebelum dipetakan ke 0-100. */
  raw: Record<keyof IntradayWeights, number>;
  /** Nilai 0-100 tiap komponen. */
  scored: Record<keyof IntradayWeights, number>;
  /** Bar yang sudah selesai dan dipakai menghitung skor. */
  barsUsed: number;
  /**
   * Jendela yang BENAR-BENAR terpakai, bukan yang diniatkan.
   *
   * Di titik grid paling pagi belum ada cukup bar sejak pembukaan, jadi momentum dan
   * trendPersistence terpaksa memakai jendela lebih pendek. Sebelumnya pemendekan itu
   * tidak tercatat di mana pun: pukul 09:30 momentum diukur 25 menit dan tren 25 menit,
   * sementara dokumentasinya menyebut 30 dan 60 - dan panel ini MENGIRIS hasil per jam
   * sinyal, jadi perbedaan definisi fitur tidak bisa dibedakan dari efek jam pasar.
   *
   * Titik pagi TIDAK dibuang: pembukaan justru jam paling relevan untuk intraday, dan
   * membuangnya mengubah populasi jauh lebih banyak daripada masalah yang diperbaikinya.
   * Yang benar adalah membuat pemendekannya terlihat dan bisa diatribusikan.
   */
  momentumLookbackBars: number;
  trendLookbackBars: number;
  /** false = salah satu jendela di atas lebih pendek dari niatnya. */
  fullLookback: boolean;
  /** Nilai transaksi kumulatif sesi berjalan sampai signal_timestamp, rupiah. */
  sessionTurnoverIdr: number;
  /** Volume kumulatif sesi berjalan sampai signal_timestamp. */
  sessionVolume: number;
  /** Bar bervolume > 0 sampai signal_timestamp - proksi frekuensi transaksi. */
  activeBars: number;
  /** VWAP sesi berjalan. */
  sessionVwap: number;
  lastClose: number;
}

export interface IntradaySignal {
  ticker: string;
  tradingDate: string;
  /** Menit WIB grid sinyal. */
  signalMinute: number;
  signalWibIso: string;
  score: number;
  bucket: IntradayScoreBucket;
  components: IntradayComponentSnapshot;
}

/** Minimal bar selesai sebelum skor boleh dihitung sama sekali. */
export const MIN_COMPLETED_BARS_FOR_SIGNAL = 6;
const MOMENTUM_LOOKBACK_BARS = MOMENTUM_DOC_BARS;
const TREND_LOOKBACK_BARS = TREND_DOC_BARS;
const VOLUME_SURGE_BARS = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Peta linear [lo, hi] -> [0, 100], dipotong di kedua ujung. */
function linearScore(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value) || hi <= lo) return 50;
  return clamp(((value - lo) / (hi - lo)) * 100, 0, 100);
}

function round(value: number, digits = 6): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export interface IntradayLookbackCoverage {
  completedBars: number;
  momentumLookbackBars: number;
  trendLookbackBars: number;
  full: boolean;
}

/**
 * Berapa panjang jendela fitur yang TERSEDIA di sebuah titik grid - dihitung dari
 * kalender, tanpa perlu bar apa pun.
 *
 * Dipakai panel validasi supaya irisan per jam sinyal bisa menyebut sendiri bahwa
 * titik pagi memakai jendela lebih pendek. Tanpa ini, perbedaan definisi fitur di
 * 09:30 tidak bisa dibedakan dari efek jam pembukaan yang sesungguhnya.
 */
export function intradayLookbackCoverage(
  signalMinute: number,
  sessions: Array<{ startMinute: number; endMinute: number }>
): IntradayLookbackCoverage {
  const dayStart = sessions.length ? Math.min(...sessions.map((s) => s.startMinute)) : signalMinute;
  // Bar yang SELESAI pada signalMinute, dengan asumsi bar rapat sejak pembukaan.
  // Jeda sesi siang tidak menambah bar, jadi menit di dalam jeda tidak ikut dihitung.
  let elapsed = 0;
  for (const session of sessions) {
    if (signalMinute <= session.startMinute) continue;
    elapsed += Math.min(signalMinute, session.endMinute) - session.startMinute;
  }
  if (!sessions.length) elapsed = Math.max(0, signalMinute - dayStart);
  const completedBars = Math.max(0, Math.floor(elapsed / INTRADAY_BAR_INTERVAL_MINUTES));
  const momentumLookbackBars = Math.min(MOMENTUM_LOOKBACK_BARS, Math.max(0, completedBars - 1));
  const trendLookbackBars = Math.min(TREND_LOOKBACK_BARS, Math.max(0, completedBars - 1));
  return {
    completedBars,
    momentumLookbackBars,
    trendLookbackBars,
    full: momentumLookbackBars >= MOMENTUM_LOOKBACK_BARS && trendLookbackBars >= TREND_LOOKBACK_BARS,
  };
}

export function computeIntradayComponents(
  completedBars: IntradayBar[],
  mapping: IntradayComponentMapping = DEFAULT_INTRADAY_COMPONENT_MAPPING
): IntradayComponentSnapshot | null {
  if (completedBars.length < MIN_COMPLETED_BARS_FOR_SIGNAL) return null;

  const closes = completedBars.map((b) => b.close);
  const lastClose = closes[closes.length - 1]!;

  const momentumBack = Math.min(MOMENTUM_LOOKBACK_BARS, closes.length - 1);
  const momentumBase = closes[closes.length - 1 - momentumBack]!;
  const momentum = momentumBase > 0 ? lastClose / momentumBase - 1 : 0;

  let turnover = 0;
  let volume = 0;
  let activeBars = 0;
  for (const bar of completedBars) {
    turnover += bar.close * bar.volume;
    volume += bar.volume;
    if (bar.volume > 0) activeBars++;
  }
  // VWAP jatuh kembali ke rata-rata close kalau seluruh sesi nihil volume - itu
  // keadaan nyata untuk emiten sangat tipis, dan membaginya dengan nol bukan jawaban.
  const sessionVwap = volume > 0 ? turnover / volume : closes.reduce((a, b) => a + b, 0) / closes.length;
  const vwapDeviation = sessionVwap > 0 ? lastClose / sessionVwap - 1 : 0;

  const recentVolumes = completedBars.slice(-VOLUME_SURGE_BARS).map((b) => b.volume);
  const meanRecent = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  const meanAll = volume / completedBars.length;
  const volumeSurge = meanAll > 0 ? meanRecent / meanAll : 1;

  const sessionHigh = Math.max(...completedBars.map((b) => b.high));
  const sessionLow = Math.min(...completedBars.map((b) => b.low));
  const rangePosition = sessionHigh > sessionLow ? (lastClose - sessionLow) / (sessionHigh - sessionLow) : 0.5;

  // Bar datar dihitung setengah, BUKAN nol: harga yang tidak bergerak bukan bukti
  // penurunan, dan menghitungnya sebagai "tidak naik" membuat emiten tipis otomatis
  // berskor rendah hanya karena jarang bertransaksi.
  const trendWindow = closes.slice(-(TREND_LOOKBACK_BARS + 1));
  let upScore = 0;
  let moves = 0;
  for (let i = 1; i < trendWindow.length; i++) {
    moves++;
    if (trendWindow[i]! > trendWindow[i - 1]!) upScore += 1;
    else if (trendWindow[i]! === trendWindow[i - 1]!) upScore += 0.5;
  }
  const trendPersistence = moves > 0 ? upScore / moves : 0.5;
  const fullLookback = momentumBack >= MOMENTUM_LOOKBACK_BARS && moves >= TREND_LOOKBACK_BARS;

  // v0.2.0. OBV standar dalam sesi: unchanged close = kontribusi NOL (bukan
  // setengah - beda sengaja dari trendPersistence, ini definisi baku OBV, bukan
  // konvensi lokal modul ini). Dinormalisasi terhadap total volume sesi (`volume`,
  // sudah dihitung di atas) supaya sebanding lintas emiten besar/kecil.
  let obv = 0;
  for (let i = 1; i < completedBars.length; i++) {
    const prevClose = completedBars[i - 1]!.close;
    const close = completedBars[i]!.close;
    const barVolume = completedBars[i]!.volume;
    if (close > prevClose) obv += barVolume;
    else if (close < prevClose) obv -= barVolume;
  }
  const obvAccumulation = volume > 0 ? obv / volume : 0;

  // v0.2.0. %B Bollinger atas `bollingerWindowBars` bar terakhir (default 12 = 60
  // menit, K=2). Beda dari rangePosition: itu statis terhadap high-low SELURUH sesi
  // berjalan, ini dinamis terhadap rata-rata bergerak jendela pendek - dan BISA
  // keluar dari [0,1] kalau harga menembus pita, persis Bollinger asli. Diverifikasi
  // empiris (scripts/calibrate-intraday-v02-components.mjs, 26.606 titik grid):
  // saturasi di luar [0,1] cuma 6,5% - tidak perlu span tambahan, klem polos cukup.
  const bbWindow = closes.slice(-mapping.bollingerWindowBars);
  const bbMean = bbWindow.reduce((a, b) => a + b, 0) / bbWindow.length;
  const bbVariance = bbWindow.reduce((a, b) => a + (b - bbMean) ** 2, 0) / bbWindow.length;
  const bbStdev = Math.sqrt(bbVariance);
  const bbUpper = bbMean + mapping.bollingerK * bbStdev;
  const bbLower = bbMean - mapping.bollingerK * bbStdev;
  // Stdev nol (harga datar sepanjang jendela) -> %B tidak terdefinisi, dijawab 0,5
  // (netral), sama seperti rangePosition menjawab high==low.
  const bollingerPctB = bbUpper > bbLower ? (lastClose - bbLower) / (bbUpper - bbLower) : 0.5;

  const raw = {
    momentum: round(momentum),
    vwapDeviation: round(vwapDeviation),
    volumeSurge: round(volumeSurge),
    rangePosition: round(rangePosition),
    trendPersistence: round(trendPersistence),
    obvAccumulation: round(obvAccumulation),
    bollingerPctB: round(bollingerPctB),
  };

  // Rentang pemetaan dipilih dari besaran wajar gerakan 5-30 menit saham IDX likuid.
  // Ia BELUM dikalibrasi terhadap hasil - kalibrasi dilakukan terpisah di
  // intraday-validation.service dan boleh saja menolak pemetaan ini.
  // volumeSurge dipetakan pada skala LOG, berpusat di `volumeSurgeCenter`. Peta linear
  // akan memberi skor rendah untuk volume yang sama sekali biasa - bias turun yang
  // menular ke setiap skor.
  //
  // Pusatnya DULU dipatok 1,0 dengan alasan "volume normal". Diukur dari 26.606 sinyal,
  // median rasio ini 0,7169 dan 1,0 justru di persentil 67,7 - jadi patokan lama membuat
  // observasi median berskor ~41, bukan 50. Lihat catatan panjang di konstanta.
  const surgeCenter = Math.log(Math.max(1e-6, mapping.volumeSurgeCenter));
  const surgeSpan = Math.log(mapping.volumeSurgeSpan);
  const scored = {
    momentum: round(linearScore(momentum, -mapping.momentumAbs, mapping.momentumAbs), 2),
    vwapDeviation: round(linearScore(vwapDeviation, -mapping.vwapDeviationAbs, mapping.vwapDeviationAbs), 2),
    volumeSurge: round(
      linearScore(Math.log(Math.max(1e-6, volumeSurge)) - surgeCenter, -surgeSpan, surgeSpan),
      2
    ),
    rangePosition: round(rangePosition * 100, 2),
    trendPersistence: round(trendPersistence * 100, 2),
    // v0.2.0. Simetris di 0 seperti momentum/vwapDeviation - lihat catatan kalibrasi
    // obvAccumulationAbs di konstanta.
    obvAccumulation: round(linearScore(obvAccumulation, -mapping.obvAccumulationAbs, mapping.obvAccumulationAbs), 2),
    // v0.2.0. linearScore(0,1) sudah mengklem ujungnya - itu tepat perlakuannya:
    // saturasi cuma 6,5% pada sebaran nyata (lihat catatan di atas), jadi tidak
    // butuh span tambahan seperti volumeSurge.
    bollingerPctB: round(linearScore(bollingerPctB, 0, 1), 2),
  };

  return {
    raw,
    scored,
    barsUsed: completedBars.length,
    momentumLookbackBars: momentumBack,
    trendLookbackBars: moves,
    fullLookback,
    sessionTurnoverIdr: Math.round(turnover),
    sessionVolume: volume,
    activeBars,
    sessionVwap: round(sessionVwap, 4),
    lastClose,
  };
}

export function intradayScoreFromComponents(
  components: IntradayComponentSnapshot,
  weights: IntradayWeights
): number {
  const totalWeight = INTRADAY_COMPONENT_KEYS.reduce((sum, key) => sum + weights[key], 0);
  if (totalWeight <= 0) return 50;
  const weighted = INTRADAY_COMPONENT_KEYS.reduce(
    (sum, key) => sum + weights[key] * components.scored[key],
    0
  );
  return round(weighted / totalWeight, 2);
}

/**
 * Sinyal dibangkitkan di SETIAP titik grid untuk SETIAP emiten, tanpa menyaring skor.
 * Menyaring di sini akan membuat populasi bucket rendah menghilang, dan analisis
 * monotonicity kehilangan pembandingnya.
 */
export function buildIntradaySignals(
  dayBars: IntradayBar[],
  config: IntradayRunConfig
): IntradaySignal[] {
  if (!dayBars.length) return [];
  const sorted = [...dayBars].sort((a, b) => a.unixSeconds - b.unixSeconds);
  const tradingDate = sorted[0]!.tradingDate;
  const ticker = sorted[0]!.ticker;
  const sessions = sessionsForDate(tradingDate, config.calendar);
  const signals: IntradaySignal[] = [];

  for (const gridMinute of config.calendar.signalGridMinutes) {
    if (!isInsideSession(gridMinute, sessions)) continue;
    // Bar SELESAI pada gridMinute: bar yang mulai <= gridMinute - interval.
    const completed = sorted.filter((b) => b.wibMinute + INTRADAY_BAR_INTERVAL_MINUTES <= gridMinute);
    const components = computeIntradayComponents(completed, config.componentMapping);
    if (!components) continue;

    const score = intradayScoreFromComponents(components, config.weights);
    signals.push({
      ticker,
      tradingDate,
      signalMinute: gridMinute,
      signalWibIso: `${tradingDate}T${formatWibMinute(gridMinute)}:00+07:00`,
      score,
      bucket: intradayScoreBucket(score),
      components,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Simulasi hasil
// ---------------------------------------------------------------------------

export type IntradayFillStatus = 'FILLED' | 'NO_FILL' | 'INVALID';

export type IntradayExitReason =
  | 'HORIZON'
  | 'HORIZON_AFTER_BREAK'
  | 'EOD'
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'TP_SL_SAME_BAR_CONSERVATIVE'
  | 'NO_FILL'
  | 'INVALID';

export interface IntradayOutcome {
  horizon: IntradayHorizon;
  fillStatus: IntradayFillStatus;
  exitReason: IntradayExitReason;
  entryWibIso: string | null;
  /** Harga eksekusi setelah slippage entry. */
  entryPrice: number | null;
  /** Harga bar apa adanya (open bar entry) - dasar uji sensitivitas biaya. */
  entryPriceRaw: number | null;
  exitWibIso: string | null;
  /** Harga eksekusi setelah slippage exit. */
  exitPrice: number | null;
  /** Harga bar apa adanya (close bar exit, atau harga TP/SL) - dasar uji sensitivitas biaya. */
  exitPriceRaw: number | null;
  /** Return sebelum biaya apa pun: exitBarClose / entryBarOpen - 1. Informasi tambahan. */
  grossReturn: number | null;
  /** Return SETELAH fee beli, fee jual, dan slippage dua sisi. Ini angka utama. */
  netReturn: number | null;
  /** grossReturn - netReturn, dalam satuan return. */
  totalCost: number | null;
  /** Maximum Favorable Excursion terhadap harga entry (sudah termasuk slippage entry). */
  mfe: number | null;
  mae: number | null;
  minutesToMfe: number | null;
  minutesToMae: number | null;
  hitTakeProfit: boolean;
  hitStopLoss: boolean;
  dataQualityStatus: string;
  /** Kompatibilitas arsip: sama dengan slippage entry. Gunakan dua field eksplisit di bawah untuk model baru. */
  slippageBpsApplied: number | null;
  /** Slippage aktual saat beli; lantai tick dihitung dari harga entry. */
  entrySlippageBpsApplied: number | null;
  /** Slippage aktual saat jual; lantai tick dihitung dari harga exit. */
  exitSlippageBpsApplied: number | null;
  /** Kompatibilitas arsip: sama dengan status lantai pada entry. */
  spreadFloorBinding: boolean;
  entrySpreadFloorBinding: boolean;
  exitSpreadFloorBinding: boolean;
  /** Apakah sinyal ini lolos gerbang kelayakan transaksi intraday. Menandai, tidak membuang. */
  tradable: boolean;
}

function bps(value: number): number {
  return value / 10_000;
}

/**
 * Simulasi satu sinyal pada satu horizon. `dayBars` HARUS bar hari yang sama,
 * urut naik, dan sudah lolos pemeriksaan kualitas.
 */
export function simulateIntradayOutcome(
  signal: IntradaySignal,
  dayBars: IntradayBar[],
  horizon: IntradayHorizon,
  config: IntradayRunConfig
): IntradayOutcome {
  const sorted = [...dayBars].sort((a, b) => a.unixSeconds - b.unixSeconds);
  const cutoff = config.calendar.eodExitCutoffMinute;

  const base: IntradayOutcome = {
    horizon,
    fillStatus: 'NO_FILL',
    exitReason: 'NO_FILL',
    entryWibIso: null,
    entryPrice: null,
    entryPriceRaw: null,
    exitWibIso: null,
    exitPrice: null,
    exitPriceRaw: null,
    grossReturn: null,
    netReturn: null,
    totalCost: null,
    mfe: null,
    mae: null,
    minutesToMfe: null,
    minutesToMae: null,
    hitTakeProfit: false,
    hitStopLoss: false,
    dataQualityStatus: 'OK',
    slippageBpsApplied: null,
    entrySlippageBpsApplied: null,
    exitSlippageBpsApplied: null,
    spreadFloorBinding: false,
    entrySpreadFloorBinding: false,
    exitSpreadFloorBinding: false,
    tradable: false,
  };

  // Bar entry = bar ke-`entryLagBars` yang MULAI pada atau setelah signal_timestamp.
  const candidates = sorted.filter((b) => b.wibMinute >= signal.signalMinute);
  const entryIndexInCandidates = config.entryLagBars - 1;
  const entryBar = candidates[entryIndexInCandidates];
  if (!entryBar) {
    return { ...base, dataQualityStatus: 'NO_ENTRY_BAR' };
  }
  // Bar entry yang jaraknya jauh dari waktu sinyal berarti bar aslinya hilang -
  // memakainya sama dengan berpura-pura bisa membeli di harga yang belum ada.
  if (entryBar.wibMinute > signal.signalMinute + INTRADAY_BAR_INTERVAL_MINUTES * 2) {
    return { ...base, dataQualityStatus: 'ENTRY_BAR_GAP' };
  }
  // Bar yang SELESAI setelah cutoff tidak bisa dipakai: posisinya tidak akan pernah
  // punya bar exit yang sah pada hari yang sama.
  if (entryBar.wibMinute + INTRADAY_BAR_INTERVAL_MINUTES > cutoff) {
    return { ...base, dataQualityStatus: 'ENTRY_AFTER_EOD_CUTOFF' };
  }

  const entryIndex = sorted.indexOf(entryBar);
  const horizonMinutes = INTRADAY_HORIZON_MINUTES[horizon];
  const targetEndMinute =
    horizonMinutes == null ? cutoff : entryBar.wibMinute + horizonMinutes;

  // Bar exit: bar PERTAMA yang selesai pada atau setelah target, dan mulai <= cutoff.
  let exitIndex = -1;
  let exitReason: IntradayExitReason = horizonMinutes == null ? 'EOD' : 'HORIZON';
  for (let i = entryIndex; i < sorted.length; i++) {
    const bar = sorted[i]!;
    // Cutoff diterapkan pada AKHIR bar, bukan awalnya - supaya exit horizon yang
    // terpotong penutupan mendarat di bar yang sama persis dengan exit EOD.
    if (bar.wibMinute + INTRADAY_BAR_INTERVAL_MINUTES > cutoff) break;
    if (bar.wibMinute + INTRADAY_BAR_INTERVAL_MINUTES >= targetEndMinute) {
      exitIndex = i;
      break;
    }
    exitIndex = i;
  }
  if (exitIndex < 0) return { ...base, fillStatus: 'INVALID', exitReason: 'INVALID', dataQualityStatus: 'NO_EXIT_BAR' };

  const exitBar = sorted[exitIndex]!;
  if (exitIndex === entryIndex && horizonMinutes != null) {
    // Tidak ada bar yang melewati horizon sebelum cutoff EOD - posisi tetap ditutup,
    // tapi ini EOD, bukan horizon yang tercapai.
    exitReason = 'EOD';
  } else if (horizonMinutes != null) {
    const reachedNaturally = exitBar.wibMinute + INTRADAY_BAR_INTERVAL_MINUTES >= targetEndMinute;
    if (!reachedNaturally) exitReason = 'EOD';
    else if (exitBar.wibMinute > targetEndMinute) exitReason = 'HORIZON_AFTER_BREAK';
  }

  const window = sorted.slice(entryIndex, exitIndex + 1);
  const entryPriceRaw = entryBar.open;

  // Slippage tidak boleh lebih optimistis daripada setengah fraksi harga IDX. Untuk
  // saham murah lantai ini jauh melebihi asumsi datar - dan justru saham murah yang
  // paling sering terlihat menguntungkan di backtest intraday.
  const entrySlippageBps = effectiveSlippageBps(entryPriceRaw, config.cost.slippageEntryBps, config.priceFractions);
  const entrySpreadFloorBinding =
    minHalfSpreadBps(entryPriceRaw, config.priceFractions) >
    config.cost.slippageEntryBps;

  const entryPrice = entryPriceRaw * (1 + bps(entrySlippageBps));

  // TP/SL diperiksa bar per bar. Kalau SATU bar menyentuh keduanya, resolusi 5 menit
  // TIDAK memberi tahu mana lebih dulu - diasumsikan SL, asumsi konservatif.
  let hitTakeProfit = false;
  let hitStopLoss = false;
  let stopIndex = -1;
  if (config.takeProfitPct != null || config.stopLossPct != null) {
    const tpPrice = config.takeProfitPct != null ? entryPrice * (1 + config.takeProfitPct / 100) : null;
    const slPrice = config.stopLossPct != null ? entryPrice * (1 - config.stopLossPct / 100) : null;
    for (let i = 0; i < window.length; i++) {
      const bar = window[i]!;
      const tpTouched = tpPrice != null && bar.high >= tpPrice;
      const slTouched = slPrice != null && bar.low <= slPrice;
      if (slTouched && tpTouched) {
        hitStopLoss = true;
        hitTakeProfit = true;
        stopIndex = i;
        exitReason = 'TP_SL_SAME_BAR_CONSERVATIVE';
        break;
      }
      if (slTouched) {
        hitStopLoss = true;
        stopIndex = i;
        exitReason = 'STOP_LOSS';
        break;
      }
      if (tpTouched) {
        hitTakeProfit = true;
        stopIndex = i;
        exitReason = 'TAKE_PROFIT';
        break;
      }
    }
  }

  const effectiveWindow = stopIndex >= 0 ? window.slice(0, stopIndex + 1) : window;
  const effectiveExitBar = effectiveWindow[effectiveWindow.length - 1]!;

  // Harga exit untuk pelaporan GROSS memakai basis MENTAH. Level TP/SL sendiri
  // di-anchor ke harga ISI (entryPrice) karena itulah yang benar untuk trading -
  // tapi memakai angka itu sebagai pembilang gross, di atas penyebut mentah, membuat
  // grossReturn ikut terangkat slippage entry dan totalCost = gross - net salah.
  // Gross di sini adalah tandingan tanpa-biaya dari strategi yang SAMA: persentase
  // target yang sama, diterapkan pada harga bar mentah.
  let exitPriceRaw = effectiveExitBar.close;
  let exitPriceGrossBasis = effectiveExitBar.close;
  if (exitReason === 'TAKE_PROFIT' && config.takeProfitPct != null) {
    exitPriceRaw = entryPrice * (1 + config.takeProfitPct / 100);
    exitPriceGrossBasis = entryPriceRaw * (1 + config.takeProfitPct / 100);
  } else if ((exitReason === 'STOP_LOSS' || exitReason === 'TP_SL_SAME_BAR_CONSERVATIVE') && config.stopLossPct != null) {
    // Stop yang tersentuh setelah gap turun tidak dapat diasumsikan terjual pada
    // batas stop. Untuk posisi long, open yang lebih rendah adalah harga terbaik
    // yang realistis pada candle 5 menit itu; ini sengaja bias konservatif.
    exitPriceRaw = Math.min(effectiveExitBar.open, entryPrice * (1 - config.stopLossPct / 100));
    exitPriceGrossBasis = Math.min(effectiveExitBar.open, entryPriceRaw * (1 - config.stopLossPct / 100));
  }
  // Lantai fraksi sisi jual harus memakai HARGA EXIT. Harga dapat melintasi pita
  // fraksi IDX antara entry dan exit; memakai harga entry di sini membuat biaya
  // keluar salah persis pada kasus batas pita itu.
  const exitSlippageBps = effectiveSlippageBps(exitPriceRaw, config.cost.slippageExitBps, config.priceFractions);
  const exitSpreadFloorBinding = minHalfSpreadBps(exitPriceRaw, config.priceFractions) > config.cost.slippageExitBps;
  const exitPrice = exitPriceRaw * (1 - bps(exitSlippageBps));

  const grossReturn = exitPriceGrossBasis / entryPriceRaw - 1;
  const buyCash = entryPrice * (1 + config.cost.buyFeePct / 100);
  const sellCash = exitPrice * (1 - config.cost.sellFeePct / 100);
  const netReturn = sellCash / buyCash - 1;

  let mfe = Number.NEGATIVE_INFINITY;
  let mae = Number.POSITIVE_INFINITY;
  let minutesToMfe: number | null = null;
  let minutesToMae: number | null = null;
  for (const bar of effectiveWindow) {
    const up = bar.high / entryPrice - 1;
    const down = bar.low / entryPrice - 1;
    if (up > mfe) {
      mfe = up;
      minutesToMfe = bar.wibMinute + INTRADAY_BAR_INTERVAL_MINUTES - entryBar.wibMinute;
    }
    if (down < mae) {
      mae = down;
      minutesToMae = bar.wibMinute + INTRADAY_BAR_INTERVAL_MINUTES - entryBar.wibMinute;
    }
  }

  return {
    horizon,
    fillStatus: 'FILLED',
    exitReason,
    entryWibIso: toWibIso(entryBar.unixSeconds),
    entryPrice: round(entryPrice, 4),
    entryPriceRaw: round(entryPriceRaw, 4),
    exitWibIso: toWibIso(effectiveExitBar.unixSeconds),
    exitPrice: round(exitPrice, 4),
    exitPriceRaw: round(exitPriceRaw, 4),
    grossReturn: round(grossReturn),
    netReturn: round(netReturn),
    totalCost: round(grossReturn - netReturn),
    mfe: round(mfe),
    mae: round(mae),
    minutesToMfe,
    minutesToMae,
    hitTakeProfit,
    hitStopLoss,
    dataQualityStatus: 'OK',
    slippageBpsApplied: round(entrySlippageBps, 3),
    entrySlippageBpsApplied: round(entrySlippageBps, 3),
    exitSlippageBpsApplied: round(exitSlippageBps, 3),
    spreadFloorBinding: entrySpreadFloorBinding,
    entrySpreadFloorBinding,
    exitSpreadFloorBinding,
    // MENANDAI, tidak membuang: populasi grid tetap utuh supaya bucket skor rendah
    // punya pembanding, tetapi hasilnya bisa dibaca ulang pada irisan yang benar-benar
    // bisa dieksekusi aplikasi sungguhan.
    tradable: isIntradayTradable(
      {
        entryPriceIdr: entryPriceRaw,
        sessionTurnoverIdr: signal.components.sessionTurnoverIdr,
        activeBars: signal.components.activeBars,
      },
      config.tradability
    ),
  };
}

export function simulateAllHorizons(
  signal: IntradaySignal,
  dayBars: IntradayBar[],
  config: IntradayRunConfig
): IntradayOutcome[] {
  return INTRADAY_HORIZONS.map((horizon) => simulateIntradayOutcome(signal, dayBars, horizon, config));
}
