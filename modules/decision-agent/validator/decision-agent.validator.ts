import { z } from 'zod';

export const configurePaperAccountSchema = z.object({
  initialCash: z.number().finite().positive(),
  riskBudgetPct: z.number().finite().positive().max(5),
  maxPositionPct: z.number().finite().positive().max(25),
  maxOpenPositions: z.number().int().positive().max(30),
  maxTotalExposurePct: z.number().finite().positive().max(100),
  maxSectorExposurePct: z.number().finite().positive().max(100),
  maxPositionsPerSector: z.number().int().positive().max(30),
  maxAdvParticipationPct: z.number().finite().positive().max(25),
  maxDrawdownPct: z.number().finite().positive().max(100),
  buyFeePct: z.number().finite().nonnegative().max(5),
  sellFeePct: z.number().finite().nonnegative().max(5),
  slippageBps: z.number().finite().nonnegative().max(500),
});

export const decisionThesisInputSchema = z.object({
  thesis: z.string().trim().min(20).max(2_000),
  invalidationCriteria: z.array(z.string().trim().min(5).max(300)).min(1).max(8),
  catalyst: z.string().trim().max(500).nullable(),
  reviewAt: z.string().datetime(),
});

export const decisionAgentActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('scan') }),
  z.object({ action: z.literal('configure-paper-account'), config: configurePaperAccountSchema }),
  z.object({ action: z.literal('freeze-pilot-protocol') }),
  z.object({ action: z.literal('import-idx-ic'), csvText: z.string().min(1).max(5_000_000), sourceUrl: z.string().url().max(1_000), sourceAsOf: z.string().date() }),
  z.object({ action: z.literal('import-stockbit'), csvText: z.string().min(1).max(5_000_000), filename: z.string().trim().min(1).max(255), sourceType: z.enum(['TRANSACTION_HISTORY','E_STATEMENT']) }),
  z.object({ action: z.literal('get-ticker-review'), ticker: z.string().trim().min(1).max(20) }),
  z.object({ action: z.literal('propose-paper-order'), signalId: z.string().uuid(), thesis: decisionThesisInputSchema.optional() }),
  z.object({ action: z.literal('execute-paper-order'), orderId: z.string().uuid() }),
  z.object({ action: z.literal('reject-paper-order'), orderId: z.string().uuid() }),
  z.object({ action: z.literal('execute-live-order'), orderId: z.string().uuid() }),
]);

export type ConfigurePaperAccountInput = z.infer<typeof configurePaperAccountSchema>;
export type DecisionThesisInput = z.infer<typeof decisionThesisInputSchema>;
export type DecisionAgentActionInput = z.infer<typeof decisionAgentActionSchema>;
