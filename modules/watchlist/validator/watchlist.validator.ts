import { z } from 'zod';

export const addWatchlistSchema = z.object({
  symbol: z.string().min(1),
  buy_price: z.number().finite().positive().optional().nullable(),
  alert_price: z.number().finite().positive().optional().nullable(),
  lot: z.number().int().positive().optional().nullable(),
  journal_note: z.string().max(500).optional().nullable(),
});
export type AddWatchlistInput = z.infer<typeof addWatchlistSchema>;

export const journalSchema = z.object({
  symbol: z.string().min(1),
  journal_note: z.string().min(1).max(500),
});
export type JournalInput = z.infer<typeof journalSchema>;

const thresholdAlertTypes = new Set([
  'PRICE_BELOW',
  'PRICE_ABOVE',
  'LENS_SCORE_ABOVE',
  'LENS_CONFIDENCE_BELOW',
  'BREAKOUT_SCORE_ABOVE',
  'BREADTH_ADVANCING_BELOW',
]);

export const alertSchema = z.object({
  symbol: z.string().min(1),
  conditionType: z.enum([
    'PRICE_BELOW',
    'PRICE_ABOVE',
    'CONSENSUS_STRONG_BUY',
    'RSI_OVERSOLD',
    'LENS_SCORE_ABOVE',
    'LENS_CONFIDENCE_BELOW',
    'BREAKOUT_SCORE_ABOVE',
    'BREADTH_ADVANCING_BELOW',
  ]),
  targetValue: z.number().finite().optional().nullable(),
}).superRefine((value, ctx) => {
  if (thresholdAlertTypes.has(value.conditionType) && value.targetValue == null) {
    ctx.addIssue({
      code: 'custom',
      path: ['targetValue'],
      message: 'Target nilai wajib diisi untuk tipe alert ini.',
    });
  }
});
export type AlertInput = z.infer<typeof alertSchema>;
