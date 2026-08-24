import { describe, it, expect } from 'vitest';
import {
  buildIntradaySignals,
  computeIntradayComponents,
  intradayScoreFromComponents,
  simulateAllHorizons,
  simulateIntradayOutcome,
  MIN_COMPLETED_BARS_FOR_SIGNAL,
} from '../intraday-signal.service';
import { wibDateKeyToUnix, type IntradayBar } from '../intraday-bars.service';
import {
  defaultIntradayRunConfig,
  INTRADAY_COST_SCENARIOS,
  LENS_INTRADAY_WEIGHTS,
} from '../../constants/intraday-model';
import { netReturnUnderCost } from '../intraday-validation.service';

const DATE = '2026-08-10'; // Senin

function makeBar(minute: number, price: number, overrides: Partial<IntradayBar> = {}): IntradayBar {
  return {
    ticker: 'BBCA.JK',
    unixSeconds: wibDateKeyToUnix(DATE, minute),
    tradingDate: DATE,
    wibMinute: minute,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 1000,
    ...overrides,
  };
}

/** Sesi penuh 09:00-15:45 dengan harga datar, kecuali yang ditimpa pemanggil. */
function flatSession(price = 100): IntradayBar[] {
  const bars: IntradayBar[] = [];
  for (let m = 9 * 60; m < 12 * 60; m += 5) bars.push(makeBar(m, price));
  for (let m = 13 * 60 + 30; m <= 15 * 60 + 45; m += 5) bars.push(makeBar(m, price));
  return bars;
}

const CONFIG = defaultIntradayRunConfig();

/**
 * Tick nol = lantai spread dimatikan. Ini test double untuk MENGISOLASI aritmetika
 * fee/slippage dan MFE/MAE dari lantai fraksi harga; di pasar sungguhan tick nol tidak
 * ada, dan produksi tidak pernah memakai konfigurasi ini. Lantainya diuji terpisah
 * di blok "lantai spread dari fraksi harga IDX" dengan harga dan tick nyata.
 */
const NO_SPREAD_FLOOR = [{ maxPriceExclusive: Number.POSITIVE_INFINITY, tickIdr: 0 }];

const ZERO_COST = defaultIntradayRunConfig({
  cost: { version: 'test-zero', label: 'tanpa biaya', buyFeePct: 0, sellFeePct: 0, slippageEntryBps: 0, slippageExitBps: 0 },
  priceFractions: NO_SPREAD_FLOOR,
});
/** Fee/slippage NORMAL, tanpa lantai - untuk menguji rumus biayanya saja. */
const COST_ONLY = defaultIntradayRunConfig({ priceFractions: NO_SPREAD_FLOOR });

describe('komponen skor', () => {
  it('menolak menghitung skor kalau bar yang sudah selesai terlalu sedikit', () => {
    const bars = Array.from({ length: MIN_COMPLETED_BARS_FOR_SIGNAL - 1 }, (_, i) => makeBar(9 * 60 + i * 5, 100));
    expect(computeIntradayComponents(bars)).toBeNull();
  });

  it('komponen HARGA netral 50 saat harga benar-benar datar', () => {
    const bars = Array.from({ length: 12 }, (_, i) => makeBar(9 * 60 + i * 5, 100));
    const components = computeIntradayComponents(bars)!;
    expect(components.raw.momentum).toBe(0);
    expect(components.raw.vwapDeviation).toBe(0);
    // High == low sepanjang sesi: posisi rentang tidak terdefinisi, dijawab 0,5 bukan NaN.
    expect(components.scored.rangePosition).toBe(50);
    expect(components.scored.momentum).toBe(50);
    expect(components.scored.vwapDeviation).toBe(50);
    expect(components.scored.trendPersistence).toBe(50);

    // TOTALNYA SENGAJA TIDAK 50, dan versi sebelumnya menuntut 50 di sini.
    //
    // Bar sintetis ini volumenya rata, jadi volumeSurge = 1,0 persis. Pemetaan lama
    // berpusat di 1,0 sehingga itu berskor 50 - tapi pemusatan itulah yang salah:
    // diukur dari 26.606 sinyal produksi, median rasio ini 0,7169 dan 1,0 berada di
    // persentil 67,7. Volume 3 bar terakhir yang menyamai rata-rata sesi bukan keadaan
    // netral; ia di atas median, dan sekarang berskor di atas 50.
    //
    // Menuntut total 50 di sini sama dengan menuntut pusatnya kembali ke 1,0.
    expect(components.scored.volumeSurge).toBeGreaterThan(50);
    expect(intradayScoreFromComponents(components, LENS_INTRADAY_WEIGHTS)).toBeGreaterThan(50);
  });

  it('skor naik saat harga menanjak dengan volume membesar', () => {
    const rising = Array.from({ length: 12 }, (_, i) =>
      makeBar(9 * 60 + i * 5, 100 + i * 0.3, { high: 100 + i * 0.3, low: 100, volume: 1000 + i * 500 })
    );
    const components = computeIntradayComponents(rising)!;
    expect(intradayScoreFromComponents(components, LENS_INTRADAY_WEIGHTS)).toBeGreaterThan(50);
  });

  it('VWAP dihitung dari nilai transaksi, bukan rata-rata harga polos', () => {
    const bars = [
      ...Array.from({ length: 6 }, (_, i) => makeBar(9 * 60 + i * 5, 100, { volume: 1 })),
      makeBar(9 * 60 + 30, 200, { volume: 1_000_000 }),
    ];
    const components = computeIntradayComponents(bars)!;
    expect(components.sessionVwap).toBeGreaterThan(199);
  });
});

