import { describe, expect, it } from 'vitest';

import { ENTRY_RULE_BACKTEST } from '../entry-rule-evidence';

describe('bukti uji aturan Stop Loss / sasaran (24 Sep 2026)', () => {
  it('menyimpan hasil apa adanya: netto negatif setelah biaya, baik train maupun OOS', () => {
    const { train, oos } = ENTRY_RULE_BACKTEST.executable;
    expect(train.net).toBeLessThan(0);
    expect(oos.net).toBeLessThan(0);
    expect(train.medianNet).toBeLessThan(0);
    expect(oos.medianNet).toBeLessThan(0);
  });

  it('netto = bruto - biaya; kalau angka diubah tanpa mengukur ulang, uji ini gagal', () => {
    const { train, oos } = ENTRY_RULE_BACKTEST.executable;
    expect(train.net).toBeCloseTo(train.gross - ENTRY_RULE_BACKTEST.costRoundTrip, 5);
    expect(oos.net).toBeCloseTo(oos.gross - ENTRY_RULE_BACKTEST.costRoundTrip, 5);
  });

  it('aturan dengan netto OOS positif tetap gagal karena train-nya negatif', () => {
    expect(ENTRY_RULE_BACKTEST.bestOosRule.oosNet).toBeGreaterThan(0);
    expect(ENTRY_RULE_BACKTEST.bestOosRule.trainNet).toBeLessThan(0);
    expect(ENTRY_RULE_BACKTEST.anyRulePassedGate).toBe(false);
  });

  it('cacat ukur versi halaman dicatat, bukan dihapus', () => {
    expect(ENTRY_RULE_BACKTEST.rawWindowArtifact.oosNet).toBeGreaterThan(0);
    expect(ENTRY_RULE_BACKTEST.rawWindowArtifact.oosNet).toBeGreaterThan(
      ENTRY_RULE_BACKTEST.executable.oos.net
    );
  });

  it('sampel terisi dan hari tanpa sinyal dijumlahkan apa adanya', () => {
    const { filledSignals, unfilledDays } = ENTRY_RULE_BACKTEST.executable;
    expect(filledSignals).toBe(
      ENTRY_RULE_BACKTEST.executable.train.n + ENTRY_RULE_BACKTEST.executable.oos.n
    );
    expect(unfilledDays).toBeGreaterThan(filledSignals);
  });
});