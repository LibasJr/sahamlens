import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INTRADAY_CALENDAR,
  DEFAULT_INTRADAY_COMPONENT_MAPPING,
  DEFAULT_INTRADAY_TRADABILITY,
  effectiveSlippageBps,
  idxPriceFraction,
  isIntradayTradable,
  minHalfSpreadBps,
  INTRADAY_COMPONENT_KEYS,
  INTRADAY_COST_SCENARIOS,
  INTRADAY_HORIZONS,
  INTRADAY_HORIZON_MINUTES,
  INTRADAY_MODEL_STATUSES,
  INTRADAY_SCORE_BUCKETS,
  LENS_INTRADAY_MODEL_KEY,
  LENS_INTRADAY_MODEL_VERSION,
  LENS_INTRADAY_WEIGHTS,
  defaultIntradayRunConfig,
  intradayConfigHash,
  intradayScoreBucket,
} from '../intraday-model';
import {
  SCORE_VERSION,
  SIGNAL_VERSION,
  VALUATION_VERSION,
} from '@/modules/lens-radar/constants/model-version';

describe('identitas model terpisah', () => {
  it('model key dan versi tidak bertabrakan dengan LensScore T+20', () => {
    expect(LENS_INTRADAY_MODEL_KEY).toBe('lens_intraday');
    expect(LENS_INTRADAY_MODEL_VERSION).not.toBe(SCORE_VERSION);
    expect(LENS_INTRADAY_MODEL_VERSION).not.toBe(SIGNAL_VERSION);
    expect(LENS_INTRADAY_MODEL_VERSION).not.toBe(VALUATION_VERSION);
  });

  it('PRODUCTION_VALIDATED tidak ada di daftar status yang boleh tampil', () => {
    expect(INTRADAY_MODEL_STATUSES).not.toContain('PRODUCTION_VALIDATED' as never);
    expect(INTRADAY_MODEL_STATUSES).toContain('RESEARCH_ONLY');
    expect(INTRADAY_MODEL_STATUSES).toContain('CANDIDATE_VALIDATED');
  });

  it('bobot LensIntraday berjumlah 100 dan hanya berisi komponen intraday', () => {
    const total = INTRADAY_COMPONENT_KEYS.reduce((sum, key) => sum + LENS_INTRADAY_WEIGHTS[key], 0);
    expect(total).toBe(100);
    // Tidak ada komponen fundamental jangka panjang yang menyamar sebagai sinyal menit.
    expect(Object.keys(LENS_INTRADAY_WEIGHTS)).not.toContain('fundamental');
    expect(Object.keys(LENS_INTRADAY_WEIGHTS)).not.toContain('flow');
  });
});

describe('horizon', () => {
  it('empat horizon terpisah, EOD tidak punya menit tetap', () => {
    expect(INTRADAY_HORIZONS).toEqual(['H15', 'H30', 'H60', 'EOD']);
    expect(INTRADAY_HORIZON_MINUTES.H15).toBe(15);
    expect(INTRADAY_HORIZON_MINUTES.EOD).toBeNull();
  });
});

describe('bucket skor', () => {
  it('memetakan skor ke bucket yang benar termasuk di batas', () => {
    expect(intradayScoreBucket(0)).toBe('<40');
    expect(intradayScoreBucket(39.9)).toBe('<40');
    expect(intradayScoreBucket(40)).toBe('40-49');
    expect(intradayScoreBucket(49.99)).toBe('40-49');
    expect(intradayScoreBucket(80)).toBe('80-100');
    expect(intradayScoreBucket(100)).toBe('80-100');
  });

  it('semua bucket bersambung tanpa celah', () => {
    for (let i = 1; i < INTRADAY_SCORE_BUCKETS.length; i++) {
      expect(INTRADAY_SCORE_BUCKETS[i]!.low).toBe(INTRADAY_SCORE_BUCKETS[i - 1]!.high);
    }
  });
});

describe('config hash', () => {
  it('stabil untuk konfigurasi yang sama', () => {
    expect(intradayConfigHash(defaultIntradayRunConfig())).toBe(intradayConfigHash(defaultIntradayRunConfig()));
  });

  it('berubah kalau satu bobot berubah', () => {
    const a = intradayConfigHash(defaultIntradayRunConfig());
    const b = intradayConfigHash(
      defaultIntradayRunConfig({ weights: { ...LENS_INTRADAY_WEIGHTS, momentum: 31 } })
    );
    expect(a).not.toBe(b);
  });

  it('berubah kalau biaya atau aturan entry berubah', () => {
    const base = intradayConfigHash(defaultIntradayRunConfig());
    expect(intradayConfigHash(defaultIntradayRunConfig({ cost: INTRADAY_COST_SCENARIOS.HIGH_SLIPPAGE! }))).not.toBe(base);
    expect(intradayConfigHash(defaultIntradayRunConfig({ entryLagBars: 2 }))).not.toBe(base);
    expect(
      intradayConfigHash(
        defaultIntradayRunConfig({
          calendar: { ...DEFAULT_INTRADAY_CALENDAR, eodExitCutoffMinute: 15 * 60 + 30 },
        })
      )
    ).not.toBe(base);
  });

  it('tidak berubah hanya karena urutan kunci berbeda', () => {
    const config = defaultIntradayRunConfig();
    const reordered = { ...config, weights: { ...config.weights } };
    expect(intradayConfigHash(reordered)).toBe(intradayConfigHash(config));
  });
});