describe('bebas look-ahead', () => {
  it('skor pada titik grid hanya memakai bar yang SUDAH SELESAI pada waktu itu', () => {
    const bars = flatSession(100);
    // Bar 09:30 dibuat ekstrem. Bar itu MULAI 09:30, jadi belum selesai pada 09:30
    // dan tidak boleh mempengaruhi skor sinyal 09:30.
    const idx = bars.findIndex((b) => b.wibMinute === 9 * 60 + 30);
    bars[idx] = makeBar(9 * 60 + 30, 500, { high: 500, low: 500, volume: 9_000_000 });

    const signals = buildIntradaySignals(bars, CONFIG);
    const at0930 = signals.find((s) => s.signalMinute === 9 * 60 + 30)!;
    expect(at0930.components.lastClose).toBe(100);

    // Dibandingkan dengan sesi yang bar 09:30-nya TIDAK diutak-atik, bukan dengan angka
    // ajaib. Kalau bar 09:30 sampai ikut terhitung, skornya akan berbeda jauh - dan
    // pembanding ini tetap tajam walau pemetaan komponennya berubah di kemudian hari.
    const bersih = buildIntradaySignals(flatSession(100), CONFIG).find((s) => s.signalMinute === 9 * 60 + 30)!;
    expect(at0930.score).toBe(bersih.score);
  });

  it('entry memakai harga OPEN bar BERIKUTNYA, bukan close bar sinyal', () => {
    const bars = flatSession(100);
    const idx = bars.findIndex((b) => b.wibMinute === 9 * 60 + 30);
    bars[idx] = makeBar(9 * 60 + 30, 100, { open: 111, high: 111, low: 100, close: 100 });

    const signals = buildIntradaySignals(bars, ZERO_COST);
    const signal = signals.find((s) => s.signalMinute === 9 * 60 + 30)!;
    const outcome = simulateIntradayOutcome(signal, bars, 'H15', ZERO_COST);
    expect(outcome.entryPriceRaw).toBe(111);
    expect(outcome.entryWibIso).toBe('2026-08-10T09:30:00+07:00');
  });

  it('sinyal hanya dibangkitkan pada titik grid di dalam sesi', () => {
    const signals = buildIntradaySignals(flatSession(100), CONFIG);
    const minutes = signals.map((s) => s.signalMinute);
    expect(minutes).not.toContain(12 * 60 + 30);
    expect(minutes).toContain(9 * 60 + 30);
    expect(minutes).toContain(13 * 60 + 30);
  });
});

