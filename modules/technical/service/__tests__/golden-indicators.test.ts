import { describe, expect, it } from 'vitest';
import { calculateRsi, calculateWilderAtr, wilderAtrAt, analyzeEma, analyzeMacd } from '@/modules/technical';
import { atrSeries, emaValues, rsiSeries, macdSeries, smaSeries } from '@/lib/chart-indicators';

/**
 * GOLDEN TEST INDIKATOR (temuan M-10 audit kuantitatif 2026-08-11).
 *
 * Sebelum file ini, 92 file test menguji INVARIAN - RSI ada di 0..100, warm-up
 * menghasilkan null, panjang array cocok. Tidak satu pun menguji bahwa angkanya BENAR.
 * Invarian tetap lulus kalau seluruh rumus salah dengan cara yang konsisten; persis itulah
 * yang terjadi pada C-1 (dua ATR berbeda) dan pada bug RSI 2026-08-03 (rata-rata aritmatik
 * dipakai selama berbulan-bulan sambil semua test hijau).
 *
 * NILAI ACUAN DI BAWAH TIDAK DIAMBIL DARI KODE INI. Semuanya dihitung ulang oleh
 * implementasi terpisah yang ditulis dari definisi bukunya (Wilder 1978 untuk RSI dan ATR,
 * EMA ber-seed SMA, MACD 12/26/9). Kalau nilai acuan disalin dari keluaran kode yang
 * diuji, test ini hanya akan mengunci bug - bukan mendeteksinya.
 *
 * Deret di bawah dibangkitkan LCG deterministik (state = (1103515245*state + 12345) mod 2^31,
 * seed 12345) supaya siapa pun bisa membangkitkannya ulang di bahasa apa pun.
 */

const CLOSES = [
  997, 988, 1003, 1006, 1024, 1036, 1034, 1048, 1035, 1038, 1058, 1058, 1073, 1082,
  1093, 1088, 1084, 1098, 1107, 1114, 1106, 1107, 1118, 1127, 1127, 1116, 1119, 1103,
  1088, 1082, 1069, 1079, 1096, 1087, 1080, 1086, 1067, 1063, 1072, 1062, 1061, 1060,
  1041, 1041, 1024, 1032, 1020, 1025, 1035, 1046, 1040, 1028, 1024, 1013, 1010, 996,
  1014, 1014, 1002, 997, 999, 1011, 1003, 1004, 1006, 997, 1009, 1002, 998, 1010,
  1029, 1018, 1033, 1038, 1038, 1034, 1026, 1042, 1031, 1041,
];

const HIGHS = [
  1003, 997, 1007, 1016, 1026, 1048, 1046, 1058, 1038, 1043, 1072, 1060, 1076, 1085,
  1103, 1096, 1097, 1101, 1108, 1128, 1117, 1113, 1121, 1138, 1129, 1117, 1127, 1118,
  1097, 1088, 1081, 1085, 1105, 1094, 1082, 1095, 1078, 1075, 1083, 1074, 1073, 1070,
  1054, 1055, 1038, 1033, 1025, 1031, 1050, 1047, 1041, 1035, 1029, 1019, 1012, 1011,
  1028, 1024, 1016, 1002, 1001, 1017, 1018, 1005, 1017, 1007, 1021, 1011, 1002, 1021,
  1044, 1029, 1039, 1039, 1042, 1042, 1027, 1053, 1046, 1042,
];

const LOWS = [
  992, 973, 997, 998, 1020, 1033, 1026, 1034, 1033, 1027, 1053, 1048, 1066, 1075,
  1090, 1076, 1075, 1095, 1095, 1111, 1098, 1097, 1117, 1124, 1116, 1114, 1113, 1092,
  1080, 1076, 1061, 1073, 1088, 1078, 1079, 1079, 1055, 1061, 1061, 1059, 1056, 1054,
  1039, 1027, 1018, 1021, 1019, 1024, 1030, 1035, 1030, 1022, 1022, 1004, 1005, 994,
  1012, 1001, 1001, 995, 995, 1007, 992, 994, 1002, 982, 997, 1001, 995, 1006, 1017,
  1017, 1023, 1029, 1036, 1027, 1014, 1028, 1020, 1033,
];

