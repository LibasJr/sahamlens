import { describe, expect, it } from 'vitest';
import {
  costOfEquity,
  impliedMultiples,
  MACRO_ASSUMPTIONS,
  scoreMultipleRatio,
  sustainableGrowth,
} from '../fair-multiples.service';
import {
  buildLongTradingSetup,
  DEFAULT_TRADING_SETUP_PARAMETERS,
  idxTick,
  roundToIdxTick,
} from '@/modules/recommendation/service/trading-setup';

/**
 * GOLDEN TEST VALUASI & SETUP (temuan M-10 audit kuantitatif 2026-08-11).
 *
 * Sebelum file ini: pencarian "fair value" di seluruh test suite menghasilkan NOL file.
 * `impliedMultiples()` - yang menentukan PBV & PER wajar setiap emiten, dan lewat itu
 * seluruh kelompok Valuasi di LensScore - tidak punya satu pun test.
 *
 * Nilai acuan dihitung ulang oleh implementasi terpisah dari rumusnya:
 *
 *     r    = (Rf + beta x ERP) / 100                 [CAPM]
 *     g    = min(cap, (ROE/100) x (1 - payout))      [pertumbuhan berkelanjutan]
 *     PBV* = (ROE - g) / (r - g)                     [Gordon, bentuk residual income]
 *     PER* = (1 - g/ROE) x (1 + g) / (r - g)
 *
 * Bukan disalin dari keluaran kode yang diuji.
 */

describe('GOLDEN - biaya ekuitas & pertumbuhan', () => {
  it('CAPM memakai beta emiten kalau ada', () => {
    const result = costOfEquity({ beta: 1.2, fallbackBeta: 1.0 });
    // (6,7 + 1,2 x 5,2) / 100 = 0,1294
    expect(result.rate).toBeCloseTo(0.1294, 10);
    expect(result.betaUsed).toBe(1.2);
  });

  it('beta null jatuh ke default sektor dan MENYATAKAN sumbernya', () => {
    const result = costOfEquity({ beta: null, fallbackBeta: 1.1 });
    expect(result.rate).toBeCloseTo(0.1242, 10);
    expect(result.betaUsed).toBe(1.1);
    expect(result.betaSource).toBe('sector-default');
  });

  it('pertumbuhan berkelanjutan dibatasi MAX_PERPETUAL_GROWTH_PCT', () => {
    // ROE 20% x retensi 60% = 12%, jauh di atas batas. Tanpa batas ini, penyebut (r - g)
    // menyusut dan penggandanya meledak.
    expect(sustainableGrowth(20, 0.4)).toBe(MACRO_ASSUMPTIONS.MAX_PERPETUAL_GROWTH_PCT / 100);
    // ROE 5% x retensi 60% = 3%, di bawah batas - dipakai apa adanya.
    expect(sustainableGrowth(5, 0.4)).toBeCloseTo(0.03, 10);
    expect(sustainableGrowth(null, 0.4)).toBe(0);
    expect(sustainableGrowth(-8, 0.4)).toBe(0);
  });

  it('payout tidak diketahui memakai asumsi retensi 60%, bukan 100%', () => {
    expect(sustainableGrowth(5, null)).toBeCloseTo(0.03, 10);
  });
});

