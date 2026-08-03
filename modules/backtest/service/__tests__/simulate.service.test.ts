import { describe, it, expect } from 'vitest';
import { simulateBacktest } from '../simulate.service';
import type { BacktestIndicatorCache, IndicatorName, Decision } from '../../types/backtest.types';

const ALL_INDICATORS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];

function neutralDecisions(days: number): Record<IndicatorName, Decision[]> {
  const map = {} as Record<IndicatorName, Decision[]>;
  ALL_INDICATORS.forEach((name) => { map[name] = new Array(days).fill('NEUTRAL'); });
  return map;
}

function dateAt(i: number): string {
  const d = new Date(2024, 0, 1 + i);
  return d.toISOString().split('T')[0];
}

function makeCache(days: number): BacktestIndicatorCache {
  const bars = Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: 1000, open: 1000 }));
  return {
    computedAt: '2026-08-01T00:00:00.000Z',
    ihsg: bars.map((b) => ({ ...b })),
    tickers: [{ ticker: 'TEST.JK', bars: bars.map((b) => ({ ...b })), decisions: neutralDecisions(days) }],
  };
}

describe('simulateBacktest', () => {
  it('tidak ada trade kalau filter tidak pernah semua BULLISH - metrik nol, bukan NaN/Infinity', () => {
    const cache = makeCache(66); // 3 bulan ~= 66 hari bursa
    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    expect(result.totalTrades).toBe(0);
    expect(result.winRatePct).toBe(0);
    expect(Number.isFinite(result.winRatePct)).toBe(true);
    expect(Number.isFinite(result.returnPct)).toBe(true);
    expect(result.equityCurve[0]).toBe(100_000_000);
  });

  it('sinyal hari D baru dieksekusi di OPEN hari D+1 (bukan close hari yang sama) - anti look-ahead', () => {
    const days = 66;
    const cache = makeCache(days);
    const decisions = cache.tickers[0].decisions;
    const bars = cache.tickers[0].bars;

    // BULLISH terus dari hari 0 sampai hari 20, lalu balik BEARISH - harga naik terus
    // supaya trade ini profit (memverifikasi arah pnl juga benar setelah fee/slippage).
    // Harus BEARISH, bukan NEUTRAL: sejak aturan exit majorityBearish, sinyal yang cuma
    // meluruh ke NEUTRAL tidak memicu jual sama sekali (lihat test khusus di bawah).
    for (let i = 0; i < days; i++) {
      decisions['RSI 14'][i] = i <= 20 ? 'BULLISH' : 'BEARISH';
      bars[i].close = 1000 + i * 10;
      bars[i].open = 1000 + i * 10;
    }

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    expect(result.totalTrades).toBe(1);
    // Sinyal muncul hari 0, tapi baru bisa dieksekusi di open hari 1 - bukan hari 0.
    expect(result.trades[0].entryDate).toBe(dateAt(1));
    // Sinyal berbalik hari 21, dieksekusi di open hari 22.
    expect(result.trades[0].date).toBe(dateAt(22));
    expect(result.trades[0].pnlPct).toBeGreaterThan(0);
    expect(result.winRatePct).toBe(100);
  });

  // Aturan exit: posisi dijual hanya kalau LEBIH DARI SEPARUH filter terpilih benar-benar
  // BEARISH. Dulu satu filter yang berhenti BULLISH sudah cukup untuk jual - dengan filter
  // yang berfluktuasi harian (mis. Volume vs Avg 20D) itu bikin rata-rata hold ~3 hari dan
  // hasil backtest habis digerus fee bolak-balik, bukan oleh arah harga.
  const threeFilters: IndicatorName[] = ['RSI 14', 'MACD', 'EMA 20/50 Cross'];

  function makeCacheWithFilters(days: number, decide: (name: IndicatorName, day: number) => Decision) {
    const cache = makeCache(days);
    ALL_INDICATORS.forEach((name) => {
      cache.tickers[0].decisions[name] = Array.from({ length: days }, (_, i) => decide(name, i));
    });
    return cache;
  }

  it('satu filter berbalik BEARISH belum cukup untuk jual - posisi tetap dipegang', () => {
    const days = 66;
    const cache = makeCacheWithFilters(days, (name, i) =>
      name === 'MACD' && i >= 20 ? 'BEARISH' : 'BULLISH'
    );

    const result = simulateBacktest(cache, { filters: threeFilters, modal: 100_000_000, periodMonths: 3 });

    expect(result.totalTrades).toBe(1);
    // 1 dari 3 filter BEARISH - belum mayoritas, jadi posisi baru lepas saat force-close
    // di hari terakhir periode, bukan sehari setelah MACD berbalik.
    expect(result.trades[0].date).toBe(dateAt(days - 1));
  });

  it('mayoritas filter BEARISH memicu jual, dieksekusi di open hari berikutnya', () => {
    const days = 66;
    const cache = makeCacheWithFilters(days, (name, i) =>
      (name === 'MACD' || name === 'EMA 20/50 Cross') && i >= 20 ? 'BEARISH' : 'BULLISH'
    );

    const result = simulateBacktest(cache, { filters: threeFilters, modal: 100_000_000, periodMonths: 3 });

    expect(result.totalTrades).toBe(1);
    // 2 dari 3 filter BEARISH di hari 20 - order jual diantre, tereksekusi open hari 21.
    expect(result.trades[0].date).toBe(dateAt(21));
  });

  it('filter yang cuma meluruh ke NEUTRAL tidak memicu jual - NEUTRAL bukan BEARISH', () => {
    const days = 66;
    const cache = makeCacheWithFilters(days, (_name, i) => (i >= 20 ? 'NEUTRAL' : 'BULLISH'));

    const result = simulateBacktest(cache, { filters: threeFilters, modal: 100_000_000, periodMonths: 3 });

    expect(result.totalTrades).toBe(1);
    expect(result.trades[0].date).toBe(dateAt(days - 1));
  });

  it('buy/sell price sudah net slippage+fee, bukan harga open mentah', () => {
    const days = 66; // >= periodMonths*22 hari bursa, kalau kurang ticker ini kefilter (index.size check)
    const cache = makeCache(days);
    const decisions = cache.tickers[0].decisions;
    const bars = cache.tickers[0].bars;
    decisions['RSI 14'] = new Array(days).fill('BULLISH');
    bars.forEach((b) => { b.close = 1000; b.open = 1000; });

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    // Entry hari 1 di open 1000, harus LEBIH MAHAL dari 1000 (slippage+fee beli).
    expect(result.trades[0].buy).toBeGreaterThan(1000);
    // Force-close di harga close 1000, harus LEBIH MURAH dari 1000 (slippage+fee jual).
    expect(result.trades[0].sell).toBeLessThan(1000);
    // Harga beli & jual sama-sama 1000 sebelum biaya -> net PnL harus negatif (cuma
    // bayar fee bolak-balik, tidak ada pergerakan harga sama sekali).
    expect(result.trades[0].pnlPct).toBeLessThan(0);
  });

  it('maksimal 5 posisi terbuka bersamaan, equal-weight dari ekuitas saat itu', () => {
    const days = 66;
    const cache: BacktestIndicatorCache = {
      computedAt: '2026-08-01T00:00:00.000Z',
      ihsg: Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: 1000, open: 1000 })),
      tickers: Array.from({ length: 8 }, (_, tIdx) => ({
        ticker: `T${tIdx}.JK`,
        bars: Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: 1000, open: 1000 })),
        // Semua 8 saham sinyal BULLISH terus sepanjang periode - cuma 5 yang boleh terisi.
        decisions: (() => {
          const m = {} as Record<IndicatorName, Decision[]>;
          ALL_INDICATORS.forEach((name) => { m[name] = new Array(days).fill(name === 'RSI 14' ? 'BULLISH' : 'NEUTRAL'); });
          return m;
        })(),
      })),
    };

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    // Tidak ada exit (sinyal BULLISH terus), jadi posisi terbuka di-force-close di
    // akhir periode - totalTrades harus PERSIS 5 (bukan 8), membuktikan cap slot.
    expect(result.totalTrades).toBe(5);
  });

  it('saat kandidat lebih banyak dari slot, yang dibeli adalah sinyal terkuat - bukan yang paling awal di daftar universe', () => {
    const days = 66;
    // 8 saham sama-sama lolos filter 'RSI 14', tapi jumlah indikator BULLISH lainnya
    // berbeda: T0 paling lemah (cuma RSI), T7 paling kuat. Sengaja disusun terbalik dari
    // urutan array supaya seleksi yang cuma mengikuti urutan universe langsung ketahuan.
    const extraBullishByIndex = [0, 0, 0, 1, 2, 3, 4, 5];
    const cache: BacktestIndicatorCache = {
      computedAt: '2026-08-01T00:00:00.000Z',
      ihsg: Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: 1000, open: 1000 })),
      tickers: extraBullishByIndex.map((extra, tIdx) => ({
        ticker: `T${tIdx}.JK`,
        bars: Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: 1000, open: 1000 })),
        decisions: (() => {
          const m = {} as Record<IndicatorName, Decision[]>;
          const others = ALL_INDICATORS.filter((n) => n !== 'RSI 14');
          ALL_INDICATORS.forEach((name) => {
            const isBullish = name === 'RSI 14' || others.indexOf(name) < extra;
            m[name] = new Array(days).fill(isBullish ? 'BULLISH' : 'NEUTRAL');
          });
          return m;
        })(),
      })),
    };

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    const bought = Array.from(new Set(result.trades.map((t) => t.symbol))).sort();
    expect(bought).toEqual(['T3.JK', 'T4.JK', 'T5.JK', 'T6.JK', 'T7.JK']);
  });

  it('posisi yang masih terbuka di akhir periode di-force-close, bukan diabaikan', () => {
    const days = 66;
    const cache = makeCache(days);
    // BULLISH dari awal sampai akhir, tidak pernah exit sebelum periode habis.
    cache.tickers[0].decisions['RSI 14'] = new Array(days).fill('BULLISH');
    cache.tickers[0].bars.forEach((b, i) => { b.close = 1000 + i; b.open = 1000 + i; });

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    expect(result.totalTrades).toBe(1);
    expect(result.trades[0].date).toBe(dateAt(days - 1)); // exit dipaksa di hari terakhir
  });

  // endDate memungkinkan uji jendela NON-OVERLAP (walk-forward). Tanpa ini setiap
  // periode selalu berakhir di bar terakhir, jadi hasil 3/6/12/24 bulan saling tumpang
  // tindih dan bukan bukti yang saling bebas.
  it('endDate menggeser jendela simulasi ke masa lalu, tidak selalu berakhir di bar terakhir', () => {
    const days = 100;
    const cache = makeCache(days);
    cache.tickers[0].decisions['RSI 14'] = new Array(days).fill('BULLISH');
    cache.tickers[0].bars.forEach((b, i) => { b.close = 1000 + i; b.open = 1000 + i; });

    const cutoff = dateAt(70);
    const result = simulateBacktest(cache, {
      filters: ['RSI 14'],
      modal: 100_000_000,
      periodMonths: 3,
      endDate: cutoff,
    });

    expect(result.totalTrades).toBe(1);
    // Posisi di-force-close di hari terakhir JENDELA (cutoff), bukan hari terakhir data.
    expect(result.trades[0].date).toBe(cutoff);
  });

  it('tanpa endDate perilaku tidak berubah - jendela tetap berakhir di bar terakhir', () => {
    const days = 100;
    const cache = makeCache(days);
    cache.tickers[0].decisions['RSI 14'] = new Array(days).fill('BULLISH');

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    expect(result.trades[0].date).toBe(dateAt(days - 1));
  });

  it('dua jendela endDate yang berbeda menghasilkan periode trade yang tidak tumpang tindih', () => {
    const days = 200;
    const cache = makeCache(days);
    cache.tickers[0].decisions['RSI 14'] = new Array(days).fill('BULLISH');

    const older = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3, endDate: dateAt(65) });
    const newer = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3, endDate: dateAt(131) });

    expect(older.trades[0].date).toBe(dateAt(65));
    expect(newer.trades[0].date).toBe(dateAt(131));
    // Entry jendela kedua harus SETELAH exit jendela pertama - benar-benar terpisah.
    expect(newer.trades[0].entryDate > older.trades[0].date).toBe(true);
  });

  it('alpha vs IHSG dihitung dari perbandingan return strategi vs return IHSG di window yang sama', () => {
    const days = 66;
    const cache = makeCache(days);
    cache.ihsg.forEach((b, i) => { b.close = 7000 + i * 5; }); // IHSG naik terus

    const result = simulateBacktest(cache, { filters: ['RSI 14'], modal: 100_000_000, periodMonths: 3 });

    const expectedIhsgReturn = ((cache.ihsg[days - 1].close - cache.ihsg[0].close) / cache.ihsg[0].close) * 100;
    expect(result.ihsgReturnPct).toBeCloseTo(expectedIhsgReturn, 1);
    expect(result.alphaPct).toBeCloseTo(result.returnPct - result.ihsgReturnPct, 1);
  });
});
