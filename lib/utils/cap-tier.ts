/** Kondisi pasar SAAT INI, bukan identitas emiten. Market cap dan ADV20 dapat berubah cepat. */
export const CURRENT_LARGE_LIQUID_MIN_MARKET_CAP_IDR = 10_000_000_000_000;
export const CURRENT_LARGE_LIQUID_MIN_ADV20_IDR = 5_000_000_000;
export type CapTier = 'LARGE_LIQUID_CURRENT' | 'SMALL_OR_THIN_CURRENT' | null;
export function classifyCapTier(marketCap: number | null | undefined, adv20Idr: number | null | undefined): CapTier {
  if (typeof marketCap !== 'number' || typeof adv20Idr !== 'number') return null;
  return marketCap >= CURRENT_LARGE_LIQUID_MIN_MARKET_CAP_IDR && adv20Idr >= CURRENT_LARGE_LIQUID_MIN_ADV20_IDR ? 'LARGE_LIQUID_CURRENT' : 'SMALL_OR_THIN_CURRENT';
}
