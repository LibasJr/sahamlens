import { guard } from '@/lib/sahamLensGuard';
guard();

import type { NextRequest } from 'next/server';
import { handleGetStockAnalysis } from '@/modules/technical/controller/stock-analysis.controller';
import { runController } from '@/shared/http/next-response.adapter';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';

const MAX_BATCH_SYMBOLS = 30;
const BATCH_CONCURRENCY = 4;

export async function GET(request: NextRequest) {
  return runController(async () => {
    const rawSymbols = request.nextUrl.searchParams.get('symbols') ?? '';
    const parts = rawSymbols
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      return {
        status: 400,
        body: { error: 'Parameter symbols wajib diisi', code: 'VALIDATION_ERROR' },
      };
    }

    const uniqueTickers: string[] = [];
    const seen = new Set<string>();
    for (const raw of parts) {
      const normalized = normalizeIdxTickerParam(raw);
      if (!normalized) {
        return {
          status: 400,
          body: { error: `Simbol saham tidak valid: ${raw}`, code: 'INVALID_TICKER' },
        };
      }
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueTickers.push(normalized);
      }
      if (uniqueTickers.length >= MAX_BATCH_SYMBOLS) break;
    }

    const results: Record<string, unknown> = {};
    for (let i = 0; i < uniqueTickers.length; i += BATCH_CONCURRENCY) {
      const chunk = uniqueTickers.slice(i, i + BATCH_CONCURRENCY);
      const settled = await Promise.all(
        chunk.map(async (symbol) => {
          const code = symbol.replace(/\.JK$/i, '');
          const res = await handleGetStockAnalysis(request, code);
          return { symbol, status: res.status, body: res.body };
        }),
      );
      for (const item of settled) {
        if (item.status === 200 && item.body) {
          results[item.symbol] = item.body;
        }
      }
    }

    return {
      status: 200,
      body: {
        data: results,
        requestedCount: uniqueTickers.length,
        resolvedCount: Object.keys(results).length,
      },
    };
  }, request);
}
