import { requireUser } from '../../../shared/middleware/require-auth';
import { parseOrThrow } from '../../../shared/validation/parse-or-throw';
import { getPortfolioSummary, getTransactionHistory } from '../service/portfolio.service';
import { executeBuy, executeSell } from '../service/trade.service';
import { tradeSchema, listTransactionsQuerySchema, createTransactionSchema } from '../validator/trade.validator';
import type { HttpResult } from '../../../shared/types/http-result.types';

export async function handleGetPortfolio(): Promise<HttpResult> {
  const session = await requireUser();
  const summary = await getPortfolioSummary(session.id);
  return { status: 200, body: summary };
}

export async function handleBuy(rawBody: unknown): Promise<HttpResult> {
  const session = await requireUser();
  const input = parseOrThrow(tradeSchema, rawBody);
  const transaction = await executeBuy(session.id, input);
  return { status: 200, body: { success: true, transaction } };
}

export async function handleSell(rawBody: unknown): Promise<HttpResult> {
  const session = await requireUser();
  const input = parseOrThrow(tradeSchema, rawBody);
  const transaction = await executeSell(session.id, input);
  return { status: 200, body: { success: true, transaction } };
}

export async function handleListTransactions(rawQuery: unknown): Promise<HttpResult> {
  const session = await requireUser();
  const query = parseOrThrow(listTransactionsQuerySchema, rawQuery);
  const result = await getTransactionHistory(session.id, query);
  return {
    status: 200,
    body: { data: result.items, pagination: { nextCursor: result.nextCursor, hasMore: result.hasMore } },
  };
}

// RESTful: POST /api/v1/portfolio/transactions dengan { type: 'BUY'|'SELL', ... } -
// satu resource, bukan dua endpoint bernama kata kerja (/buy, /sell). Dipakai
// khusus adapter /v1/, endpoint lama /portfolio/buy & /sell tetap dipertahankan
// terpisah (handleBuy/handleSell di atas) untuk kompatibilitas mundur.
export async function handleCreateTransaction(rawBody: unknown): Promise<HttpResult> {
  const session = await requireUser();
  const input = parseOrThrow(createTransactionSchema, rawBody);
  const transaction = input.type === 'BUY' ? await executeBuy(session.id, input) : await executeSell(session.id, input);
  return { status: 201, body: { data: transaction } };
}
