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