describe('exit per horizon', () => {
  const bars = flatSession(100);
  const signal = buildIntradaySignals(bars, ZERO_COST).find((s) => s.signalMinute === 10 * 60)!;

  it('H15 keluar tepat 15 menit setelah entry', () => {
    const outcome = simulateIntradayOutcome(signal, bars, 'H15', ZERO_COST);
    // Entry bar 10:00 (mulai), exit bar 10:10 (selesai 10:15).
    expect(outcome.exitWibIso).toBe('2026-08-10T10:10:00+07:00');
    expect(outcome.exitReason).toBe('HORIZON');
  });

  it('H30 dan H60 keluar sesuai horizonnya', () => {
    expect(simulateIntradayOutcome(signal, bars, 'H30', ZERO_COST).exitWibIso).toBe('2026-08-10T10:25:00+07:00');
    expect(simulateIntradayOutcome(signal, bars, 'H60', ZERO_COST).exitWibIso).toBe('2026-08-10T10:55:00+07:00');
  });

  it('EOD keluar di batas cutoff, bukan di lelang penutupan', () => {
    const outcome = simulateIntradayOutcome(signal, bars, 'EOD', ZERO_COST);
    expect(outcome.exitReason).toBe('EOD');
    expect(outcome.exitWibIso).toBe('2026-08-10T15:40:00+07:00');
  });

  it('horizon yang jatuh di jeda sesi menggeser exit ke bar pertama setelah jeda dan menandainya', () => {
    const lateSignal = buildIntradaySignals(bars, ZERO_COST).find((s) => s.signalMinute === 11 * 60)!;
    const bars60 = simulateIntradayOutcome(lateSignal, bars, 'H60', ZERO_COST);
    // 11:00 + 60 menit = 12:00, tepat di ujung sesi I - masih tercapai secara alami.
    expect(bars60.exitReason).toBe('HORIZON');

    const brokenBars = bars.filter((b) => b.wibMinute < 11 * 60 + 30 || b.wibMinute >= 13 * 60 + 30);
    const brokenSignal = buildIntradaySignals(brokenBars, ZERO_COST).find((s) => s.signalMinute === 11 * 60)!;
    const shifted = simulateIntradayOutcome(brokenSignal, brokenBars, 'H60', ZERO_COST);
    expect(shifted.exitReason).toBe('HORIZON_AFTER_BREAK');
    expect(shifted.exitWibIso).toBe('2026-08-10T13:30:00+07:00');
  });

  it('sinyal terlalu dekat penutupan menghasilkan exit EOD, bukan horizon palsu', () => {
    const lastSignal = buildIntradaySignals(bars, ZERO_COST).find((s) => s.signalMinute === 15 * 60)!;
    const outcome = simulateIntradayOutcome(lastSignal, bars, 'H60', ZERO_COST);
    expect(outcome.exitReason).toBe('EOD');
    expect(outcome.exitWibIso).toBe('2026-08-10T15:40:00+07:00');
  });
});

describe('no-fill dan data hilang', () => {
  it('tidak ada bar setelah sinyal berarti NO_FILL, bukan transaksi dipaksakan', () => {
    const bars = flatSession(100).filter((b) => b.wibMinute <= 10 * 60 - 5);
    const signal = {
      ticker: 'BBCA.JK',
      tradingDate: DATE,
      signalMinute: 10 * 60,
      signalWibIso: '2026-08-10T10:00:00+07:00',
      score: 50,
      bucket: '50-59' as const,
      components: computeIntradayComponents(bars)!,
    };
    const outcome = simulateIntradayOutcome(signal, bars, 'H15', ZERO_COST);
    expect(outcome.fillStatus).toBe('NO_FILL');
    expect(outcome.dataQualityStatus).toBe('NO_ENTRY_BAR');
    expect(outcome.netReturn).toBeNull();
  });

  it('lubang candle terlalu lebar di titik entry ditandai ENTRY_BAR_GAP', () => {
    const bars = flatSession(100).filter(
      (b) => b.wibMinute < 10 * 60 || b.wibMinute > 10 * 60 + 20
    );
    const signal = buildIntradaySignals(bars, ZERO_COST).find((s) => s.signalMinute === 10 * 60)!;
    const outcome = simulateIntradayOutcome(signal, bars, 'H15', ZERO_COST);
    expect(outcome.fillStatus).toBe('NO_FILL');
    expect(outcome.dataQualityStatus).toBe('ENTRY_BAR_GAP');
  });
});