describe('GOLDEN - impliedMultiples', () => {
  it('kasus A: ROE 20%, payout 0,4, beta 1,2', () => {
    const out = impliedMultiples({ roePct: 20, payoutRatio: 0.4, beta: 1.2, fallbackBeta: 1.0 });
    expect(out.costOfEquityPct).toBeCloseTo(12.94, 10);
    expect(out.growthPct).toBeCloseTo(5, 10);
    expect(out.fairPbv).toBeCloseTo(1.8891687657430731, 10);
    expect(out.fairPer).toBeCloseTo(9.918136020151133, 10);
    expect(out.fairPerBasis).toBe('gordon');
  });

  it('kasus B: ROE tidak tersedia -> PER perpetuitas tanpa pertumbuhan, DITANDAI', () => {
    const out = impliedMultiples({ roePct: null, payoutRatio: null, beta: null, fallbackBeta: 1.1 });
    expect(out.fairPbv).toBeNull();
    expect(out.fairPer).toBeCloseTo(8.051529790660224, 10);
    // Tanda ini yang mencegah angka bersyarat disajikan setara dengan angka penuh.
    expect(out.fairPerBasis).toBe('no-growth');
  });

  it('kasus C: ROE 3% dengan retensi penuh -> g dipaksa 0, bukan pengganda negatif', () => {
    const out = impliedMultiples({ roePct: 3, payoutRatio: 0, beta: 1.0, fallbackBeta: 1.0 });
    expect(out.growthPct).toBe(0);
    expect(out.fairPbv).toBeCloseTo(0.25210084033613445, 10);
    expect(out.fairPer).toBeCloseTo(8.403361344537814, 10);
  });

  it('kasus D: ROE 45%, beta rendah 0,5 -> pengganda tinggi tapi terbatas', () => {
    const out = impliedMultiples({ roePct: 45, payoutRatio: 0.1, beta: 0.5, fallbackBeta: 1.0 });
    expect(out.costOfEquityPct).toBeCloseTo(9.3, 10);
    expect(out.fairPbv).toBeCloseTo(9.302325581395348, 10);
    expect(out.fairPer).toBeCloseTo(21.705426356589143, 10);
  });

  it('IDENTITAS MODEL: PBV* = PER* x ROE / (1 + g) pada setiap kasus gordon', () => {
    // Kalau identitas ini pecah, kedua pengganda berasal dari model yang tidak konsisten
    // satu sama lain - persis kegagalan yang membuat payout implisit dipakai.
    for (const roePct of [8, 15, 20, 30, 45]) {
      const out = impliedMultiples({ roePct, payoutRatio: 0.3, beta: 1.0, fallbackBeta: 1.0 });
      const g = out.growthPct / 100;
      expect(out.fairPbv!).toBeCloseTo((out.fairPer! * (roePct / 100)) / (1 + g), 9);
    }
  });

  it('beta ekstrem tidak membuat penggandanya meledak lewat penyebut', () => {
    // Beta sangat rendah membuat r mendekati g; MIN_SPREAD yang menahannya.
    const out = impliedMultiples({ roePct: 25, payoutRatio: 0, beta: -0.2, fallbackBeta: 1.0 });
    expect(Number.isFinite(out.fairPbv!)).toBe(true);
    expect(out.fairPbv!).toBeLessThan(100);
  });
});

describe('GOLDEN - scoreMultipleRatio', () => {
  it('pita nilai persis di batasnya', () => {
    expect(scoreMultipleRatio(null)).toBeNull();
    expect(scoreMultipleRatio(1.30)).toBe(scoreMultipleRatio(1.50));
    expect(scoreMultipleRatio(1.00)).toBe(scoreMultipleRatio(0.95));
    // Monoton: rasio lebih besar (lebih murah relatif terhadap nilai wajar) tidak
    // boleh menghasilkan skor lebih rendah.
    const ratios = [0.4, 0.6, 0.8, 0.95, 1.1, 1.4];
    const scores = ratios.map((r) => scoreMultipleRatio(r)!);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeGreaterThanOrEqual(scores[i - 1]!);
    }
  });
});

describe('GOLDEN - tick IDX', () => {
  it('band tick sesuai aturan bursa', () => {
    expect(idxTick(150)).toBe(1);
    expect(idxTick(199)).toBe(1);
    expect(idxTick(200)).toBe(2);
    expect(idxTick(499)).toBe(2);
    expect(idxTick(500)).toBe(5);
    expect(idxTick(1999)).toBe(5);
    expect(idxTick(2000)).toBe(10);
    expect(idxTick(4999)).toBe(10);
    expect(idxTick(5000)).toBe(25);
    expect(idxTick(100000)).toBe(25);
  });

  it('pembulatan menghormati arah yang diminta', () => {
    // Stop dibulatkan ke BAWAH (risiko tidak boleh diam-diam mengecil), target ke ATAS.
    expect(roundToIdxTick(1003, 'down')).toBe(1000);
    expect(roundToIdxTick(1003, 'up')).toBe(1005);
    expect(roundToIdxTick(1003, 'nearest')).toBe(1005);
    expect(roundToIdxTick(2003, 'down')).toBe(2000);
    expect(roundToIdxTick(2003, 'up')).toBe(2010);
  });
});

