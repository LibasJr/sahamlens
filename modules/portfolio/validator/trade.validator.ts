import { z } from 'zod';

export const tradeSchema = z.object({
  symbol: z.string().min(1),
  price: z.number().finite().positive(),
  lots: z.number().int().positive(),
  note: z.string().optional(),
});
export type TradeInput = z.infer<typeof tradeSchema>;

// Dipakai POST /api/v1/portfolio/transactions (RESTful - satu resource "transactions",
// tipe BUY/SELL di body) - API Guideline poin 13: gantikan /portfolio/buy & /portfolio/sell
// yang kata kerja di URL. Endpoint lama tetap ada terpisah untuk kompatibilitas mundur.
export const createTransactionSchema = tradeSchema.extend({
  type: z.enum(['BUY', 'SELL']),
});
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const listTransactionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
