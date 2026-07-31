import { z } from 'zod';

export const addWatchlistSchema = z.object({
  symbol: z.string().min(1),
  buy_price: z.number().finite().positive().optional().nullable(),
  alert_price: z.number().finite().positive().optional().nullable(),
  lot: z.number().int().positive().optional().nullable(),
});
export type AddWatchlistInput = z.infer<typeof addWatchlistSchema>;

export const alertSchema = z.object({
  symbol: z.string().min(1),
  conditionType: z.enum([
    'PRICE_BELOW',
    'PRICE_ABOVE',
    'CONSENSUS_STRONG_BUY',
    'RSI_OVERSOLD',
    'BREAKOUT_SCORE_ABOVE',
    'BREADTH_ADVANCING_BELOW',
  ]),
  targetValue: z.number().finite().optional().nullable(),
});
export type AlertInput = z.infer<typeof alertSchema>;
