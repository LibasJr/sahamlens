import { createBoundedLoader } from '@/shared/async/bounded-loader';
import { isProviderCircuitOpen, recordProviderFailure, recordProviderSuccess } from '@/shared/http/provider-circuit-breaker';
import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import {
  CURRENT_LQ45_VERSION,
  isCurrentLq45Ticker,
  normalizeLq45Ticker,
} from '@/modules/market/constants/lq45-universe';

const SOURCE_ID = 'IDX_TRADING_INFO_SS';
const DEFAULT_URL = 'https://www.idx.co.id/primary/ListedCompany/GetTradingInfoSS';

export interface IdxHistoryRow {
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  AdjClose?: number;
  Value?: number;
  Frequency?: number;
  ForeignBuy?: number;
  ForeignSell?: number;
  Bid?: number;
  BidVolume?: number;
  Offer?: number;
  OfferVolume?: number;
  NonRegularVolume?: number;
  NonRegularValue?: number;
  NonRegularFrequency?: number;
}

export interface IdxHistoryFetchResult {
  history: IdxHistoryRow[];
  latestTradeDate: string;
  latestClose: number;
  source: typeof SOURCE_ID;
  universeVersion: string;
}

export interface AppliedIdxHistoryResult {
  history: IdxHistoryRow[];
  applied: boolean;
  source: 'IDX_TRADING_INFO_SS' | 'YAHOO_CHART';
  adjustedCloseSource: 'YAHOO_CHART' | null;
  universeVersion: string | null;
  latestTradeDate: string | null;
  latestClose: number | null;
  idxRows: number;
  yahooRows: number;
  overlapRows: number;
  /** YAHOO_ONLY = IDX tidak mengembalikan apa pun (flag mati, di luar LQ45, circuit
   *  terbuka, atau fetch gagal) sehingga seluruh baris berasal dari Yahoo. */
  latestCloseReconciliation: 'MATCH' | 'MISMATCH' | 'NO_OVERLAP' | 'IDX_ONLY' | 'YAHOO_ONLY';
}

function objectRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  for (const key of ['data', 'Data', 'items', 'Items', 'results', 'Results']) {
    const value = root[key];
    if (Array.isArray(value)) {
      return value.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object');
    }
    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      for (const nestedKey of ['data', 'Data', 'items', 'Items', 'results', 'Results']) {
        const rows = nested[nestedKey];
        if (Array.isArray(rows)) {
          return rows.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object');
        }
      }
    }
  }
  return [];
}