describe('biaya, slippage, MFE/MAE', () => {
  it('net return memperhitungkan fee dua sisi dan slippage dua sisi', () => {
    const bars = flatSession(100);
    const signal = buildIntradaySignals(bars, COST_ONLY).find((s) => s.signalMinute === 10 * 60)!;
    const outcome = simulateIntradayOutcome(signal, bars, 'H15', COST_ONLY);

    expect(outcome.grossReturn).toBe(0); // harga datar
    expect(outcome.netReturn).toBeLessThan(0);
    // NORMAL: beli 0,15% + jual 0,25% + slippage 10 bps x 2 = sekitar -0,60%.
    expect(outcome.netReturn!).toBeCloseTo(-0.006, 3);
    expect(outcome.totalCost).toBeCloseTo(0.006, 3);
  });

  it('skenario slippage yang lebih buruk menghasilkan net return yang lebih buruk', () => {
    const bars = flatSession(100);
    const config = (scenario: keyof typeof INTRADAY_COST_SCENARIOS) =>
      defaultIntradayRunConfig({ cost: INTRADAY_COST_SCENARIOS[scenario]!, priceFractions: NO_SPREAD_FLOOR });
    const signal = buildIntradaySignals(bars, COST_ONLY).find((s) => s.signalMinute === 10 * 60)!;
    const low = simulateIntradayOutcome(signal, bars, 'H15', config('LOW_SLIPPAGE')).netReturn!;
    const high = simulateIntradayOutcome(signal, bars, 'H15', config('HIGH_SLIPPAGE')).netReturn!;
    expect(high).toBeLessThan(low);
  });

  it('lantai slippage sisi jual memakai harga exit saat melintasi pita fraksi IDX', () => {
    const zeroCostWithTicks = defaultIntradayRunConfig({
      cost: { version: 'test-zero', label: 'tanpa biaya', buyFeePct: 0, sellFeePct: 0, slippageEntryBps: 0, slippageExitBps: 0 },
    });
    // Entry Rp499: setengah tick Rp1 = ~20 bps. Exit Rp500: setengah tick Rp2,5 = 50 bps.
    // Jika sisi jual salah memakai harga entry, hasilnya sekitar -0,20%, bukan -0,50%.
    const bars = flatSession(499);
    const exitIndex = bars.findIndex((b) => b.wibMinute === 10 * 60 + 10);
    bars[exitIndex] = makeBar(10 * 60 + 10, 500, { open: 500, high: 500, low: 500, close: 500 });
    const signal = buildIntradaySignals(bars, zeroCostWithTicks).find((s) => s.signalMinute === 10 * 60)!;
    const outcome = simulateIntradayOutcome(signal, bars, 'H15', zeroCostWithTicks);

    expect(outcome.entrySlippageBpsApplied).toBeCloseTo(20.04, 2);
    expect(outcome.exitSlippageBpsApplied).toBe(50);
    expect(outcome.netReturn).toBeCloseTo(-0.005, 6);
    expect(netReturnUnderCost(499, 500, zeroCostWithTicks.cost, zeroCostWithTicks.priceFractions)).toBeCloseTo(-0.005, 6);
  });

  it('MFE dan MAE diukur terhadap harga entry termasuk waktu tercapainya', () => {
    const bars = flatSession(100);
    const up = bars.findIndex((b) => b.wibMinute === 10 * 60 + 5);
    bars[up] = makeBar(10 * 60 + 5, 100, { high: 110, low: 100 });
    const down = bars.findIndex((b) => b.wibMinute === 10 * 60 + 10);
    bars[down] = makeBar(10 * 60 + 10, 100, { high: 100, low: 90 });

    const signal = buildIntradaySignals(bars, ZERO_COST).find((s) => s.signalMinute === 10 * 60)!;
    const outcome = simulateIntradayOutcome(signal, bars, 'H15', ZERO_COST);
    expect(outcome.mfe).toBeCloseTo(0.1, 6);
    expect(outcome.mae).toBeCloseTo(-0.1, 6);
    expect(outcome.minutesToMfe).toBe(10);
    expect(outcome.minutesToMae).toBe(15);
  });
});