describe('GOLDEN - buildLongTradingSetup (cabang ATR, tanpa struktur)', () => {
  // Deret menurun terus: tidak ada support terkonfirmasi di bawah harga sekarang dan
  // tidak ada resistance di atasnya, jadi setup jatuh ke stop berbasis ATR murni.
  // Seluruh angka di bawah bisa dihitung tangan dari parameter default:
  //   stop  = 1000 - 20 x 1,5 = 970      risk = 30
  //   tp1   = 1000 + 30 x 2   = 1060     tp2  = 1000 + 30 x 3 = 1090
  //   cl2   = 1000 - 30 x 2   = 940      rr   = (1060-1000)/30 = 2,0
  const history = Array.from({ length: 40 }, (_, i) => {
    const close = 2000 - i * 20;
    return { date: `2026-01-${String(i + 1).padStart(2, '0')}`, High: close + 10, Low: close - 10, Close: close };
  });

  const setup = buildLongTradingSetup(history, 1000, 20);

  it('setup terbentuk dan memang lewat cabang ATR', () => {
    expect(setup).not.toBeNull();
    expect(setup!.stopSource).toBe('ATR');
    expect(setup!.supportQuality).toBe('NONE');
    expect(setup!.resistance).toBeNull();
  });

  it('entry / stop / TP / CL cocok dengan hitungan tangan', () => {
    expect(setup!.entry).toBe(1000);
    expect(setup!.stop).toBe(970);
    expect(setup!.cl1).toBe(970);
    expect(setup!.tp1).toBe(1060);
    expect(setup!.tp2).toBe(1090);
    expect(setup!.emergencyRiskLevel).toBe(940);
  });

  it('RR, risiko persen, dan risiko dalam ATR cocok dengan hitungan tangan', () => {
    expect(setup!.rr).toBe(2);
    expect(setup!.riskPct).toBe(3);
    expect(setup!.riskAtr).toBe(1.5);
  });

  it('RR dihitung SETELAH pembulatan tick, bukan sebelum', () => {
    // Harga di band tick 25: pembulatan menggeser entry dan stop cukup jauh untuk
    // mengubah RR. Kalau RR dihitung sebelum pembulatan, setup bisa lolos gerbang
    // minimum di atas kertas lalu dikirim ke pengguna dengan RR sebenarnya di bawahnya.
    const mahal = Array.from({ length: 40 }, (_, i) => {
      const close = 12000 - i * 100;
      return { date: `2026-01-${String(i + 1).padStart(2, '0')}`, High: close + 50, Low: close - 50, Close: close };
    });
    const out = buildLongTradingSetup(mahal, 6013, 100);
    expect(out).not.toBeNull();
    const risikoBulat = out!.entry - out!.stop;
    expect(out!.rr).toBeCloseTo((out!.tp1 - out!.entry) / risikoBulat, 2);
    // Seluruh level wajib kelipatan tick bandnya.
    for (const level of [out!.entry, out!.stop, out!.tp1, out!.tp2, out!.emergencyRiskLevel]) {
      expect(level % idxTick(level)).toBe(0);
    }
  });

  it('menolak setup, bukan menurunkan standar, saat RR di bawah minimum', () => {
    // tp1R dipaksa persis di minLongRr lalu minLongRr dinaikkan di atasnya -> parameter
    // tidak sah, dan fungsi harus mengembalikan null.
    const out = buildLongTradingSetup(history, 1000, 20, { minLongRr: 2.5, tp1R: 2 });
    expect(out).toBeNull();
  });

  it('ATR null / nol tidak menghasilkan setup', () => {
    expect(buildLongTradingSetup(history, 1000, null)).toBeNull();
    expect(buildLongTradingSetup(history, 1000, 0)).toBeNull();
  });

  it('parameter default ikut dikembalikan supaya hasil bisa direproduksi', () => {
    expect(setup!.parameters).toEqual(DEFAULT_TRADING_SETUP_PARAMETERS);
  });
});