function rawField(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return undefined;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function nonNegative(value: unknown): number | null {
  const n = finiteNumber(value);
  return n != null && n >= 0 ? n : null;
}

function positive(value: unknown): number | null {
  const n = finiteNumber(value);
  return n != null && n > 0 ? n : null;
}

function dateKey(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  const dotnet = text.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  if (dotnet) {
    const d = new Date(Number(dotnet[1]));
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
  }
  const isoPrefix = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];
  const d = new Date(text);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

function rangeDays(range: string): number | null {
  const normalized = range.trim().toLowerCase();
  const table: Record<string, number> = {
    '1mo': 45,
    '3mo': 120,
    '6mo': 240,
    '1y': 400,
    '2y': 800,
    '3y': 1200,
    '5y': 2000,
    '10y': 3800,
    '20y': 7600,
  };
  return table[normalized] ?? null;
}

function requestLength(range: string): number {
  const days = rangeDays(range);
  if (days == null) return 6000;
  return Math.min(8000, Math.max(260, Math.ceil(days * 0.78) + 80));
}

function cutoffForRange(range: string): string | null {
  const days = rangeDays(range);
  if (days == null) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function parseIdxTradingInfo(payload: unknown, range: string): IdxHistoryRow[] {
  const rows = objectRows(payload);
  const parsed: IdxHistoryRow[] = [];
  const cutoff = cutoffForRange(range);

  for (const row of rows) {
    const day = dateKey(rawField(row, ['Date', 'date', 'TradingDate', 'tradingDate', 'TradeDate', 'tradeDate']));
    const open = positive(rawField(row, ['OpenPrice', 'Open', 'open_price', 'open']));
    const high = positive(rawField(row, ['High', 'high']));
    const low = positive(rawField(row, ['Low', 'low']));
    const close = positive(rawField(row, ['Close', 'close', 'ClosePrice', 'closePrice']));
    const volume = nonNegative(rawField(row, ['Volume', 'volume']));

    if (!day || open == null || high == null || low == null || close == null || volume == null) continue;
    if (high < low || close < low || close > high) continue;
    if (cutoff && day < cutoff) continue;

    const value = nonNegative(rawField(row, ['Value', 'value']));
    const frequency = nonNegative(rawField(row, ['Frequency', 'frequency', 'Freq', 'freq']));
    const foreignBuy = nonNegative(rawField(row, ['ForeignBuy', 'foreignBuy', 'foreign_buy']));
    const foreignSell = nonNegative(rawField(row, ['ForeignSell', 'foreignSell', 'foreign_sell']));
    const bid = positive(rawField(row, ['Bid', 'bid']));
    const bidVolume = nonNegative(rawField(row, ['BidVolume', 'bidVolume', 'bid_volume']));
    const offer = positive(rawField(row, ['Offer', 'offer']));
    const offerVolume = nonNegative(rawField(row, ['OfferVolume', 'offerVolume', 'offer_volume']));
    const nonRegularVolume = nonNegative(rawField(row, ['NonRegularVolume', 'nonRegularVolume', 'non_regular_volume']));
    const nonRegularValue = nonNegative(rawField(row, ['NonRegularValue', 'nonRegularValue', 'non_regular_value']));
    const nonRegularFrequency = nonNegative(rawField(row, ['NonRegularFrequency', 'nonRegularFrequency', 'non_regular_frequency']));

    parsed.push({
      Date: `${day}T09:00:00.000Z`,
      Open: open,
      High: high,
      Low: low,
      Close: close,
      Volume: volume,
      ...(value != null ? { Value: value } : {}),
      ...(frequency != null ? { Frequency: frequency } : {}),
      ...(foreignBuy != null ? { ForeignBuy: foreignBuy } : {}),
      ...(foreignSell != null ? { ForeignSell: foreignSell } : {}),
      ...(bid != null ? { Bid: bid } : {}),
      ...(bidVolume != null ? { BidVolume: bidVolume } : {}),
      ...(offer != null ? { Offer: offer } : {}),
      ...(offerVolume != null ? { OfferVolume: offerVolume } : {}),
      ...(nonRegularVolume != null ? { NonRegularVolume: nonRegularVolume } : {}),
      ...(nonRegularValue != null ? { NonRegularValue: nonRegularValue } : {}),
      ...(nonRegularFrequency != null ? { NonRegularFrequency: nonRegularFrequency } : {}),
    });
  }

  const dedup = new Map<string, IdxHistoryRow>();
  for (const row of parsed) dedup.set(row.Date.slice(0, 10), row);
  return [...dedup.values()].sort((a, b) => a.Date.localeCompare(b.Date));
}

async function fetchIdxTradingInfoUncached(input: { ticker: string; range: string }): Promise<IdxHistoryFetchResult | null> {
  if (process.env.IDX_LQ45_EOD_PRIMARY_ENABLED !== 'true') return null;
  const ticker = normalizeLq45Ticker(input.ticker);
  if (!isCurrentLq45Ticker(ticker)) return null;
  if (await isProviderCircuitOpen(SOURCE_ID)) return null;

  const code = ticker.replace(/\.JK$/, '');
  const base = process.env.IDX_TRADING_INFO_URL?.trim() || DEFAULT_URL;
  const url = new URL(base);
  url.searchParams.set('code', code);
  url.searchParams.set('start', '0');
  url.searchParams.set('length', String(requestLength(input.range)));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const startedAt = Date.now();

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json,text/plain,*/*',
        Referer: `https://www.idx.co.id/id/perusahaan-tercatat/profil-perusahaan-tercatat/${code}`,
        'User-Agent': 'Mozilla/5.0 (compatible; SahamLens-IDX-EOD/1.0; +https://sahamlens.id/transparency)',
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      await recordProviderFailure(SOURCE_ID, { immediateOpen: response.status === 403 || response.status === 429 });
      await recordDataSourceHealth({
        sourceId: SOURCE_ID,
        ok: false,
        force: true,
        latencyMs: Date.now() - startedAt,
        detail: { status: response.status, code },
      });
      return null;
    }

    const payload = await response.json();
    const history = parseIdxTradingInfo(payload, input.range);
    if (!history.length) {
      await recordProviderSuccess(SOURCE_ID);
      await recordDataSourceHealth({
        sourceId: SOURCE_ID,
        ok: false,
        force: true,
        latencyMs: Date.now() - startedAt,
        detail: { reason: 'empty_history', code, range: input.range },
      });
      return null;
    }

    await recordProviderSuccess(SOURCE_ID);
    const latest = history[history.length - 1];
    await recordDataSourceHealth({
      sourceId: SOURCE_ID,
      ok: true,
      force: true,
      latencyMs: Date.now() - startedAt,
      dataObservedAt: `${latest.Date.slice(0, 10)}T16:00:00+07:00`,
      detail: { code, range: input.range, rows: history.length, universeVersion: CURRENT_LQ45_VERSION },
    });

    return {
      history,
      latestTradeDate: latest.Date.slice(0, 10),
      latestClose: latest.Close,
      source: SOURCE_ID,
      universeVersion: CURRENT_LQ45_VERSION,
    };
  } catch (error) {
    await recordProviderFailure(SOURCE_ID);
    await recordDataSourceHealth({
      sourceId: SOURCE_ID,
      ok: false,
      force: true,
      latencyMs: Date.now() - startedAt,
      detail: { reason: error instanceof Error ? error.message : String(error), code },
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const loader = createBoundedLoader<{ ticker: string; range: string }, IdxHistoryFetchResult | null>(
  fetchIdxTradingInfoUncached,
  ({ ticker, range }) => `${normalizeLq45Ticker(ticker)}|${range}`,
  {
    concurrency: Math.max(1, Math.min(6, Number(process.env.IDX_LQ45_CONCURRENCY ?? 3) || 3)),
    ttlMs: Math.max(60_000, Number(process.env.IDX_LQ45_CACHE_TTL_MS ?? 600_000) || 600_000),
    timeoutMs: 20_000,
    maxEntries: 256,
    shouldCache: (value) => value !== null,
  },
);

export async function fetchIdxLq45History(ticker: string, range = '1y'): Promise<IdxHistoryFetchResult | null> {
  return loader.get({ ticker, range });
}

export async function applyIdxLq45EodPrimary(
  ticker: string,
  range: string,
  yahooHistory: IdxHistoryRow[],
): Promise<AppliedIdxHistoryResult> {
  const idx = await fetchIdxLq45History(ticker, range);
  if (!idx) {
    return {
      history: yahooHistory,
      applied: false,
      source: 'YAHOO_CHART',
      adjustedCloseSource: yahooHistory.some((row) => typeof row.AdjClose === 'number') ? 'YAHOO_CHART' : null,
      universeVersion: null,
      latestTradeDate: yahooHistory.at(-1)?.Date.slice(0, 10) ?? null,
      latestClose: yahooHistory.at(-1)?.Close ?? null,
      idxRows: 0,
      yahooRows: yahooHistory.length,
      overlapRows: 0,
      latestCloseReconciliation: 'YAHOO_ONLY',
    };
  }

  const yahooByDate = new Map(yahooHistory.map((row) => [row.Date.slice(0, 10), row]));
  let overlapRows = 0;
  const merged = idx.history.map((row) => {
    const yahoo = yahooByDate.get(row.Date.slice(0, 10));
    if (yahoo) overlapRows += 1;
    return {
      ...row,
      ...(typeof yahoo?.AdjClose === 'number' && Number.isFinite(yahoo.AdjClose) && yahoo.AdjClose > 0
        ? { AdjClose: yahoo.AdjClose }
        : {}),
    };
  });

  const idxLatestDate = idx.latestTradeDate;
  const yahooSameDate = yahooByDate.get(idxLatestDate);
  let latestCloseReconciliation: AppliedIdxHistoryResult['latestCloseReconciliation'] = 'NO_OVERLAP';
  if (yahooSameDate) {
    latestCloseReconciliation = yahooSameDate.Close === idx.latestClose ? 'MATCH' : 'MISMATCH';
    await recordDataSourceHealth({
      sourceId: 'LQ45_EOD_RECONCILIATION',
      ok: latestCloseReconciliation === 'MATCH',
      force: true,
      dataObservedAt: `${idxLatestDate}T16:00:00+07:00`,
      detail: {
        ticker: normalizeLq45Ticker(ticker),
        tradeDate: idxLatestDate,
        idxClose: idx.latestClose,
        yahooClose: yahooSameDate.Close,
        status: latestCloseReconciliation,
      },
    });
  }

  return {
    history: merged,
    applied: true,
    source: SOURCE_ID,
    adjustedCloseSource: merged.some((row) => typeof row.AdjClose === 'number') ? 'YAHOO_CHART' : null,
    universeVersion: idx.universeVersion,
    latestTradeDate: idx.latestTradeDate,
    latestClose: idx.latestClose,
    idxRows: idx.history.length,
    yahooRows: yahooHistory.length,
    overlapRows,
    latestCloseReconciliation,
  };
}

export function idxLq45HistoryLoaderStats() {
  return loader.stats();
}