describe('TP/SL', () => {
  const tpSlConfig = defaultIntradayRunConfig({
    takeProfitPct: 2,
    stopLossPct: 2,
    cost: { version: 'test-zero', label: 'tanpa biaya', buyFeePct: 0, sellFeePct: 0, slippageEntryBps: 0, slippageExitBps: 0 },
    priceFractions: NO_SPREAD_FLOOR,
  });

  it('satu bar yang menyentuh TP dan SL sekaligus diasumsikan SL (konservatif)', () => {
    const bars = flatSession(100);
    const idx = bars.findIndex((b) => b.wibMinute === 10 * 60 + 5);
    bars[idx] = makeBar(10 * 60 + 5, 100, { high: 105, low: 95 });

    const signal = buildIntradaySignals(bars, tpSlConfig).find((s) => s.signalMinute === 10 * 60)!;
    const outcome = simulateIntradayOutcome(signal, bars, 'H60', tpSlConfig);
    expect(outcome.exitReason).toBe('TP_SL_SAME_BAR_CONSERVATIVE');
    expect(outcome.hitStopLoss).toBe(true);
    expect(outcome.netReturn!).toBeCloseTo(-0.02, 6);
  });

  it('TP tercapai sendirian menghasilkan exit TAKE_PROFIT', () => {
    const bars = flatSession(100);
    const idx = bars.findIndex((b) => b.wibMinute === 10 * 60 + 5);
    bars[idx] = makeBar(10 * 60 + 5, 100, { high: 105, low: 99.5 });

    const signal = buildIntradaySignals(bars, tpSlConfig).find((s) => s.signalMinute === 10 * 60)!;
    const outcome = simulateIntradayOutcome(signal, bars, 'H60', tpSlConfig);
    expect(outcome.exitReason).toBe('TAKE_PROFIT');
    expect(outcome.netReturn!).toBeCloseTo(0.02, 6);
  });

  it('gap turun melewati stop-loss keluar pada open yang lebih buruk, bukan harga SL semu', () => {
    const bars = flatSession(100);
    const idx = bars.findIndex((b) => b.wibMinute === 10 * 60 + 5);
    bars[idx] = makeBar(10 * 60 + 5, 95, { open: 95, high: 96, low: 94, close: 95 });

    const signal = buildIntradaySignals(bars, tpSlConfig).find((s) => s.signalMinute === 10 * 60)!;
    const outcome = simulateIntradayOutcome(signal, bars, 'H60', tpSlConfig);
    expect(outcome.exitReason).toBe('STOP_LOSS');
    expect(outcome.exitPriceRaw).toBe(95);
    expect(outcome.netReturn).toBeCloseTo(-0.05, 6);
  });
});

describe('lantai spread dari fraksi harga IDX', () => {
  it('saham murah kena lantai setengah tick, bukan asumsi slippage datar', () => {
    // Rp 174: tick Rp 1, setengah tick ~28,7 bps - jauh di atas asumsi 10 bps.
    const bars = flatSession(174);
    const signal = buildIntradaySignals(bars, CONFIG).find((s) => s.signalMinute === 10 * 60)!;
    const outcome = simulateIntradayOutcome(signal, bars, 'H15', CONFIG);
    expect(outcome.spreadFloorBinding).toBe(true);
    expect(outcome.slippageBpsApplied!).toBeCloseTo(28.7, 1);
  });

  it('lantai masih mengikat bahkan pada saham papan atas Rp 6.425', () => {
    // Tick Rp 25 pada harga Rp 6.425 = 19,5 bps setengah spread - hampir dua kali
    // asumsi datar 10 bps. Inilah kenapa asumsi datar itu terlalu optimistis.
    const bars = flatSession(6425);
    const signal = buildIntradaySignals(bars, CONFIG).find((s) => s.signalMinute === 10 * 60)!;
    const outcome = simulateIntradayOutcome(signal, bars, 'H15', CONFIG);
    expect(outcome.spreadFloorBinding).toBe(true);
    expect(outcome.slippageBpsApplied!).toBeCloseTo(19.46, 1);
  });

  it('barulah pada harga sangat tinggi asumsi konfigurasi yang menang', () => {
    const bars = flatSession(24450);
    const signal = buildIntradaySignals(bars, CONFIG).find((s) => s.signalMinute === 10 * 60)!;
    const outcome = simulateIntradayOutcome(signal, bars, 'H15', CONFIG);
    expect(outcome.spreadFloorBinding).toBe(false);
    expect(outcome.slippageBpsApplied).toBe(10);
  });

  it('lantai membuat saham murah lebih rugi daripada saham mahal pada harga datar', () => {
    const cheap = flatSession(174);
    const rich = flatSession(24450);
    const netOf = (bars: typeof cheap) => {
      const signal = buildIntradaySignals(bars, CONFIG).find((s) => s.signalMinute === 10 * 60)!;
      return simulateIntradayOutcome(signal, bars, 'H15', CONFIG).netReturn!;
    };
    expect(netOf(cheap)).toBeLessThan(netOf(rich));
  });

  it('lantai TIDAK PERNAH menurunkan biaya di bawah asumsi konfigurasi', () => {
    const bars = flatSession(24450);
    const highSlip = defaultIntradayRunConfig({ cost: INTRADAY_COST_SCENARIOS.HIGH_SLIPPAGE! });
    const signal = buildIntradaySignals(bars, highSlip).find((s) => s.signalMinute === 10 * 60)!;
    expect(simulateIntradayOutcome(signal, bars, 'H15', highSlip).slippageBpsApplied).toBe(40);
  });
});