const OPENS = [
  997, 997, 988, 1003, 1006, 1024, 1036, 1034, 1048, 1035, 1038, 1058, 1058, 1073,
  1082, 1093, 1088, 1084, 1098, 1107, 1114, 1106, 1107, 1118, 1127, 1127, 1116, 1119,
  1103, 1088, 1082, 1069, 1079, 1096, 1087, 1080, 1086, 1067, 1063, 1072, 1062, 1061,
  1060, 1041, 1041, 1024, 1032, 1020, 1025, 1035, 1046, 1040, 1028, 1024, 1013, 1010,
  996, 1014, 1014, 1002, 997, 999, 1011, 1003, 1004, 1006, 997, 1009, 1002, 998,
  1010, 1029, 1018, 1033, 1038, 1038, 1034, 1026, 1042, 1031,
];

/** Nilai acuan dari implementasi independen. Jangan pernah diperbarui dari keluaran kode. */
const GOLDEN = {
  sma20: 1018.45,
  sma50: 1033.06,
  ema20: 1025.9251628383943,
  ema50: 1033.6344663559778,
  rsi14: 56.534968291715025,
  atr14: 17.510845203180224,
  macdLine: 3.366152760069099,
  macdSignal: -0.6178290372416979,
  macdHist: 3.983981797310797,
  atrAt20: 19.36104798299846,
  atrAt40: 18.339710054119614,
  atrAt60: 16.301241622470524,
} as const;

const bars = CLOSES.map((close, i) => ({ high: HIGHS[i]!, low: LOWS[i]!, close }));
const candles = CLOSES.map((close, i) => ({
  time: `2026-01-${String(i + 1).padStart(2, '0')}`,
  open: OPENS[i]!, high: HIGHS[i]!, low: LOWS[i]!, close, volume: 1_000_000,
}));
const history = CLOSES.map((close, i) => ({
  Date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
  Open: OPENS[i]!, High: HIGHS[i]!, Low: LOWS[i]!, Close: close, AdjClose: close, Volume: 1_000_000,
}));

describe('GOLDEN - jalur scoring', () => {
  it('RSI(14) Wilder cocok dengan nilai acuan', () => {
    expect(calculateRsi(CLOSES)).toBeCloseTo(GOLDEN.rsi14, 10);
  });

  it('ATR(14) Wilder cocok dengan nilai acuan', () => {
    expect(calculateWilderAtr(bars)).toBeCloseTo(GOLDEN.atr14, 10);
  });

  it('wilderAtrAt tidak melihat bar sesudah indeksnya', () => {
    expect(wilderAtrAt(bars, 20)).toBeCloseTo(GOLDEN.atrAt20, 10);
    expect(wilderAtrAt(bars, 40)).toBeCloseTo(GOLDEN.atrAt40, 10);
    expect(wilderAtrAt(bars, 60)).toBeCloseTo(GOLDEN.atrAt60, 10);
  });

  it('EMA 20 & 50 (seed SMA) cocok dengan nilai acuan', () => {
    const ema = analyzeEma(history, CLOSES[CLOSES.length - 1]!);
    expect(ema.raw.ema20).toBeCloseTo(GOLDEN.ema20, 9);
    expect(ema.raw.ema50).toBeCloseTo(GOLDEN.ema50, 9);
  });

  it('MACD(12,26,9) line/signal/histogram cocok dengan nilai acuan', () => {
    const macd = analyzeMacd(history, CLOSES[CLOSES.length - 1]!);
    expect(macd.raw.macdLine).toBeCloseTo(GOLDEN.macdLine, 9);
    expect(macd.raw.macdSignal).toBeCloseTo(GOLDEN.macdSignal, 9);
    expect(macd.raw.macdHist).toBeCloseTo(GOLDEN.macdHist, 9);
  });
});

