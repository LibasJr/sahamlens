import { importBrokerSummaryCsv } from './broker-summary-import.service';
import { getCachedBrokerTickers } from './broker-summary-cache.service';

const DEFAULT_BASE_URL = 'https://api.indexalpha.id';
const BATCH_SIZE = 50;
const SOURCE = 'INDEX_ALPHA_API';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface IndexAlphaBrokerRow {
  code?: unknown;
  buy_freq?: unknown;
  buy_volume?: unknown;
  buy_value?: unknown;
  sell_freq?: unknown;
  sell_volume?: unknown;
  sell_value?: unknown;
  buy_avg?: unknown;
  sell_avg?: unknown;
}

interface IndexAlphaBatchEnvelope {
  success?: boolean;
  data?: Record<string, IndexAlphaBrokerRow[]> | null;
  error?: string | null;
}

export interface IndexAlphaSyncResult {
  tradeDate: string;
  requestedTickers: number;
  apiRequests: number;
  tickersWithData: number;
  emptyTickers: string[];
  parsedRows: number;
  insertedRows: number;
  skippedExistingRows: number;
  skippedCachedTickers: number;
  cappedTickers: number;
  quotaUsed: number;
}

function normalizeTicker(value: string): string {
  const ticker = value.trim().toUpperCase().replace(/\.JK$/i, '');
  if (!/^[A-Z][A-Z0-9-]{0,9}$/.test(ticker)) throw new Error(`Ticker Index Alpha tidak valid: ${value}`);
  return ticker;
}

function nonNegativeNumber(value: unknown, label: string): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`Respons Index Alpha tidak valid: ${label}`);
  return number;
}

function optionalNonNegativeNumber(value: unknown, label: string): number | null {
  if (value == null || value === '') return null;
  return nonNegativeNumber(value, label);
}

function optionalNonNegativeInteger(value: unknown, label: string): number | null {
  const number = optionalNonNegativeNumber(value, label);
  if (number == null) return null;
  if (!Number.isInteger(number)) throw new Error(`Respons Index Alpha tidak valid: ${label} harus integer`);
  return number;
}

function assertDateKey(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`Tanggal broker summary tidak valid: ${value}`);
  }
}

export function indexAlphaBatchToCsv(
  data: Record<string, IndexAlphaBrokerRow[]>,
  tradeDate: string,
): { csvText: string; tickersWithData: string[]; rows: number } {
  assertDateKey(tradeDate);
  const lines = ['trade_date,ticker,broker_code,buy_value,sell_value,buy_volume,sell_volume,buy_frequency,sell_frequency,buy_avg,sell_avg'];
  const tickersWithData = new Set<string>();

  for (const [rawTicker, brokerRows] of Object.entries(data)) {
    const ticker = normalizeTicker(rawTicker);
    if (!Array.isArray(brokerRows)) throw new Error(`Respons Index Alpha ${ticker} bukan array.`);
    for (let index = 0; index < brokerRows.length; index++) {
      const row = brokerRows[index]!;
      const brokerCode = String(row?.code ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9]{1,8}$/.test(brokerCode)) throw new Error(`Kode broker ${ticker}[${index}] tidak valid.`);
      const buyValue = nonNegativeNumber(row.buy_value, `${ticker}.${brokerCode}.buy_value`);
      const sellValue = nonNegativeNumber(row.sell_value, `${ticker}.${brokerCode}.sell_value`);
      const buyVolume = optionalNonNegativeInteger(row.buy_volume, `${ticker}.${brokerCode}.buy_volume`);
      const sellVolume = optionalNonNegativeInteger(row.sell_volume, `${ticker}.${brokerCode}.sell_volume`);
      const buyFrequency = optionalNonNegativeInteger(row.buy_freq, `${ticker}.${brokerCode}.buy_freq`);
      const sellFrequency = optionalNonNegativeInteger(row.sell_freq, `${ticker}.${brokerCode}.sell_freq`);
      const buyAvg = optionalNonNegativeNumber(row.buy_avg, `${ticker}.${brokerCode}.buy_avg`);
      const sellAvg = optionalNonNegativeNumber(row.sell_avg, `${ticker}.${brokerCode}.sell_avg`);
      if (buyValue === 0 && sellValue === 0 && (buyVolume ?? 0) === 0 && (sellVolume ?? 0) === 0 && (buyFrequency ?? 0) === 0 && (sellFrequency ?? 0) === 0) continue;
      lines.push([
        tradeDate, ticker, brokerCode, buyValue, sellValue,
        buyVolume ?? '', sellVolume ?? '', buyFrequency ?? '', sellFrequency ?? '',
        buyAvg ?? '', sellAvg ?? '',
      ].join(','));
      tickersWithData.add(ticker);
    }
  }

  return { csvText: lines.join('\n'), tickersWithData: Array.from(tickersWithData), rows: lines.length - 1 };
}