describe('penandaan kelayakan transaksi', () => {
  it('sesi ramai dengan harga wajar ditandai layak', () => {
    const bars = flatSession(1000).map((b) => ({ ...b, volume: 5_000_000 }));
    const signal = buildIntradaySignals(bars, CONFIG).find((s) => s.signalMinute === 10 * 60)!;
    expect(simulateIntradayOutcome(signal, bars, 'H15', CONFIG).tradable).toBe(true);
  });

  it('saham gocap ditandai tidak layak tetapi TETAP menghasilkan outcome', () => {
    const bars = flatSession(50).map((b) => ({ ...b, volume: 50_000_000 }));
    const signal = buildIntradaySignals(bars, CONFIG).find((s) => s.signalMinute === 10 * 60)!;
    const outcome = simulateIntradayOutcome(signal, bars, 'H15', CONFIG);
    expect(outcome.tradable).toBe(false);
    // Kuncinya: sinyalnya TIDAK dibuang dari populasi.
    expect(outcome.fillStatus).toBe('FILLED');
    expect(outcome.netReturn).not.toBeNull();
  });

  it('sesi sepi ditandai tidak layak', () => {
    const bars = flatSession(1000).map((b) => ({ ...b, volume: 10 }));
    const signal = buildIntradaySignals(bars, CONFIG).find((s) => s.signalMinute === 10 * 60)!;
    expect(simulateIntradayOutcome(signal, bars, 'H15', CONFIG).tradable).toBe(false);
  });
});

describe('pemetaan komponen configurable', () => {
  it('rentang lebih sempit membuat momentum yang sama mencapai ujung skala', () => {
    const rising = Array.from({ length: 12 }, (_, i) => makeBar(9 * 60 + i * 5, 100 + i * 0.1));
    const wide = computeIntradayComponents(rising, { momentumAbs: 0.05, vwapDeviationAbs: 0.01, volumeSurgeCenter: 0.72, volumeSurgeSpan: 3.5 })!;
    const narrow = computeIntradayComponents(rising, { momentumAbs: 0.001, vwapDeviationAbs: 0.01, volumeSurgeCenter: 0.72, volumeSurgeSpan: 3.5 })!;
    expect(narrow.scored.momentum).toBe(100);
    expect(wide.scored.momentum).toBeLessThan(100);
    // Nilai MENTAH-nya identik - yang berubah hanya pemetaannya, bukan datanya.
    expect(narrow.raw.momentum).toBe(wide.raw.momentum);
  });
});

describe('simulateAllHorizons', () => {
  it('mengembalikan satu hasil per horizon, tanpa menggabungkannya', () => {
    const bars = flatSession(100);
    const signal = buildIntradaySignals(bars, CONFIG).find((s) => s.signalMinute === 10 * 60)!;
    const outcomes = simulateAllHorizons(signal, bars, CONFIG);
    expect(outcomes.map((o) => o.horizon)).toEqual(['H15', 'H30', 'H60', 'EOD']);
  });
});
