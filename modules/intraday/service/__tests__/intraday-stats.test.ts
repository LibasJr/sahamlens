import { describe, it, expect } from 'vitest';
import {
  bucketMonotonicity,
  computePerformance,
  dailyEquityDrawdown,
  concentrationBy,
  correctPValues,
  datasetHash,
  intradayInformationCoefficient,
  purgedWalkForward,
  spearman,
  toEffectiveSample,
  tradingDayBlockBootstrapMean,
  tradingDayBlockSignFlipTest,
  type IntradayObservation,
} from '../intraday-stats';

function obs(
  ticker: string,
  tradingDate: string,
  netReturn: number,
  score = 50,
  signalMinute = 600
): IntradayObservation {
  return { ticker, tradingDate, signalMinute, score, netReturn, grossReturn: netReturn + 0.006, sector: 'X', turnoverIdr: 1e9 };
}

function day(index: number): string {
  const d = new Date(Date.UTC(2026, 0, 5 + Math.floor(index / 5) * 7 + (index % 5)));
  return d.toISOString().slice(0, 10);
}

describe('sampel efektif', () => {
  it('delapan sinyal satu emiten satu hari dihitung sebagai SATU pengamatan efektif', () => {
    const rows = Array.from({ length: 8 }, (_, i) => obs('BBCA.JK', '2026-08-10', 0.01, 50, 540 + i * 30));
    const effective = toEffectiveSample(rows);
    expect(effective.raw).toBe(8);
    expect(effective.effective).toBe(1);
    expect(effective.distinctTickers).toBe(1);
    expect(effective.distinctDays).toBe(1);
  });

  it('klaster memakai RATA-RATA, bukan membuang tujuh baris', () => {
    const rows = [obs('A.JK', '2026-08-10', 0.02), obs('A.JK', '2026-08-10', -0.01)];
    expect(toEffectiveSample(rows).clusterMeans[0]!.netReturn).toBeCloseTo(0.005, 6);
  });

  it('emiten dan hari berbeda tetap dihitung terpisah', () => {
    const rows = [obs('A.JK', '2026-08-10', 0.01), obs('B.JK', '2026-08-10', 0.01), obs('A.JK', '2026-08-11', 0.01)];
    expect(toEffectiveSample(rows).effective).toBe(3);
  });
});

describe('metrik performa', () => {
  const rows = [obs('A.JK', '2026-08-10', 0.02), obs('B.JK', '2026-08-10', -0.01), obs('C.JK', '2026-08-11', 0.01), obs('D.JK', '2026-08-11', -0.02)];
  const perf = computePerformance(rows, toEffectiveSample(rows));

  it('win rate, avg win, avg loss, payoff, profit factor', () => {
    expect(perf.winRate).toBe(0.5);
    expect(perf.avgWin).toBeCloseTo(0.015, 6);
    expect(perf.avgLoss).toBeCloseTo(-0.015, 6);
    expect(perf.payoffRatio).toBeCloseTo(1, 6);
    expect(perf.profitFactor).toBeCloseTo(1, 6);
  });

  it('expectancy dilaporkan dalam basis point', () => {
    expect(perf.avgNetReturn).toBe(0);
    expect(perf.expectancyBps).toBe(0);
  });

  it('max drawdown negatif atau nol, tidak pernah positif', () => {
    expect(perf.maxDrawdown!).toBeLessThanOrEqual(0);
  });

  it('profit factor null (bukan Infinity) saat tidak ada trade rugi', () => {
    const onlyWins = [obs('A.JK', '2026-08-10', 0.01), obs('B.JK', '2026-08-10', 0.02)];
    expect(computePerformance(onlyWins, toEffectiveSample(onlyWins)).profitFactor).toBeNull();
  });
});

