import { describe, expect, it } from 'vitest';
import { calculateAraCompositeScore, classifyAraCompositeScore, type AraAcsComponents } from '../../index';

const ZERO_PENALTIES = { rejection: 0, failedBreakout: 0, multiDayExtension: 0 };

describe('ACS Agent Speed v0.3', () => {
  it('mencapai 100 saat seluruh komponen positif bernilai 1', () => {
    const result = calculateAraCompositeScore({
      components: { V: 1, C: 1, B: 1, R: 1, T: 1, RS: 1, S: 1, K: 1 },
      penalties: ZERO_PENALTIES,
    });

    expect(result).toMatchObject({
      acs: 100,
      baseAcs: 100,
      totalPenalty: 0,
      band: 'HIGH',
      version: 'v0.3',
      isProbability: false,
    });
  });

  it('menjumlahkan bobot positif lalu mengurangi hanya penalti', () => {
    const result = calculateAraCompositeScore({
      components: { V: 1, C: 0.5, B: 0.5, R: 0, T: 0, RS: 0, S: 0, K: 1 },
      penalties: { rejection: 4, failedBreakout: 3, multiDayExtension: 3 },
    });

    // Base = 15 + 10 + 10 + 15 = 50; total penalty = 10.
    expect(result).toMatchObject({ acs: 40, baseAcs: 50, totalPenalty: 10, band: 'LOW' });
  });

  it('menormalisasi bobot tersedia tanpa mengisi komponen hilang sebagai netral', () => {
    const result = calculateAraCompositeScore({
      components: { V: 1, C: 1, B: 1, R: 1, T: 1, RS: 1, S: 1 } as AraAcsComponents,
      penalties: ZERO_PENALTIES,
    });

    expect(result).toMatchObject({
      acs: 100,
      availableComponentWeight: 0.85,
      missingComponents: ['K'],
    });
  });

  it('menolak kalkulasi bila bobot komponen tersedia di bawah 75%', () => {
    expect(() => calculateAraCompositeScore({
      components: { V: 1, C: 1, B: 1 },
      penalties: ZERO_PENALTIES,
    })).toThrow('Bobot komponen ACS tersedia minimal 0.75');
  });

  it('membatasi ACS di 0 dan memakai band awal yang disepakati', () => {
    const result = calculateAraCompositeScore({
      components: { V: 0, C: 0, B: 0, R: 0, T: 0, RS: 0, S: 0, K: 0 },
      penalties: { rejection: 50, failedBreakout: 50, multiDayExtension: 50 },
    });

    expect(result.acs).toBe(0);
    expect(classifyAraCompositeScore(80)).toBe('HIGH');
    expect(classifyAraCompositeScore(65)).toBe('MODERATE-HIGH');
    expect(classifyAraCompositeScore(50)).toBe('WATCH');
    expect(classifyAraCompositeScore(49.99)).toBe('LOW');
  });
});
