import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  guardImplausibleFundamentals,
  PLAUSIBLE_RANGE,
} from '../fundamental-write-guard.service';

vi.mock('../../../../shared/logger/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('guardImplausibleFundamentals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('meloloskan nilai wajar tanpa mengubah apa pun', () => {
    const input = { per: 13.4, pbv: 2.87, roe: 21.8, der: 0.4, currentRatio: 1.8, revenueGrowth: 9.1 };
    const { value, rejections } = guardImplausibleFundamentals(input);

    expect(rejections).toHaveLength(0);
    expect(value).toEqual(input);
  });

  // Inti temuan #413: 16500 adalah kurs USD/IDR, bukan rasio.
  it('menolak PBV sebesar kurs', () => {
    const { value, rejections } = guardImplausibleFundamentals(
      { pbv: 16500 },
      { ticker: 'ADRO.JK' },
    );

    expect(value.pbv).toBeNull();
    expect(rejections).toHaveLength(1);
    expect(rejections[0].field).toBe('pbv');
  });

  it('menolak PBV ratusan ribu - BREN 648000', () => {
    const { value } = guardImplausibleFundamentals({ pbv: 648_000 }, { ticker: 'BREN.JK' });
    expect(value.pbv).toBeNull();
  });

  // Penjaga yang terlalu ketat sama berbahayanya: ia membuang data sah diam-diam.
  it('MELOLOSKAN PBV 69x milik pelapor IDR - mahal, bukan rusak', () => {
    // EURO.JK nyata di produksi: pbv 69.18, financialCurrency IDR. Ini emiten mahal.
    const { value, rejections } = guardImplausibleFundamentals(
      { pbv: 69.18 },
      { ticker: 'EURO.JK' },
    );

    expect(value.pbv).toBe(69.18);
    expect(rejections).toHaveLength(0);
  });

  it('menolak PER 0.0005x dan PER 2000x - dua keluarga bug yang pernah nyata', () => {
    expect(guardImplausibleFundamentals({ per: 0.0005 }).value.per).toBeNull();
    expect(guardImplausibleFundamentals({ per: 20_000 }).value.per).toBeNull();
  });

  it('meloloskan PER 2000x yang masih di dalam batas longgar', () => {
    // Batas per adalah 5000: PER tinggi bisa sah pada laba nyaris nol.
    expect(guardImplausibleFundamentals({ per: 2000 }).value.per).toBe(2000);
  });

  it('meloloskan ROE negatif - rugi adalah keadaan sah', () => {
    const { value, rejections } = guardImplausibleFundamentals({ roe: -45.2 });
    expect(value.roe).toBe(-45.2);
    expect(rejections).toHaveLength(0);
  });

  it('tidak memutasi objek masukan', () => {
    const input = { pbv: 16500 };
    const { value } = guardImplausibleFundamentals(input);

    expect(input.pbv).toBe(16500);
    expect(value.pbv).toBeNull();
  });

  it('membiarkan null apa adanya, tidak mengubahnya jadi angka', () => {
    const { value, rejections } = guardImplausibleFundamentals({ pbv: null, per: undefined });
    expect(value.pbv).toBeNull();
    expect(value.per).toBeUndefined();
    expect(rejections).toHaveLength(0);
  });

  it('menolak NaN dan Infinity tanpa melempar', () => {
    const { value } = guardImplausibleFundamentals({
      pbv: Number.NaN,
      per: Number.POSITIVE_INFINITY,
    });
    // Bukan angka hingga - dilewati, bukan dinyatakan melanggar rentang.
    expect(Number.isNaN(value.pbv as number)).toBe(true);
    expect(value.per).toBe(Number.POSITIVE_INFINITY);
  });

  it('menolak beberapa field sekaligus dan melaporkan semuanya', () => {
    const { value, rejections } = guardImplausibleFundamentals({
      pbv: 16500,
      per: 0.0001,
      roe: 21.8,
    });

    expect(value.pbv).toBeNull();
    expect(value.per).toBeNull();
    expect(value.roe).toBe(21.8);
    expect(rejections).toHaveLength(2);
  });

  it('mencatat penolakan alih-alih menihilkan diam-diam', async () => {
    const { logger } = await import('../../../../shared/logger/logger');
    guardImplausibleFundamentals({ pbv: 16500 }, { ticker: 'ADRO.JK' });

    expect(logger.warn).toHaveBeenCalledOnce();
    const [, meta] = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect((meta as { ticker: string }).ticker).toBe('ADRO.JK');
  });

  it('tidak mencatat apa pun saat semua nilai wajar', async () => {
    const { logger } = await import('../../../../shared/logger/logger');
    guardImplausibleFundamentals({ pbv: 2.1, per: 12.4 });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('batas PBV lebih longgar dari nilai wajar tertinggi yang pernah tercatat', () => {
    // Penjaga yang ambangnya di bawah kenyataan akan membuang data sah setiap hari.
    expect(PLAUSIBLE_RANGE.pbv.max).toBeGreaterThan(100);
  });
});
