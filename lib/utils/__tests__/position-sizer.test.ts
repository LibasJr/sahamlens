import { describe, expect, it } from 'vitest';
import { calculatePositionSize } from '../position-sizer';

describe('calculatePositionSize', () => {
  it('menghitung ukuran lot dan batas risiko 1% dengan akurat', () => {
    // Modal Rp 10.000.000, Risk 1% = Max Risk Rp 100.000
    // Entry Rp 5.000, Cut Loss Rp 4.800 -> Risk per share Rp 200 -> Risk per lot Rp 20.000
    // Max Lots = 100.000 / 20.000 = 5 Lot (500 lembar)
    // Total Pembelian = 5 * 100 * 5.000 = Rp 2.500.000 (25% alokasi modal)
    // Jika kena Cut Loss: rugi 5 * 20.000 = Rp 100.000 (tepat 1% modal)
    const res = calculatePositionSize({
      capitalIdr: 10_000_000,
      riskTolerancePct: 1,
      entryPrice: 5000,
      cutLossPrice: 4800,
      takeProfit1Price: 5400, // +400 (+8%) -> R:R = 400 / 200 = 2.0
      takeProfit2Price: 5600, // +600 (+12%) -> R:R = 600 / 200 = 3.0
    });

    expect(res.maxRiskIdr).toBe(100_000);
    expect(res.riskPerShareIdr).toBe(200);
    expect(res.riskPerLotIdr).toBe(20_000);
    expect(res.maxLots).toBe(5);
    expect(res.totalShares).toBe(500);
    expect(res.totalPositionCostIdr).toBe(2_500_000);
    expect(res.portfolioAllocationPct).toBe(25);
    expect(res.actualRiskLossIdr).toBe(100_000);
    expect(res.actualRiskLossPct).toBe(1);
    expect(res.riskRewardRatio1).toBe(2.0);
    expect(res.riskRewardRatio2).toBe(3.0);
    expect(res.reward1Idr).toBe(200_000);
    expect(res.isValid).toBe(true);
    expect(res.warnings).toEqual([]);
  });

  it('memberikan peringatan jika Stop Loss lebih tinggi atau sama dengan Entry', () => {
    const res = calculatePositionSize({
      capitalIdr: 10_000_000,
      riskTolerancePct: 1,
      entryPrice: 5000,
      cutLossPrice: 5100,
    });

    expect(res.isValid).toBe(false);
    expect(res.warnings).toContain('Harga Cut Loss harus lebih rendah dari harga Entry.');
  });
});
