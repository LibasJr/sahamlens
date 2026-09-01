import { TICKERS } from '@/lib/tickers';
import { apiOk } from '@/shared/http/api-response';
import { runController } from '@/shared/http/next-response.adapter';

const MAX_RESULTS = 12;

function displaySymbol(symbol: string) {
  return symbol.replace(/\.JK$/i, '');
}

/** Lightweight IDX issuer catalogue used by desktop type-ahead. */
export async function GET(request: Request) {
  return runController(async () => {
    const query = new URL(request.url).searchParams.get('q')?.trim().toLocaleLowerCase('id-ID') ?? '';
    if (!query) return { status: 200, body: apiOk({ items: [] }) };

    const startsWithTicker = TICKERS.filter((item) => displaySymbol(item.symbol).toLocaleLowerCase('id-ID').startsWith(query));
    const nameMatches = TICKERS.filter((item) => !startsWithTicker.includes(item) && item.name.toLocaleLowerCase('id-ID').includes(query));
    const items = [...startsWithTicker, ...nameMatches]
      .filter((item) => /^[A-Z]{4}\.JK$/i.test(item.symbol))
      .slice(0, MAX_RESULTS)
      .map((item) => ({ symbol: displaySymbol(item.symbol), name: item.name }));

    return { status: 200, body: apiOk({ items }) };
  }, request);
}
