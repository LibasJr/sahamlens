import { describe, expect, it } from 'vitest';
import {
  calculatePerformanceMetrics,
  MIN_RETURN_OBSERVATIONS,
  type PerformanceMetricsInput,
} from '../performance-metrics';
import { MACRO_ASSUMPTIONS } from '@/modules/fundamental/service/fair-multiples.service';

function dateAt(index: number, from = Date.UTC(2025, 0, 1)): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + index);
  return d.toISOString().slice(0, 10);
}

/** Kurva ekuitas dengan return harian tetap - dipakai untuk kasus batas volatilitas nol. */
function curve(days: number, dailyReturn: number, start = 1_000_000) {
  const equity: number[] = [start];
  for (let i = 1; i < days; i++) equity.push(equity[i - 1]! * (1 + dailyReturn));
  return { equity, dates: equity.map((_, i) => dateAt(i)) };
}

function input(overrides: Partial<PerformanceMetricsInput> = {}): PerformanceMetricsInput {
  const { equity, dates } = curve(60, 0.001);
  return {
    equityCurveDaily: equity,
    dates,
    initialCapital: 1_000_000,
    trades: [],
    totalBuyValue: 0,
    totalSellValue: 0,
    ...overrides,
  };
}

describe('calculatePerformanceMetrics - profit factor & expectancy', () => {
  it('profit factor memakai RUPIAH, bukan persen', () => {
    // Dua trade dengan persen identik tetapi nilai berbeda 10x. Kalau profit factor
    // dihitung dari persen, keduanya berbobot sama dan hasilnya 1,0. Yang benar 10,0.
    const result = calculatePerformanceMetrics(input({
      trades: [
        { pnlValue: 1_000_000, pnlPct: 10 },
        { pnlValue: -100_000, pnlPct: -10 },
      ],
    }));
    expect(result.profitFactor).toBe(10);
  });

  it('nilai referensi: laba 150 rugi 50 -> PF 3', () => {
    const result = calculatePerformanceMetrics(input({
      trades: [
        { pnlValue: 100, pnlPct: 1 },
        { pnlValue: 50, pnlPct: 0.5 },
        { pnlValue: -50, pnlPct: -0.5 },
      ],
    }));
    expect(result.profitFactor).toBe(3);
    expect(result.expectancyPct).toBeCloseTo(0.333, 3);
  });

  it('tanpa trade rugi, PF null - bukan Infinity yang dirender sebagai angka', () => {
    const result = calculatePerformanceMetrics(input({
      trades: [{ pnlValue: 500, pnlPct: 5 }],
    }));
    expect(result.profitFactor).toBeNull();
  });

  it('PF & expectancy tetap terhitung walau deret ekuitas terlalu pendek untuk Sharpe', () => {
    const result = calculatePerformanceMetrics({
      equityCurveDaily: [1_000_000],
      dates: [dateAt(0)],
      initialCapital: 1_000_000,
      trades: [{ pnlValue: 100, pnlPct: 1 }, { pnlValue: -25, pnlPct: -0.25 }],
      totalBuyValue: 0,
      totalSellValue: 0,
    });
    expect(result.sharpe).toBeNull();
    expect(result.profitFactor).toBe(4);
    expect(result.expectancyPct).toBe(0.375);
    expect(result.note).toContain('terlalu pendek');
  });
});

describe('calculatePerformanceMetrics - CAGR', () => {
  it('ekuitas berlipat dua dalam satu tahun -> CAGR sekitar 100%', () => {
    const dates = [dateAt(0), '2026-01-01'];
    const result = calculatePerformanceMetrics(input({
      equityCurveDaily: [1_000_000, 2_000_000],
      dates,
      initialCapital: 1_000_000,
    }));
    expect(result.cagrPct).toBeCloseTo(100, 0);
    expect(result.years).toBeCloseTo(1, 2);
  });

  it('setengah tahun dengan +21% -> CAGR sekitar 46% (bukan 21%)', () => {
    // Poin sebenarnya: CAGR menyetahunkan. 1,21^2 = 1,4641.
    const result = calculatePerformanceMetrics(input({
      equityCurveDaily: [1_000_000, 1_210_000],
      dates: ['2025-01-01', '2025-07-02'],
      initialCapital: 1_000_000,
    }));
    expect(result.cagrPct).toBeGreaterThan(40);
    expect(result.cagrPct).toBeLessThan(50);
  });

  it('rentang tanggal terbalik atau nol tidak menghasilkan angka', () => {
    const result = calculatePerformanceMetrics(input({
      equityCurveDaily: [1_000_000, 1_100_000],
      dates: ['2025-06-01', '2025-06-01'],
    }));
    expect(result.years).toBeNull();
    expect(result.cagrPct).toBeNull();
    expect(result.note).toContain('Rentang tanggal tidak valid');
  });
});