describe('GOLDEN - jalur chart', () => {
  it('SMA 20 & 50 cocok dengan nilai acuan', () => {
    const sma20 = smaSeries(candles, 20);
    const sma50 = smaSeries(candles, 50);
    expect(sma20[sma20.length - 1]).toBeCloseTo(GOLDEN.sma20, 10);
    expect(sma50[sma50.length - 1]).toBeCloseTo(GOLDEN.sma50, 10);
  });

  it('EMA cocok dengan nilai acuan', () => {
    const ema20 = emaValues(CLOSES, 20);
    const ema50 = emaValues(CLOSES, 50);
    expect(ema20[ema20.length - 1]).toBeCloseTo(GOLDEN.ema20, 9);
    expect(ema50[ema50.length - 1]).toBeCloseTo(GOLDEN.ema50, 9);
  });

  it('RSI cocok dengan nilai acuan', () => {
    const rsi = rsiSeries(candles, 14);
    expect(rsi[rsi.length - 1]).toBeCloseTo(GOLDEN.rsi14, 10);
  });

  it('ATR cocok dengan nilai acuan', () => {
    const atr = atrSeries(candles, 14);
    expect(atr[atr.length - 1]).toBeCloseTo(GOLDEN.atr14, 10);
  });

  it('MACD cocok dengan nilai acuan', () => {
    const { macd, signal, histogram } = macdSeries(candles, 12, 26, 9);
    expect(macd[macd.length - 1]).toBeCloseTo(GOLDEN.macdLine, 9);
    expect(signal[signal.length - 1]).toBeCloseTo(GOLDEN.macdSignal, 9);
    expect(histogram[histogram.length - 1]).toBeCloseTo(GOLDEN.macdHist, 9);
  });
});

/**
 * CROSS-CHECK. Aplikasi ini punya DUA implementasi untuk indikator yang sama: satu dipakai
 * scoring/rekomendasi, satu dipakai menggambar chart. Pengguna melihat keduanya di halaman
 * yang sama. Kalau keduanya berbeda, angka di layar bukan angka yang dipakai mengambil
 * keputusan - dan tidak ada test invarian yang bisa menangkap itu, karena kedua sisi
 * memenuhi invariannya masing-masing.
 */
describe('CROSS-CHECK - chart vs scoring wajib menghasilkan angka yang sama', () => {
  it('RSI', () => {
    const chart = rsiSeries(candles, 14);
    expect(chart[chart.length - 1]).toBeCloseTo(calculateRsi(CLOSES)!, 10);
  });

  it('ATR - inilah yang dulu berbeda; garis di chart bukan ATR yang dipakai stop-loss', () => {
    const chart = atrSeries(candles, 14);
    expect(chart[chart.length - 1]).toBeCloseTo(calculateWilderAtr(bars)!, 10);
  });

  it('ATR pada beberapa titik di tengah deret, bukan hanya di ujung', () => {
    // Selisih definisi True Range paling besar di awal deret dan meluruh ke kanan.
    // Menguji ujungnya saja akan meloloskan bug yang sama seperti sebelumnya.
    const chart = atrSeries(candles, 14);
    for (const index of [20, 40, 60]) {
      expect(chart[index]).toBeCloseTo(wilderAtrAt(bars, index)!, 10);
    }
  });

  it('EMA 20/50', () => {
    const ema = analyzeEma(history, CLOSES[CLOSES.length - 1]!);
    const chart20 = emaValues(CLOSES, 20);
    const chart50 = emaValues(CLOSES, 50);
    expect(chart20[chart20.length - 1]).toBeCloseTo(ema.raw.ema20!, 9);
    expect(chart50[chart50.length - 1]).toBeCloseTo(ema.raw.ema50!, 9);
  });

  it('MACD', () => {
    const scoring = analyzeMacd(history, CLOSES[CLOSES.length - 1]!);
    const { macd, signal } = macdSeries(candles, 12, 26, 9);
    expect(macd[macd.length - 1]).toBeCloseTo(scoring.raw.macdLine!, 9);
    expect(signal[signal.length - 1]).toBeCloseTo(scoring.raw.macdSignal!, 9);
  });

  it('ATR chart tidak menghasilkan angka sebelum ada 14 True Range yang sah', () => {
    // Bar 0 tidak punya close sebelumnya, jadi tidak punya TR. ATR pertama karena itu
    // jatuh di indeks 14, bukan 13.
    const atr = atrSeries(candles, 14);
    expect(atr[13]).toBeNull();
    expect(atr[14]).not.toBeNull();
    expect(wilderAtrAt(bars, 13)).toBeNull();
    expect(wilderAtrAt(bars, 14)).not.toBeNull();
  });
});
