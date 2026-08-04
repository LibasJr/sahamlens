import { requireUser } from '../../../shared/middleware/require-auth';
import { parseOrThrow } from '../../../shared/validation/parse-or-throw';
import { getPortfolioSummary, getTransactionHistory } from '../service/portfolio.service';
import { executeBuy, executeSell } from '../service/trade.service';
import { verifyTradePrice } from '../service/price-guard.service';
import { UnrealisticTradePriceError } from '../types/portfolio.errors';
import { tradeSchema, listTransactionsQuerySchema, createTransactionSchema } from '../validator/trade.validator';
import type { HttpResult } from '../../../shared/types/http-result.types';

export async function handleGetPortfolio(): Promise<HttpResult> {
  const session = await requireUser();
  const summary = await getPortfolioSummary(session.id);
  return { status: 200, body: summary };
}

// BUG FIX (audit logika & algoritma 2026-08-05, temuan H-11): `input.price` datang
// LANGSUNG dari client dan tidak pernah dibandingkan dengan harga pasar - `price: 1`
// untuk BBCA dulu diterima apa adanya, membuat P/L & nilai portofolio jadi angka
// rekayasa. Sekarang diverifikasi dulu (lihat price-guard.service.ts; kalau harga pasar
// tidak bisa diambil, transaksi tetap lolos - penjaga ini menutup harga yang jelas
// dikarang, bukan menghukum pengguna saat penyedia data bermasalah).
async function assertRealisticPrice(symbol: string, price: number): Promise<void> {
  const check = await verifyTradePrice(symbol, price);
  if (!check.ok) throw new UnrealisticTradePriceError(check.reason || 'Harga transaksi tidak wajar');
}

export async function handleBuy(rawBody: unknown): Promise<HttpResult> {
  const session = await requireUser();
  const input = parseOrThrow(tradeSchema, rawBody);
  await assertRealisticPrice(input.symbol, input.price);
  const transaction = await executeBuy(session.id, input);
  return { status: 200, body: { success: true, transaction } };
}

export async function handleSell(rawBody: unknown): Promise<HttpResult> {
  const session = await requireUser();
  const input = parseOrThrow(tradeSchema, rawBody);
  await assertRealisticPrice(input.symbol, input.price);
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
  await assertRealisticPrice(input.symbol, input.price);
  const transaction = input.type === 'BUY' ? await executeBuy(session.id, input) : await executeSell(session.id, input);
  return { status: 201, body: { data: transaction } };
}
