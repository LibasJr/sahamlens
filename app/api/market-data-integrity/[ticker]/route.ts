import { runController } from '@/shared/http/next-response.adapter';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { idxTickerParamSchema } from '@/shared/market/ticker-schema';
import { getLatestMarketIntegrity } from '@/modules/market-data-integrity/repository/market-data-reconciliation.repository';

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  return runController(async () => {
    const { ticker: raw } = await params;
    const ticker = parseOrThrow(idxTickerParamSchema, raw);
    const integrity = await getLatestMarketIntegrity(ticker);
    return {
      status: 200,
      body: { ticker, integrity },
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
    };
  });
}
