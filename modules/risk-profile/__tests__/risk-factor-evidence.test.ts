import { describe, expect, it } from 'vitest';

import {
  RISK_FACTOR_BENCHMARK,
  RISK_FACTOR_CAVEATS,
  RISK_FACTOR_EVIDENCE,
  RISK_FACTOR_SAMPLE,
  RISK_PROFILE_COMPOSITE_FACTORS,
} from '../constants/risk-factor-evidence';
import { RISK_PROFILE_OPTIONS } from '../service/risk-profile.service';

/**
 * Uji penjaga. Bukan menguji pasar, tetapi menjaga agar halaman Profil Risiko & Tren tidak
 * pernah menyajikan klaim yang lebih kuat daripada buktinya:
 *  - ciri yang dipakai peringkat harus punya IC positif di train DAN OOS;
 *  - ciri yang buktinya berbalik di OOS harus ditandai tidak kokoh;
 *  - ambang yang dipakai halaman sama dengan ambang yang dipakai pengukuran.
 */
describe('bukti faktor risiko', () => {
  it('hanya mengizinkan ciri yang kokoh (IC positif di train dan OOS) masuk komposit halaman', () => {
    for (const id of RISK_PROFILE_COMPOSITE_FACTORS) {
      const factor = RISK_FACTOR_EVIDENCE.find((entry) => entry.id === id);
      expect(factor, `faktor ${id} harus ada di daftar bukti`).toBeDefined();
      expect(factor?.robust).toBe(true);
      expect((factor?.icTrain ?? 0) > 0).toBe(true);
      expect((factor?.icOos ?? 0) > 0).toBe(true);
    }
  });

  it('menandai ciri yang berbalik di OOS sebagai tidak kokoh', () => {
    const momentum = RISK_FACTOR_EVIDENCE.find((entry) => entry.id === 'mom_12_1');
    const liquidity = RISK_FACTOR_EVIDENCE.find((entry) => entry.id === 'liquidity');
    expect(momentum?.robust).toBe(false);
    expect(liquidity?.robust).toBe(false);
    expect((liquidity?.icOos ?? 0) < 0).toBe(true);
  });

  it('tidak pernah memasukkan faktor skor produksi ke peringkat', () => {
    for (const id of RISK_PROFILE_COMPOSITE_FACTORS) {
      expect(id.startsWith('score_')).toBe(false);
    }
  });

  it('memakai ambang jendela yang sama dengan pengukuran', () => {
    expect(RISK_PROFILE_OPTIONS.highWindow).toBe(252);
    expect(RISK_PROFILE_OPTIONS.volatilityWindow).toBe(60);
    expect(RISK_PROFILE_OPTIONS.volatilityShortWindow).toBe(20);
    expect(RISK_PROFILE_OPTIONS.minimumAvgTradedValue20d).toBe(RISK_FACTOR_SAMPLE.minimumLiquidityIdr);
  });

  it('menjaga arah bukti: ciri kokoh harus berselisih desil positif', () => {
    for (const factor of RISK_FACTOR_EVIDENCE) {
      if (!factor.robust) continue;
      expect(factor.decileSpread, `${factor.id} selisih desil`).toBeGreaterThan(0);
      expect(factor.tOos, `${factor.id} t-statistik`).toBeGreaterThan(0);
    }
    expect(RISK_FACTOR_SAMPLE.costStress).toBeGreaterThan(RISK_FACTOR_SAMPLE.roundTripCost);
  });

  it('mencatat patokan apa adanya dan menyatakan keterbatasan', () => {
    expect(RISK_FACTOR_BENCHMARK.total).toBeGreaterThan(0);
    expect(RISK_FACTOR_CAVEATS.length).toBeGreaterThanOrEqual(4);
    expect(RISK_FACTOR_CAVEATS.join(' ')).toContain('desil teratas');
  });
});