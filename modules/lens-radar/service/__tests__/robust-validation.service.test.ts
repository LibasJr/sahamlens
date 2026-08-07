import { describe, expect, it } from 'vitest';
import {
  buildRobustValidation,
  bucketMonotonicity,
  dateBlockPermutationSpread,
  monthlySpearmanInformationCoefficient,
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

  it('classifies bootstrap CI evidence status', () => {
    const result = buildRobustValidation(rows);
    expect(['SUPPORTIVE', 'INCONCLUSIVE', 'NEGATIVE', 'INSUFFICIENT_DATA']).toContain(result.bootstrap.status);
  });

  it('computes monthly IC summary and ICIR without mixing months', () => {
    const monthlyRows = Array.from({ length: 80 }, (_, i) => {
      const month = i < 40 ? '01' : '02';
      const j = i % 40;
      return {
        ticker: `M${j}`,
        signalDate: `2026-${month}-${String((j % 20) + 1).padStart(2, '0')}`,
        lensScore: 40 + j,
        bucket: (j >= 30 ? '80-100' : j >= 20 ? '70-79' : j >= 10 ? '60-69' : '<60') as '<60' | '60-69' | '70-79' | '80-100',
        returnT20: month === '01' ? j / 10 : j / 12,
      };
    });
    const result = monthlySpearmanInformationCoefficient(monthlyRows, 20);
    expect(result.months).toBe(2);
    expect(result.positiveMonths).toBe(2);
    expect(result.meanIc).not.toBeNull();
  });


  it('is reproducible even when input row order changes', () => {
    const a = buildRobustValidation(rows);
    const b = buildRobustValidation([...rows].reverse());
    expect(a.audit.datasetHash).toBe(b.audit.datasetHash);
    expect(a.audit.bootstrapSeed).toBe(b.audit.bootstrapSeed);
    expect(a.audit.permutationSeed).toBe(b.audit.permutationSeed);
    expect(a.bootstrap).toEqual(b.bootstrap);
    expect(a.permutation).toEqual(b.permutation);
  });

  it('changes the dataset fingerprint when an observation changes', () => {
    const a = buildRobustValidation(rows);
    const changed = rows.map((row, i) => i === 0 ? { ...row, returnT20: (row.returnT20 ?? 0) + 0.01 } : row);
    const b = buildRobustValidation(changed);
    expect(a.audit.datasetHash).not.toBe(b.audit.datasetHash);
  });

  it('builds the complete validation bundle', () => {
    const result = buildRobustValidation(rows);
    expect(result.effectiveSamples).toBe(40);
    expect(result.bootstrap.iterations).toBeGreaterThan(0);
    expect(result.permutation.iterations).toBeGreaterThan(0);
    expect(result.monthlyInformationCoefficient).toBeDefined();
  });
});
