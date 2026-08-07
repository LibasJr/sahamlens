import { describe, expect, it } from 'vitest';
import {
  chronologicalTrainOosSplit,
  evaluateWeightCandidate,
  generateWeightCandidates,
  optimizeLensScoreWeights,
  type WeightOptimizationSample,
} from '../lens-score-optimizer.service';

function sample(
  ticker: string,
  technicalScore: number,
  fundamentalScore: number,
  flowScore: number,
  returnT20: number
): WeightOptimizationSample {
  return {
    ticker,
    signalDate: '2026-01-01',
    technicalScore,
    fundamentalScore,
    flowScore,
    returnT20,
  };
}

describe('lens-score-optimizer.service', () => {
  it('membuat kandidat bobot termasuk bobot production dan contoh 50/20/30', () => {
    const candidates = generateWeightCandidates();

    expect(candidates).toContainEqual({ technical: 40, fundamental: 30, flow: 30 });
    expect(candidates).toContainEqual({ technical: 50, fundamental: 20, flow: 30 });
    expect(candidates.every((w) => w.technical + w.fundamental + w.flow === 100)).toBe(true);
  });

  it('menghitung spread bucket 80-100 vs <60 dari skor komposit bobot kandidat', () => {
    const result = evaluateWeightCandidate([
      sample('A.JK', 40, 30, 30, 12),
      sample('B.JK', 38, 28, 28, 8),
      sample('C.JK', 5, 5, 5, -6),
      sample('D.JK', 4, 4, 4, -4),
    ], { technical: 40, fundamental: 30, flow: 30 });

    expect(result.highSamples).toBe(2);
    expect(result.lowSamples).toBe(2);
    expect(result.spreadT20).toBe(15);
  });

  it('memilih bobot dengan spread T+20 lebih lebar lalu p-value lebih kecil', () => {
    const samples = [
      sample('TECH1.JK', 40, 12, 24, 14),
      sample('TECH2.JK', 38, 12, 24, 12),
      sample('WEAK1.JK', 5, 20, 8, -8),
      sample('WEAK2.JK', 4, 20, 8, -6),
      sample('MIX1.JK', 25, 25, 20, 1),
      sample('MIX2.JK', 24, 24, 20, -1),
    ];

    const optimization = optimizeLensScoreWeights(samples);

    expect(optimization.best).not.toBeNull();
    expect(optimization.best!.spreadT20).not.toBeNull();
    expect(optimization.best!.weights.technical).toBeGreaterThanOrEqual(40);
    expect(optimization.candidates.length).toBeGreaterThan(10);
  });
  it('membagi train/OOS secara kronologis tanpa tanggal yang bocor ke dua sisi', () => {
    const samples: WeightOptimizationSample[] = Array.from({ length: 10 }, (_, i) => ({
      ticker: `T${i}.JK`,
      signalDate: `2026-01-${String(i + 1).padStart(2, '0')}`,
      technicalScore: 20,
      fundamentalScore: 15,
      flowScore: 15,
      returnT20: i - 5,
    }));

    const split = chronologicalTrainOosSplit(samples, 0.7);
    expect(split.splitDate).toBe('2026-01-07');
    expect(split.train).toHaveLength(7);
    expect(split.oos).toHaveLength(3);
    expect(split.train.every((x) => x.signalDate <= split.splitDate!)).toBe(true);
    expect(split.oos.every((x) => x.signalDate > split.splitDate!)).toBe(true);
  });

});
