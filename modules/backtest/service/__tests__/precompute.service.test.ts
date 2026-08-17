import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../technical', async () => {
  const actual = await vi.importActual<typeof import('../../../technical')>('../../../technical');
  return {
    ...actual,
    fetchYahooHistory: vi.fn(),
  };
});

// Unit test precompute hanya membutuhkan universe minimal.
// Jangan menjalankan seluruh universe production karena tujuan test ini
// adalah memverifikasi fault-isolation, bukan benchmark performa.
vi.mock('../../constants/backtest-universe', () => ({
  BACKTEST_UNIVERSE: ['BBCA.JK', 'BBRI.JK'],
}));

import {
  BACKTEST_PERIOD_MONTHS,
  MAX_BACKTEST_TRADING_DAYS,
  TRADING_DAYS_PER_MONTH,
} from '../../constants/backtest-periods';
import { computeTickerSeries, precomputeBacktestData, RETAIN_DAYS } from '../precompute.service';
import { fetchYahooHistory } from '../../../technical';
import type { OhlcRow } from '../../../technical';

function makeHistory(days: number, startPrice = 1000): OhlcRow[] {
  const rows: OhlcRow[] = [];
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    price += (i % 7 === 0 ? 5 : -2); // pola naik-turun sederhana, bukan random
    const date = new Date(2020, 0, 1 + i).toISOString();
    rows.push({ Date: date, Open: price, High: price + 5, Low: price - 5, Close: price, Volume: 1_000_000 });
  }
  return rows;
}

describe('computeTickerSeries', () => {
  it('mengembalikan null kalau data historis kurang dari buffer lookback 200 hari', () => {
    const history = makeHistory(150);
    expect(computeTickerSeries('TEST.JK', history)).toBeNull();
  });

  it('menghasilkan bars dan decisions sejajar untuk data yang cukup', () => {
    const history = makeHistory(400);
    const result = computeTickerSeries('TEST.JK', history);
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('TEST.JK');
    // 400 hari - 200 buffer = 200 hari keputusan
    expect(result!.bars.length).toBe(200);
    expect(result!.decisions['RSI 14'].length).toBe(200);
    expect(result!.decisions['EMA 20/50 Cross'].length).toBe(200);
    // Setiap keputusan harus salah satu dari 3 nilai yang valid
    const validDecisions = new Set(['BULLISH', 'BEARISH', 'NEUTRAL']);
    result!.decisions['RSI 14'].forEach((d) => expect(validDecisions.has(d)).toBe(true));
  });

  it('memangkas hasil ke RETAIN_DAYS terakhir untuk data yang jauh lebih panjang dari itu', () => {
    // RETAIN_DAYS = 1.340 sejak periode backtest diperpanjang ke 60 bulan (60 x 22 = 1.320
    // bar + margin). Histori 3.000 bar mewakili balasan Yahoo '10y' (~2.467 bar) plus
    // kelebihan, jadi pemangkasannya benar-benar diuji.
    const result = computeTickerSeries('TEST.JK', makeHistory(3000));
    expect(result).not.toBeNull();
    expect(result!.bars.length).toBe(1340);
    expect(result!.decisions['MACD'].length).toBe(1340);
  });

  it('histori 10 tahun tidak dihitung seluruhnya - dipotong SEBELUM loop analyzer', () => {
    // Kalau pemotongannya kembali dilakukan setelah loop, hasilnya tetap 1.340 bar tetapi
    // biayanya 1,7x komputasi untuk keluaran yang identik - dan cron precompute punya
    // batas 60 detik. Yang diuji: bar terakhir tetap bar terakhir, dan bar pertama yang
    // disimpan berjarak persis RETAIN_DAYS dari ujung.
    const history = makeHistory(3000);
    const result = computeTickerSeries('TEST.JK', history)!;
    const tanggalTerakhir = history[history.length - 1]!.Date.split('T')[0];
    const tanggalPertamaDisimpan = history[history.length - 1340]!.Date.split('T')[0];
    expect(result.bars[result.bars.length - 1]!.date).toBe(tanggalTerakhir);
    expect(result.bars[0]!.date).toBe(tanggalPertamaDisimpan);
  });

  it('emiten berhistori pendek tetap menghasilkan deret sependek datanya, bukan null', () => {
    // GOTO hanya punya ~1.040 bar walaupun diminta 10y. Ia harus tetap masuk cache dan
    // gugur belakangan lewat penyaring jendela di simulateBacktest, bukan hilang di sini.
    const result = computeTickerSeries('TEST.JK', makeHistory(1040));
    expect(result).not.toBeNull();
    expect(result!.bars.length).toBe(1040 - 200);
  });
});

describe('precomputeBacktestData', () => {
  it('melewati saham yang gagal fetch tanpa menggagalkan yang lain', async () => {
    const goodHistory = makeHistory(400);
    vi.mocked(fetchYahooHistory).mockImplementation(async (ticker: string) => {
      if (ticker === 'BBCA.JK') return null; // simulasikan satu saham gagal fetch
      return { history: goodHistory, currentPrice: goodHistory[goodHistory.length - 1].Close, regularMarketTime: null, previousClose: null };
    });

    const result = await precomputeBacktestData();

    expect(result.tickers.find((t) => t.ticker === 'BBCA.JK')).toBeUndefined();
    expect(result.tickers.length).toBeGreaterThan(0);
    expect(result.ihsg.length).toBeGreaterThan(0);
    expect(result.computedAt).toBeTruthy();
  });
});

/**
 * INVARIAN LINTAS-FILE: retensi cache harus menutupi periode terpanjang yang boleh diminta.
 *
 * Kalau invarian ini pecah, gejalanya BUKAN error. `simulateBacktest` menyaring emiten yang
 * barnya kurang dari `periodMonths x 22`, jadi periode yang melebihi retensi menghasilkan
 * universe KOSONG - backtest yang "berhasil" dengan 0 trade dan return 0%. Tidak ada test
 * lain yang bisa menangkapnya karena tiga angkanya hidup di tiga file berbeda.
 */
describe('INVARIAN - retensi precompute vs periode yang ditawarkan', () => {
  it('RETAIN_DAYS menutupi periode terpanjang', () => {
    expect(RETAIN_DAYS).toBeGreaterThanOrEqual(MAX_BACKTEST_TRADING_DAYS);
  });

  it('setiap periode yang ditawarkan muat di dalam retensi', () => {
    for (const bulan of BACKTEST_PERIOD_MONTHS) {
      expect(bulan * TRADING_DAYS_PER_MONTH).toBeLessThanOrEqual(RETAIN_DAYS);
    }
  });

  it('daftar periode urut naik dan tidak ada duplikat', () => {
    const urut = [...BACKTEST_PERIOD_MONTHS].sort((a, b) => a - b);
    expect([...BACKTEST_PERIOD_MONTHS]).toEqual(urut);
    expect(new Set(BACKTEST_PERIOD_MONTHS).size).toBe(BACKTEST_PERIOD_MONTHS.length);
  });
});