async function fetchBatch(
  tickers: string[],
  tradeDate: string,
  apiKey: string,
  baseUrl: string,
  fetcher: FetchLike,
): Promise<Record<string, IndexAlphaBrokerRow[]>> {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetcher(`${baseUrl.replace(/\/$/, '')}/stocks/broker-summary/batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickers, from: tradeDate, to: tradeDate, investor: 'all', market: 'RG' }),
    cache: 'no-store',
    });
    if (response.status !== 429 && response.status < 500) break;
    if (attempt < 2) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) ? retryAfter * 1000 : 600 * (attempt + 1)));
    }
  }
  if (!response) throw new Error('Index Alpha tidak merespons.');
  if (!response.ok) throw new Error(`Index Alpha HTTP ${response.status}.`);
  const payload = await response.json() as IndexAlphaBatchEnvelope;
  if (payload.success !== true || !payload.data) throw new Error(payload.error || 'Index Alpha tidak mengembalikan data.');
  return payload.data;
}

export async function syncIndexAlphaBrokerSummary(input: {
  tickers: string[];
  tradeDate: string;
  apiKey?: string;
  baseUrl?: string;
  fetcher?: FetchLike;
  dailyLimit?: number;
  cachedTickerLookup?: typeof getCachedBrokerTickers;
}): Promise<IndexAlphaSyncResult> {
  assertDateKey(input.tradeDate);
  const apiKey = (input.apiKey ?? process.env.INDEXALPHA_API_KEY ?? process.env.BROKER_DATA_API_KEY ?? '').trim();
  if (!apiKey) throw new Error('INDEXALPHA_API_KEY belum dikonfigurasi.');
  const provider = (process.env.BROKER_DATA_PROVIDER || 'indexalpha').trim().toLowerCase();
  if (provider !== 'indexalpha') throw new Error(`BROKER_DATA_PROVIDER belum didukung: ${provider}`);

  const candidates = Array.from(new Set(input.tickers.map(normalizeTicker)));
  const dailyLimit = Math.max(1, input.dailyLimit ?? (Number(process.env.INDEXALPHA_DAILY_TICKER_LIMIT) || 5));
  const cached = await (input.cachedTickerLookup ?? getCachedBrokerTickers)(input.tradeDate, candidates);
  const uncached = candidates.filter((ticker) => !cached.has(ticker));
  const tickers = uncached.slice(0, dailyLimit);
  const baseUrl = input.baseUrl ?? process.env.BROKER_DATA_API_BASE_URL ?? DEFAULT_BASE_URL;
  const fetcher = input.fetcher ?? fetch;
  const found = new Set<string>();
  let apiRequests = 0;
  let parsedRows = 0;
  let insertedRows = 0;
  let skippedExistingRows = 0;

  for (let offset = 0; offset < tickers.length; offset += BATCH_SIZE) {
    const batch = tickers.slice(offset, offset + BATCH_SIZE);
    const data = await fetchBatch(batch, input.tradeDate, apiKey, baseUrl, fetcher);
    apiRequests += 1;
    const normalized = indexAlphaBatchToCsv(data, input.tradeDate);
    normalized.tickersWithData.forEach((ticker) => found.add(ticker));
    if (normalized.rows === 0) continue;
    const result = await importBrokerSummaryCsv({
      csvText: normalized.csvText,
      mode: 'insert',
      source: SOURCE,
      sourceFile: `index-alpha-${input.tradeDate}-batch-${apiRequests}`,
      maxTradeDate: input.tradeDate,
    });
    parsedRows += result.parsedRows;
    insertedRows += result.insertedRows;
    skippedExistingRows += result.skippedExistingRows ?? 0;
  }

  return {
    tradeDate: input.tradeDate,
    requestedTickers: tickers.length,
    apiRequests,
    tickersWithData: found.size,
    emptyTickers: tickers.filter((ticker) => !found.has(ticker)),
    parsedRows,
    insertedRows,
    skippedExistingRows,
    skippedCachedTickers: cached.size,
    cappedTickers: Math.max(0, uncached.length - tickers.length),
    quotaUsed: tickers.length,
  };
}
