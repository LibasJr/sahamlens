import { z } from 'zod';

export const configurePaperAccountSchema = z.object({
  initialCash: z.number().finite().positive(),
  riskBudgetPct: z.number().finite().positive().max(5),
  maxPositionPct: z.number().finite().positive().max(25),
  maxOpenPositions: z.number().int().positive().max(30),
});

export const decisionAgentActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('scan') }),
  z.object({ action: z.literal('configure-paper-account'), config: configurePaperAccountSchema }),
  z.object({ action: z.literal('propose-paper-order'), signalId: z.string().uuid() }),
  z.object({ action: z.literal('execute-paper-order'), orderId: z.string().uuid() }),
  z.object({ action: z.literal('reject-paper-order'), orderId: z.string().uuid() }),
  z.object({ action: z.literal('execute-live-order'), orderId: z.string().uuid() }),
]);

export type ConfigurePaperAccountInput = z.infer<typeof configurePaperAccountSchema>;
export type DecisionAgentActionInput = z.infer<typeof decisionAgentActionSchema>;