describe('drawdown ekuitas harian', () => {
  it('nol untuk deret yang hanya naik', () => {
    const rows = [obs('A.JK', '2026-08-10', 0.01), obs('A.JK', '2026-08-11', 0.02)];
    expect(dailyEquityDrawdown(rows).maxDrawdown).toBe(0);
  });

  it('menghitung puncak-ke-lembah yang dimajemukkan, bukan penjumlahan mentah', () => {
    // +10%, -20%, +5%: ekuitas 1.1 -> 0.88 -> 0.924. Drawdown terdalam 0.88/1.1 - 1 = -20%.
    const rows = [
      obs('A.JK', '2026-08-10', 0.1),
      obs('A.JK', '2026-08-11', -0.2),
      obs('A.JK', '2026-08-12', 0.05),
    ];
    expect(dailyEquityDrawdown(rows).maxDrawdown).toBeCloseTo(-0.2, 6);
    expect(dailyEquityDrawdown(rows).tradingDays).toBe(3);
  });

  it('sinyal pada hari yang sama dirata-rata, bukan dimajemukkan beruntun', () => {
    // Dua sinyal -50% pada hari yang sama = satu hari -50%, BUKAN -75%.
    const rows = [obs('A.JK', '2026-08-10', -0.5), obs('B.JK', '2026-08-10', -0.5)];
    expect(dailyEquityDrawdown(rows).maxDrawdown).toBeCloseTo(-0.5, 6);
  });

  it('tidak pernah melaporkan drawdown lebih buruk dari -100%', () => {
    const rows = [obs('A.JK', '2026-08-10', -1.5), obs('A.JK', '2026-08-11', -0.5)];
    expect(dailyEquityDrawdown(rows).maxDrawdown).toBe(-1);
  });

  it('null saat tidak ada pengamatan sama sekali', () => {
    expect(dailyEquityDrawdown([]).maxDrawdown).toBeNull();
  });

  it('drawdown rentetan aditif dan drawdown ekuitas dilaporkan berdampingan', () => {
    const rows = [obs('A.JK', '2026-08-10', 0.1), obs('A.JK', '2026-08-11', -0.2)];
    const perf = computePerformance(rows, toEffectiveSample(rows));
    expect(perf.maxDrawdown).toBeCloseTo(-0.2, 6);
    expect(perf.maxDrawdownDailyEquity).toBeCloseTo(-0.2, 6);
    expect(perf.equityTradingDays).toBe(2);
  });
});

describe('bootstrap dan permutation berbasis blok hari bursa', () => {
  const positive = Array.from({ length: 20 }, (_, d) =>
    Array.from({ length: 5 }, (_, i) => obs(`T${i}.JK`, day(d), 0.01))
  ).flat();

  it('menolak menghitung CI kalau hari bursa terlalu sedikit', () => {
    const few = [obs('A.JK', '2026-08-10', 0.01), obs('A.JK', '2026-08-11', 0.01)];
    expect(tradingDayBlockBootstrapMean(few).status).toBe('INSUFFICIENT_DATA');
  });

  it('CI menutup nol dan berstatus SUPPORTIVE untuk edge yang konsisten', () => {
    const result = tradingDayBlockBootstrapMean(positive, 500);
    expect(result.status).toBe('SUPPORTIVE');
    expect(result.ci95Low!).toBeGreaterThan(0);
  });

  it('hasil deterministik untuk dataset yang sama', () => {
    const a = tradingDayBlockBootstrapMean(positive, 300);
    const b = tradingDayBlockBootstrapMean(positive, 300);
    expect(a.ci95Low).toBe(b.ci95Low);
    expect(a.ci95High).toBe(b.ci95High);
  });

  it('sign-flip memberi p-value kecil untuk edge kuat dan besar untuk data simetris', () => {
    expect(tradingDayBlockSignFlipTest(positive, 500).pValueOneTailed!).toBeLessThan(0.05);
    const symmetric = Array.from({ length: 20 }, (_, d) =>
      [obs('A.JK', day(d), 0.01), obs('B.JK', day(d), -0.01)]
    ).flat();
    expect(tradingDayBlockSignFlipTest(symmetric, 500).pValueOneTailed!).toBeGreaterThan(0.05);
  });

  it('dataset hash berubah kalau salah satu return berubah', () => {
    const a = datasetHash(positive);
    const mutated = [...positive.slice(1), obs('T0.JK', day(0), 0.0999)];
    expect(datasetHash(mutated)).not.toBe(a);
  });
});