describe('fraksi harga IDX dan lantai spread', () => {
  // Diverifikasi empiris 2026-08-15 dari bar 5 menit nyata (GCD selisih harga unik):
  // BUMI 174-194 -> 1 | DEWA/KAEF/BULL 410-496 -> 2 | ELSA/KLBF/PGAS 660-1525 -> 5
  // ANTM/BBRI 2970-3220 -> 10 | BBCA/INDF/UNTR/ITMG/GGRM 6200-24450 -> 25
  it.each([
    [174, 1],
    [199, 1],
    [200, 2],
    [460, 2],
    [499, 2],
    [500, 5],
    [715, 5],
    [1525, 5],
    [1999, 5],
    [2000, 10],
    [3160, 10],
    [4999, 10],
    [5000, 25],
    [6425, 25],
    [24450, 25],
  ])('harga %i -> fraksi %i', (price, tick) => {
    expect(idxPriceFraction(price)).toBe(tick);
  });

  it('lantai setengah tick lebih besar dari asumsi datar 10 bps di hampir semua harga', () => {
    // Rp 174, tick Rp 1 -> 0,5 / 174 = ~28,7 bps.
    expect(minHalfSpreadBps(174)).toBeCloseTo(28.7, 1);
    // Rp 6425, tick Rp 25 -> 12,5 / 6425 = ~19,5 bps. MASIH di atas 10 bps.
    expect(minHalfSpreadBps(6425)).toBeCloseTo(19.46, 1);
    // Baru pada harga sangat tinggi lantainya turun di bawah 10 bps:
    // Rp 24.450, tick Rp 25 -> 12,5 / 24.450 = ~5,1 bps.
    expect(minHalfSpreadBps(24450)).toBeCloseTo(5.11, 1);
  });

  it('slippage efektif memakai yang LEBIH BESAR antara asumsi dan lantai', () => {
    // Saham murah: lantai menang telak atas asumsi 10 bps.
    expect(effectiveSlippageBps(174, 10)).toBeCloseTo(28.7, 1);
    // Saham papan atas berharga tinggi: barulah asumsi 10 bps yang menang.
    expect(effectiveSlippageBps(24450, 10)).toBe(10);
    // Asumsi sangat longgar tetap menang - lantai TIDAK PERNAH menurunkan biaya.
    expect(effectiveSlippageBps(174, 100)).toBe(100);
  });

  it('lantai monoton menurun terhadap harga di dalam satu pita', () => {
    expect(minHalfSpreadBps(5000)).toBeGreaterThan(minHalfSpreadBps(24450));
    expect(minHalfSpreadBps(200)).toBeGreaterThan(minHalfSpreadBps(499));
  });

  it('harga tidak valid tidak menghasilkan lantai NaN/Infinity', () => {
    expect(minHalfSpreadBps(0)).toBe(0);
    expect(minHalfSpreadBps(-5)).toBe(0);
    expect(minHalfSpreadBps(Number.NaN)).toBe(0);
  });
});

describe('gerbang kelayakan transaksi intraday', () => {
  const ok = { entryPriceIdr: 1000, sessionTurnoverIdr: 2e9, activeBars: 20 };

  it('meloloskan sinyal yang harganya wajar, ramai, dan sering bertransaksi', () => {
    expect(isIntradayTradable(ok)).toBe(true);
  });

  it('menolak saham gocap', () => {
    expect(isIntradayTradable({ ...ok, entryPriceIdr: 50 })).toBe(false);
  });

  it('menolak sesi yang nilai transaksinya terlalu kecil', () => {
    expect(isIntradayTradable({ ...ok, sessionTurnoverIdr: 1e6 })).toBe(false);
  });

  it('menolak sesi yang barnya jarang bertransaksi', () => {
    expect(isIntradayTradable({ ...ok, activeBars: 2 })).toBe(false);
  });

  it('harga entry tidak diketahui berarti TIDAK layak, bukan diloloskan', () => {
    expect(isIntradayTradable({ ...ok, entryPriceIdr: null })).toBe(false);
  });
});

describe('pemetaan komponen ikut config hash', () => {
  it('mengubah rentang pemetaan menghasilkan config hash berbeda', () => {
    const base = intradayConfigHash(defaultIntradayRunConfig());
    const changed = intradayConfigHash(
      defaultIntradayRunConfig({
        componentMapping: { ...DEFAULT_INTRADAY_COMPONENT_MAPPING, momentumAbs: 0.02 },
      })
    );
    expect(changed).not.toBe(base);
  });

  it('mengubah tabel fraksi harga atau gerbang kelayakan juga mengubah config hash', () => {
    const base = intradayConfigHash(defaultIntradayRunConfig());
    expect(
      intradayConfigHash(defaultIntradayRunConfig({ priceFractions: [{ maxPriceExclusive: Infinity, tickIdr: 1 }] }))
    ).not.toBe(base);
    expect(
      intradayConfigHash(
        defaultIntradayRunConfig({ tradability: { ...DEFAULT_INTRADAY_TRADABILITY, minEntryPriceIdr: 100 } })
      )
    ).not.toBe(base);
  });
});

describe('kalender configurable', () => {
  it('jam bursa tidak hardcode - Jumat berbeda dan libur bisa ditambahkan', () => {
    expect(DEFAULT_INTRADAY_CALENDAR.fridaySessions).not.toEqual(DEFAULT_INTRADAY_CALENDAR.regularSessions);
    expect(Array.isArray(DEFAULT_INTRADAY_CALENDAR.exchangeHolidays)).toBe(true);
    expect(DEFAULT_INTRADAY_CALENDAR.timezone).toBe('Asia/Jakarta');
  });
});
