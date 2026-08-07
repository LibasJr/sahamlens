import { describe, expect, it } from 'vitest';
import {
  buildRobustValidation,
  bucketMonotonicity,
  dateBlockPermutationSpread,
  spearmanInformationCoefficient,
} from '../robust-validation.service';

const rows = Array.from({ length: 40 }, (_, i) => {
  const bucket = i % 4 === 0 ? '<60' : i % 4 === 1 ? '60-69' : i % 4 === 2 ? '70-79' : '80-100';
  const base = bucket === '<60' ? -2 : bucket === '60-69' ? -1 : bucket === '70-79' ? 0.5 : 2;
  return {
    ticker: `T${i % 8}`,
    signalDate: `2026-01-${String((i % 20) + 1).padStart(2, '0')}`,
    lensScore: bucket === '<60' ? 50 : bucket === '60-69' ? 65 : bucket === '70-79' ? 75 : 85,
    bucket: bucket as '<60' | '60-69' | '70-79' | '80-100',
    returnT20: base + ((i % 3) - 1) * 0.1,
  };
});

describe('robust validation', () => {
  it('detects positive rank relationship', () => {
    const result = spearmanInformationCoefficient(rows);
    expect(result.samples).toBe(40);
    expect(result.ic).not.toBeNull();
    expect(result.ic!).toBeGreaterThan(0.5);
  });

  it('reports monotonic bucket means', () => {
    const result = bucketMonotonicity(rows);
    expect(result.positiveSteps).toBe(3);
    expect(result.score).toBe(1);
  });

  it('permutation test is deterministic', () => {
    const a = dateBlockPermutationSpread(rows, 250);
    const b = dateBlockPermutationSpread(rows, 250);
    expect(a).toEqual(b);
  });

  it('builds the complete validation bundle', () => {
    const result = buildRobustValidation(rows);
    expect(result.effectiveSamples).toBe(40);
    expect(result.bootstrap.iterations).toBeGreaterThan(0);
    expect(result.permutation.iterations).toBeGreaterThan(0);
  });
});