describe('information coefficient dan monotonicity', () => {
  it('Spearman menangkap hubungan monoton walau tidak linear', () => {
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1, 6);
    expect(spearman([1, 2, 3, 4], [16, 9, 4, 1])).toBeCloseTo(-1, 6);
  });

  it('IC per periode hanya menghitung periode dengan sampel cukup', () => {
    const rows = [
      ...Array.from({ length: 25 }, (_, i) => obs(`T${i}.JK`, '2026-08-10', i * 0.001, i)),
      obs('Z.JK', '2026-08-11', 0.01, 90),
    ];
    const ic = intradayInformationCoefficient(rows, (o) => o.tradingDate, 20);
    expect(ic.byPeriod).toHaveLength(1);
    expect(ic.byPeriod[0]!.period).toBe('2026-08-10');
  });

  it('monotonicity positif kalau bucket makin tinggi makin baik', () => {
    const result = bucketMonotonicity([
      { key: '<40', avgNetReturn: -0.01 },
      { key: '40-49', avgNetReturn: -0.005 },
      { key: '50-59', avgNetReturn: 0.001 },
      { key: '60-69', avgNetReturn: 0.004 },
    ]);
    expect(result.rho).toBeCloseTo(1, 6);
    expect(result.monotonic).toBe(true);
  });

  it('bucket tanpa data tidak ikut dihitung tapi juga tidak membuat rho palsu', () => {
    const result = bucketMonotonicity([{ key: '<40', avgNetReturn: null }, { key: '40-49', avgNetReturn: 0.01 }]);
    expect(result.rho).toBeNull();
    expect(result.monotonic).toBe(false);
  });
});

describe('koreksi multiple testing', () => {
  it('Holm lebih konservatif daripada Benjamini-Hochberg', () => {
    const corrected = correctPValues([
      { label: 'a', pValue: 0.01 },
      { label: 'b', pValue: 0.02 },
      { label: 'c', pValue: 0.03 },
      { label: 'd', pValue: 0.04 },
    ]);
    for (const row of corrected) {
      expect(row.holm!).toBeGreaterThanOrEqual(row.benjaminiHochberg!);
    }
  });

  it('p-value 0.04 tunggal tetap signifikan, tetapi tidak lagi setelah 20 uji', () => {
    expect(correctPValues([{ label: 'a', pValue: 0.04 }])[0]!.significantAfterCorrection).toBe(true);
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `t${i}`, pValue: 0.04 }));
    expect(correctPValues(many)[0]!.significantAfterCorrection).toBe(false);
  });

  it('p-value null tetap null dan tidak dianggap signifikan', () => {
    const corrected = correctPValues([{ label: 'a', pValue: null }, { label: 'b', pValue: 0.001 }]);
    expect(corrected[0]!.holm).toBeNull();
    expect(corrected[0]!.significantAfterCorrection).toBe(false);
  });
});

describe('konsentrasi', () => {
  it('menandai hasil yang bergantung pada sedikit emiten', () => {
    const rows = [
      obs('BIG.JK', '2026-08-10', 1),
      ...Array.from({ length: 20 }, (_, i) => obs(`S${i}.JK`, '2026-08-11', 0.001)),
    ];
    const result = concentrationBy(rows, (o) => o.ticker);
    expect(result.concentrated).toBe(true);
    expect(result.topWinners[0]!.key).toBe('BIG.JK');
  });
});

describe('walk-forward dengan purging dan embargo', () => {
  it('menolak berjalan kalau hari bursa terlalu sedikit', () => {
    const rows = Array.from({ length: 5 }, (_, d) => obs('A.JK', day(d), 0.01));
    const result = purgedWalkForward(rows, { folds: 4 });
    expect(result.totalFolds).toBe(0);
    expect(result.note).toContain('Butuh minimal');
  });

  it('fold berurutan waktu dan hari embargo tidak masuk train maupun test', () => {
    const rows = Array.from({ length: 40 }, (_, d) =>
      Array.from({ length: 3 }, (_, i) => obs(`T${i}.JK`, day(d), 0.01))
    ).flat();
    const result = purgedWalkForward(rows, { folds: 4, embargoDays: 1 });
    expect(result.totalFolds).toBeGreaterThan(0);
    for (const fold of result.folds) {
      expect(fold.trainEnd < fold.testStart).toBe(true);
      expect(fold.purgedDays).toBe(1);
    }
    expect(result.majorityPositive).toBe(true);
  });
});
