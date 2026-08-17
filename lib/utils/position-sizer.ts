export interface PositionSizerInput {
  capitalIdr: number;
  riskTolerancePct: number; // e.g. 1 for 1%, 2 for 2%
  entryPrice: number;
  cutLossPrice: number;
  takeProfit1Price?: number | null;
  takeProfit2Price?: number | null;
}

export interface PositionSizerResult {
  maxRiskIdr: number;
  riskPerShareIdr: number;
  riskPerLotIdr: number;
  maxLots: number;
  totalShares: number;
  totalPositionCostIdr: number;
  portfolioAllocationPct: number;
  actualRiskLossIdr: number;
  actualRiskLossPct: number;
  reward1Idr: number | null;
  reward2Idr: number | null;
  reward1Pct: number | null;
  reward2Pct: number | null;
  riskRewardRatio1: number | null;
  riskRewardRatio2: number | null;
  isValid: boolean;
  warnings: string[];
}

export function calculatePositionSize(input: PositionSizerInput): PositionSizerResult {
  const { capitalIdr, riskTolerancePct, entryPrice, cutLossPrice, takeProfit1Price, takeProfit2Price } = input;

  const warnings: string[] = [];

  if (capitalIdr <= 0 || isNaN(capitalIdr)) {
    warnings.push('Modal trading harus lebih dari Rp 0.');
  }

  if (entryPrice <= 0 || isNaN(entryPrice)) {
    warnings.push('Harga entry harus valid.');
  }

  if (cutLossPrice >= entryPrice) {
    warnings.push('Harga Cut Loss harus lebih rendah dari harga Entry.');
  }

  const maxRiskIdr = capitalIdr > 0 && riskTolerancePct > 0 ? (capitalIdr * riskTolerancePct) / 100 : 0;
  const riskPerShareIdr = Math.max(0, entryPrice - cutLossPrice);
  const riskPerLotIdr = riskPerShareIdr * 100;

  let maxLots = 0;
  if (riskPerLotIdr > 0 && maxRiskIdr > 0) {
    maxLots = Math.floor(maxRiskIdr / riskPerLotIdr);
  }

  const totalShares = maxLots * 100;
  const totalPositionCostIdr = totalShares * entryPrice;
  const portfolioAllocationPct = capitalIdr > 0 ? parseFloat(((totalPositionCostIdr / capitalIdr) * 100).toFixed(1)) : 0;

  // Actual risk when maxLots is purchased
  const actualRiskLossIdr = totalShares * riskPerShareIdr;
  const actualRiskLossPct = capitalIdr > 0 ? parseFloat(((actualRiskLossIdr / capitalIdr) * 100).toFixed(2)) : 0;

  if (totalPositionCostIdr > capitalIdr && maxLots > 0) {
    warnings.push('Ukuran pembelian melebihi total modal kas. Kurangi toleransi risiko atau tambahkan modal.');
  }

  if (maxLots === 0 && capitalIdr > 0 && entryPrice > 0 && cutLossPrice < entryPrice) {
    warnings.push('Jarak Cut Loss terlalu lebar untuk batas risiko 1-2% pada modal saat ini (butuh modal lebih besar untuk membeli minimal 1 lot).');
  }

  let reward1Idr: number | null = null;
  let reward1Pct: number | null = null;
  let riskRewardRatio1: number | null = null;

  if (takeProfit1Price && takeProfit1Price > entryPrice && maxLots > 0) {
    const profitPerShare = takeProfit1Price - entryPrice;
    reward1Idr = totalShares * profitPerShare;
    reward1Pct = parseFloat(((profitPerShare / entryPrice) * 100).toFixed(2));
    if (riskPerShareIdr > 0) {
      riskRewardRatio1 = parseFloat((profitPerShare / riskPerShareIdr).toFixed(2));
    }
  }

  let reward2Idr: number | null = null;
  let reward2Pct: number | null = null;
  let riskRewardRatio2: number | null = null;

  if (takeProfit2Price && takeProfit2Price > entryPrice && maxLots > 0) {
    const profitPerShare = takeProfit2Price - entryPrice;
    reward2Idr = totalShares * profitPerShare;
    reward2Pct = parseFloat(((profitPerShare / entryPrice) * 100).toFixed(2));
    if (riskPerShareIdr > 0) {
      riskRewardRatio2 = parseFloat((profitPerShare / riskPerShareIdr).toFixed(2));
    }
  }

  return {
    maxRiskIdr,
    riskPerShareIdr,
    riskPerLotIdr,
    maxLots,
    totalShares,
    totalPositionCostIdr,
    portfolioAllocationPct,
    actualRiskLossIdr,
    actualRiskLossPct,
    reward1Idr,
    reward2Idr,
    reward1Pct,
    reward2Pct,
    riskRewardRatio1,
    riskRewardRatio2,
    isValid: warnings.length === 0 && maxLots > 0,
    warnings,
  };
}