describe('calculatePerformanceMetrics - Sharpe & Sortino', () => {
  it('return harian konstan -> volatilitas nol, Sharpe tidak terdefinisi', () => {
    const { equity, dates } = curve(60, 0.001);
    const result = calculatePerformanceMetrics(input({ equityCurveDaily: equity, dates }));
    expect(result.annualizedVolatilityPct).toBeNull();
    expect(result.sharpe).toBeNull();
    // CAGR tetap ada: pertumbuhannya nyata, hanya risikonya yang tidak terukur.
    expect(result.cagrPct).not.toBeNull();
  });

  it('deret di bawah minimum -> Sharpe null dan alasannya dinyatakan', () => {
    const days = MIN_RETURN_OBSERVATIONS; // menghasilkan MIN-1 return harian
    const equity = Array.from({ length: days }, (_, i) => 1_000_000 + i * 1000);
    const dates = equity.map((_, i) => dateAt(i));
    const result = calculatePerformanceMetrics(input({ equityCurveDaily: equity, dates }));
    expect(result.returnObservations).toBe(days - 1);
    expect(result.sharpe).toBeNull();
    expect(result.note).toContain(`>= ${MIN_RETURN_OBSERVATIONS}`);
  });

  it('Sharpe NEGATIF saat return rata-rata di bawah risk-free', () => {
    // Naik 0,001% per hari: jauh di bawah SBN 10Y, jadi excess return negatif.
    const equity: number[] = [1_000_000];
    for (let i = 1; i < 300; i++) equity.push(equity[i - 1]! * (1 + (i % 2 === 0 ? 0.0002 : -0.0001)));
    const dates = equity.map((_, i) => dateAt(i));
    const result = calculatePerformanceMetrics(input({ equityCurveDaily: equity, dates }));
    expect(result.sharpe).not.toBeNull();
    expect(result.sharpe!).toBeLessThan(0);
  });

  it('Sortino > Sharpe saat volatilitas didominasi sisi ATAS', () => {
    // Lompatan besar ke atas, penurunan kecil: total volatilitas besar tetapi downside kecil.
    const equity: number[] = [1_000_000];
    for (let i = 1; i < 300; i++) {
      equity.push(equity[i - 1]! * (1 + (i % 10 === 0 ? 0.05 : -0.0015)));
    }
    const dates = equity.map((_, i) => dateAt(i));
    const result = calculatePerformanceMetrics(input({ equityCurveDaily: equity, dates }));
    expect(result.sharpe).not.toBeNull();
    expect(result.sortino).not.toBeNull();
    expect(result.sortino!).toBeGreaterThan(result.sharpe!);
  });

  it('risk-free yang dipakai ikut dilaporkan, bukan tersembunyi di dalam rumus', () => {
    const equity = Array.from({ length: 300 }, (_, i) => 1_000_000 * (1 + i * 0.001));
    const dates = equity.map((_, i) => dateAt(i));
    const result = calculatePerformanceMetrics(input({ equityCurveDaily: equity, dates }));
    expect(result.riskFreeRatePct).toBe(MACRO_ASSUMPTIONS.RISK_FREE_RATE_PCT);
    expect(result.riskFreeSetOn).toBe(MACRO_ASSUMPTIONS.SET_ON);
  });

  it('penyetahunan diturunkan dari data: dua deret dengan return sama tapi rentang beda tidak sama Sharpe-nya', () => {
    const equity = Array.from({ length: 250 }, (_, i) => 1_000_000 * (1 + i * 0.0008) * (1 + (i % 3) * 0.0004));
    const rapat = equity.map((_, i) => dateAt(i));
    // Deret yang sama tetapi tersebar dua kali lebih lama: periode per tahun jadi separuh.
    const renggang = equity.map((_, i) => dateAt(i * 2));
    const a = calculatePerformanceMetrics(input({ equityCurveDaily: equity, dates: rapat }));
    const b = calculatePerformanceMetrics(input({ equityCurveDaily: equity, dates: renggang }));
    expect(a.sharpe).not.toBe(b.sharpe);
  });
});

describe('calculatePerformanceMetrics - turnover', () => {
  it('memutar seluruh portofolio sekali dalam setahun -> 1,0x', () => {
    const result = calculatePerformanceMetrics({
      equityCurveDaily: [1_000_000, 1_000_000],
      dates: ['2025-01-01', '2026-01-01'],
      initialCapital: 1_000_000,
      trades: [],
      totalBuyValue: 1_000_000,
      totalSellValue: 1_000_000,
    });
    expect(result.turnoverAnnualX).toBeCloseTo(1, 2);
  });

  it('rentang setengah tahun dengan nilai transaksi sama -> turnover dua kali lipat', () => {
    const result = calculatePerformanceMetrics({
      equityCurveDaily: [1_000_000, 1_000_000],
      dates: ['2025-01-01', '2025-07-02'],
      initialCapital: 1_000_000,
      trades: [],
      totalBuyValue: 1_000_000,
      totalSellValue: 1_000_000,
    });
    expect(result.turnoverAnnualX).toBeGreaterThan(1.9);
    expect(result.turnoverAnnualX).toBeLessThan(2.1);
  });

  it('tradesPerYear ikut disetahunkan dari rentang tanggal sungguhan', () => {
    const result = calculatePerformanceMetrics({
      equityCurveDaily: [1_000_000, 1_000_000],
      dates: ['2025-01-01', '2026-01-01'],
      initialCapital: 1_000_000,
      trades: Array.from({ length: 24 }, () => ({ pnlValue: 10, pnlPct: 0.1 })),
      totalBuyValue: 0,
      totalSellValue: 0,
    });
    expect(result.tradesPerYear).toBeCloseTo(24, 0);
  });
});

describe('calculatePerformanceMetrics - masukan rusak', () => {
  it('tanggal tidak sejajar dengan kurva ditolak, bukan dipaksa', () => {
    const result = calculatePerformanceMetrics(input({
      equityCurveDaily: [1, 2, 3],
      dates: ['2025-01-01', '2025-01-02'],
    }));
    expect(result.years).toBeNull();
    expect(result.note).toContain('tidak sejajar');
  });

  it('ekuitas nol di tengah dilewati dan pelewatannya dilaporkan', () => {
    const equity = [1_000_000, 0, 500_000, ...Array.from({ length: 40 }, (_, i) => 500_000 + i * 100)];
    const dates = equity.map((_, i) => dateAt(i));
    const result = calculatePerformanceMetrics(input({ equityCurveDaily: equity, dates }));
    expect(result.returnObservations).toBe(equity.length - 2);
    expect(result.note).toContain('dilewati');
  });
});
