import { describe, expect, it } from 'vitest';

import { INTRADAY_LIFECYCLE_DECISION } from '../constants/intraday-lifecycle';
import { INTRADAY_MODEL_STATUSES, LENS_INTRADAY_INITIAL_STATUS } from '../constants/intraday-model';

describe('keputusan siklus LensIntraday (24 Sep 2026)', () => {
  it('tetap RESEARCH_ONLY dan tidak pernah mengklaim tervalidasi produksi', () => {
    expect(INTRADAY_LIFECYCLE_DECISION.decision).toBe('CLOSED_RESEARCH_ONLY');
    expect(INTRADAY_LIFECYCLE_DECISION.status).toBe('RESEARCH_ONLY');
    expect(LENS_INTRADAY_INITIAL_STATUS).toBe('RESEARCH_ONLY');
    expect(INTRADAY_MODEL_STATUSES as readonly string[]).not.toContain('PRODUCTION_VALIDATED');
  });

  it('menyimpan angka bukti apa adanya: bruto di bawah biaya, nol irisan positif', () => {
    const { grossExpectancy, costPerTrade, netExpectancy, positiveSlicesNetWithP05, oosRows } =
      INTRADAY_LIFECYCLE_DECISION.evidence;

    expect(oosRows).toBeGreaterThan(0);
    expect(positiveSlicesNetWithP05).toBe(0);
    expect(grossExpectancy).toBeLessThan(0);
    expect(costPerTrade).toBeGreaterThan(0);
    // netto = bruto - biaya; kalau salah satu angka diubah tanpa mengukur ulang, uji ini gagal.
    expect(netExpectancy).toBeCloseTo(grossExpectancy - costPerTrade, 5);
    expect(netExpectancy).toBeLessThan(grossExpectancy);
  });

  it('irisan bruto terbaik pun masih di bawah biaya per transaksi', () => {
    const { bestGrossSliceValue, costPerTrade } = INTRADAY_LIFECYCLE_DECISION.evidence;
    expect(bestGrossSliceValue).toBeLessThan(costPerTrade);
  });

  it('punya syarat pembukaan kembali yang menuntut freeze baru, bukan menunggu protokol lama', () => {
    const requirements = INTRADAY_LIFECYCLE_DECISION.reopenRequirements.join(' ');
    expect(INTRADAY_LIFECYCLE_DECISION.reopenRequirements.length).toBeGreaterThanOrEqual(4);
    expect(requirements).toMatch(/freeze/);
    expect(requirements).toMatch(/p < 0,05/);
    expect(INTRADAY_LIFECYCLE_DECISION.collectionContinues).toBe(true);
  });
});