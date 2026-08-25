export interface PaperSizingInput {
  nav: number;
  cash: number;
  price: number;
  stop: number;
  existingLots: number;
  riskBudgetPct: number;
  maxPositionPct: number;
}
export interface PaperSizingResult {
  lots: number;
  maxByRisk: number;
  maxByPosition: number;
  maxByCash: number;
  bindingConstraint: 'RISK_BUDGET' | 'POSITION_LIMIT' | 'CASH' | 'NONE';
}

export interface PaperPortfolioCapacityInput {
  nav: number;
  orderPrice: number;
  currentTotalExposureValue: number;
  currentSectorExposureValue: number;
  avgValue20d: number;
  maxTotalExposurePct: number;
  maxSectorExposurePct: number;
  maxAdvParticipationPct: number;
}

export interface PaperPortfolioCapacityResult {
  maxByTotalExposure: number;
  maxBySectorExposure: number;
  maxByLiquidity: number;
  lots: number;
  bindingConstraint: 'TOTAL_EXPOSURE' | 'SECTOR_EXPOSURE' | 'LIQUIDITY' | 'NONE';
}

const LOT_SIZE = 100;

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function calculatePaperBuyLots(input: PaperSizingInput): PaperSizingResult {
  if (
    !validPositive(input.nav) || input.cash < 0 || !validPositive(input.price) ||
    !validPositive(input.stop) || input.stop >= input.price || input.existingLots < 0 ||
    !validPositive(input.riskBudgetPct) || !validPositive(input.maxPositionPct)
  ) return { lots: 0, maxByRisk: 0, maxByPosition: 0, maxByCash: 0, bindingConstraint: 'NONE' };

  const riskBudget = input.nav * (input.riskBudgetPct / 100);
  const riskPerLot = (input.price - input.stop) * LOT_SIZE;
  const maxPositionValue = input.nav * (input.maxPositionPct / 100);
  const existingValue = input.existingLots * LOT_SIZE * input.price;
  const remainingPositionValue = Math.max(0, maxPositionValue - existingValue);

  const maxByRisk = Math.max(0, Math.floor(riskBudget / riskPerLot));
  const maxByPosition = Math.max(0, Math.floor(remainingPositionValue / (input.price * LOT_SIZE)));
  const maxByCash = Math.max(0, Math.floor(input.cash / (input.price * LOT_SIZE)));
  const lots = Math.min(maxByRisk, maxByPosition, maxByCash);
  const bindingConstraint = lots <= 0
    ? 'NONE'
    : lots === maxByRisk
      ? 'RISK_BUDGET'
      : lots === maxByPosition
        ? 'POSITION_LIMIT'
        : 'CASH';
  return { lots, maxByRisk, maxByPosition, maxByCash, bindingConstraint };
}

export function calculatePaperPortfolioCapacity(input: PaperPortfolioCapacityInput): PaperPortfolioCapacityResult {
  if (
    !validPositive(input.nav) || !validPositive(input.orderPrice) ||
    input.currentTotalExposureValue < 0 || input.currentSectorExposureValue < 0 ||
    !validPositive(input.avgValue20d) || !validPositive(input.maxTotalExposurePct) ||
    !validPositive(input.maxSectorExposurePct) || !validPositive(input.maxAdvParticipationPct)
  ) return { maxByTotalExposure: 0, maxBySectorExposure: 0, maxByLiquidity: 0, lots: 0, bindingConstraint: 'NONE' };

  const perLotValue = input.orderPrice * LOT_SIZE;
  const remainingTotal = Math.max(0, input.nav * input.maxTotalExposurePct / 100 - input.currentTotalExposureValue);
  const remainingSector = Math.max(0, input.nav * input.maxSectorExposurePct / 100 - input.currentSectorExposureValue);
  const liquidityCapacity = input.avgValue20d * input.maxAdvParticipationPct / 100;
  const maxByTotalExposure = Math.floor(remainingTotal / perLotValue);
  const maxBySectorExposure = Math.floor(remainingSector / perLotValue);
  const maxByLiquidity = Math.floor(liquidityCapacity / perLotValue);
  const lots = Math.max(0, Math.min(maxByTotalExposure, maxBySectorExposure, maxByLiquidity));
  const bindingConstraint = lots <= 0
    ? 'NONE'
    : lots === maxByTotalExposure
      ? 'TOTAL_EXPOSURE'
      : lots === maxBySectorExposure
        ? 'SECTOR_EXPOSURE'
        : 'LIQUIDITY';
  return { maxByTotalExposure, maxBySectorExposure, maxByLiquidity, lots, bindingConstraint };
}
