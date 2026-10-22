import { ProviderUnavailableError } from '@/shared/errors/app-error';

export const TRADINGVIEW_SCANNER_URL = 'https://scanner.tradingview.com/indonesia/scan';
export const DEFAULT_SCANNER_TIMEOUT_MS = 10_000;
export const DEFAULT_MIN_TURNOVER_IDR = 1_000_000_000; // Rp 1 Miliar

export const TRADINGVIEW_COLUMNS = [
  'name',
  'close',
  'change',
  'volume',
  'Value.Traded',
  'RSI',
  'sector',
  'industry',
  'market_cap_basic',
  'price_earnings_ttm',
  'price_book_fq',
  'EMA20',
  'SMA50',
  'SMA200',
  'Perf.W',
  'Perf.1M',
  'Perf.3M',
  'Perf.6M',
  'Perf.Y',
  'price_52_week_high',
  'price_52_week_low',
  'relative_volume_10d_calc',
  'average_volume_30d_calc',
  'Volatility.D',
  'ATR',
  'EMA10',
  'SMA20',
  'gap',
  'change_from_open',
] as const;

export type TradingViewColumnName = (typeof TRADINGVIEW_COLUMNS)[number];

export const IHSG_BENCHMARK_COLUMNS = [
  'name',
  'close',
  'change',
  'SMA50',
  'SMA200',
  'EMA20',
  'Perf.W',
  'Perf.1M',
  'Perf.3M',
  'Perf.6M',
  'Perf.Y',
  'price_52_week_high',
  'price_52_week_low',
] as const;

export interface IhsgBenchmark {
  ticker: 'COMPOSITE';
  symbol: 'IDX:COMPOSITE';
  name: string;
  close: number | null;
  change: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  perfWeek: number | null;
  perfMonth: number | null;
  perf3M: number | null;
  perf6M: number | null;
  perfYear: number | null;
  price52wHigh: number | null;
  price52wLow: number | null;
  dist52wHighPct: number | null;
  trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
}

export interface TradingViewScannerFilterItem {
  left: string;
  operation: string;
  right: string | boolean | string[];
}

export interface TradingViewScannerPayload {
  filter: TradingViewScannerFilterItem[];
  options: { lang: string };
  symbols: { query: { types: string[] }; tickers: string[] };
  columns: readonly string[];
  sort: { sortBy: string; sortOrder: 'asc' | 'desc' };
  range: [number, number];
}

export interface TradingViewStockItem {
  ticker: string;
  symbol: string;
  name: string;
  close: number | null;
  change: number | null;
  volume: number | null;
  turnover: number | null;
  rsi: number | null;
  sector: string;
  industry: string;
  marketCap: number | null;
  pe: number | null;
  pbv: number | null;
  ema20: number | null;
  sma50: number | null;
  sma200: number | null;
  perfWeek: number | null;
  perfMonth: number | null;
  perf3M: number | null;
  perf6M: number | null;
  perfYear: number | null;
  compositePerf: number;
  rsScore: number | null;
  isLiquid: boolean;
  aboveSma200: boolean | null;
  price52wHigh: number | null;
  price52wLow: number | null;
  rvol: number | null;
  avgVolume30d: number | null;
  volatilityD: number | null;
  atr: number | null;
  ema10: number | null;
  sma20: number | null;
  gap: number | null;
  changeFromOpen: number | null;
  dist52wHighPct: number | null;
  isStage2: boolean;
  near52wHigh: boolean;
  isPocketPivot: boolean;
  rsLine: number | null;
  alphaVsIhsg1M: number | null;
  alphaVsIhsg3M: number | null;
  alphaVsIhsgYear: number | null;
  isLeadingVsIhsg: boolean;
  isBlueSkyRs: boolean;
}

export interface MarketBreadthSummary {
  advances: number;
  declines: number;
  unchanged: number;
  totalTurnover: number;
  totalTurnoverTrillion: number;
  advanceDeclineRatio: number;
  sentiment: 'BULLISH_DOMINANT' | 'BEARISH_DOMINANT' | 'NEUTRAL_CHOPPY';
}

export interface SectorSummaryItem {
  sector: string;
  turnover: number;
  turnoverTrillion: number;
  sharePct: number;
  up: number;
  down: number;
  unchanged: number;
  totalStocks: number;
  avgChangePct: number;
}

export interface IdxMarketScanResult {
  timestamp: string;
  totalCount: number;
  liquidCount: number;
  marketBreadth: MarketBreadthSummary;
  sectors: SectorSummaryItem[];
  ihsg: IhsgBenchmark | null;
  stocks: TradingViewStockItem[];
  topRs: TradingViewStockItem[];
  topTurnover: TradingViewStockItem[];
  stage2Stocks: TradingViewStockItem[];
  near52wStocks: TradingViewStockItem[];
  pocketPivotStocks: TradingViewStockItem[];
  leadingStocks: TradingViewStockItem[];
  blueSkyRsStocks: TradingViewStockItem[];
}

export interface TradingViewScannerOptions {
  timeoutMs?: number;
  range?: [number, number];
  minTurnoverIdr?: number;
  fetchFn?: typeof fetch;
  endpointUrl?: string;
  customColumns?: readonly string[];
}

function parseNumber(val: unknown): number | null {
  if (typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val)) {
    return val;
  }
  return null;
}

function parseString(val: unknown, fallback: string): string {
  if (typeof val === 'string' && val.trim().length > 0) {
    return val.trim();
  }
  return fallback;
}

export function buildTradingViewPayload(options?: {
  range?: [number, number];
  columns?: readonly string[];
}): TradingViewScannerPayload {
  return {
    filter: [
      { left: 'type', operation: 'equal', right: 'stock' },
      { left: 'subtype', operation: 'in_range', right: ['common', 'foreign-issuer'] },
      { left: 'is_primary', operation: 'equal', right: true },
    ],
    options: { lang: 'id' },
    symbols: { query: { types: [] }, tickers: [] },
    columns: options?.columns ?? TRADINGVIEW_COLUMNS,
    sort: { sortBy: 'Value.Traded', sortOrder: 'desc' },
    range: options?.range ?? [0, 850],
  };
}

export function calculateCompositePerformance(perf: {
  change?: number | null;
  perfWeek?: number | null;
  perfMonth?: number | null;
  perf3M?: number | null;
  perf6M?: number | null;
  perfYear?: number | null;
}): number {
  const change = perf.change ?? 0;
  const p1m = perf.perfMonth ?? change;
  const p3m = perf.perf3M ?? p1m;
  const p6m = perf.perf6M ?? p3m;
  const p1y = perf.perfYear ?? p6m;

  // Minervini / IBD Relative Strength weighting:
  // 40% 3M (latest quarter), 20% 6M, 20% 12M, 20% 1M (near-term momentum)
  const composite = 0.4 * p3m + 0.2 * p6m + 0.2 * p1y + 0.2 * p1m;
  return Math.round(composite * 1000) / 1000;
}

export function calculateDist52wHighPct(
  price52wHigh: number | null,
  close: number | null
): number | null {
  if (price52wHigh === null || close === null || price52wHigh <= 0) {
    return null;
  }
  const pct = ((price52wHigh - close) / price52wHigh) * 100;
  return Math.round(pct * 100) / 100;
}

export function checkIsStage2(
  close: number | null,
  sma50: number | null,
  sma200: number | null,
  ema20?: number | null
): boolean {
  if (close === null || sma50 === null || sma200 === null) {
    return false;
  }
  const ema20Pass = ema20 !== null && ema20 !== undefined && ema20 > 0 ? close > ema20 : true;
  return close > sma50 && sma50 > sma200 && ema20Pass;
}

export function checkNear52wHigh(
  isStage2: boolean,
  dist52wHighPct: number | null
): boolean {
  if (!isStage2 || dist52wHighPct === null) {
    return false;
  }
  return dist52wHighPct <= 15.0;
}

export function checkIsPocketPivot(params: {
  close: number | null;
  ema10?: number | null;
  ema20?: number | null;
  rvol: number | null;
  change: number | null;
  dist52wHighPct: number | null;
}): boolean {
  const { close, ema10, ema20, rvol, change, dist52wHighPct } = params;
  if (close === null || rvol === null || change === null || dist52wHighPct === null) {
    return false;
  }
  const pivotRef = ema10 ?? ema20 ?? 0;
  const ema20Ref = ema20 ?? 0;
  const emaCondition = close >= pivotRef || close >= ema20Ref;
  return emaCondition && rvol >= 1.5 && change > 0 && dist52wHighPct <= 25.0;
}

export function calculateRsLine(
  stockClose: number | null,
  ihsgClose: number | null
): number | null {
  if (stockClose === null || ihsgClose === null || ihsgClose <= 0 || stockClose < 0) {
    return null;
  }
  return Math.round((stockClose / ihsgClose) * 1000 * 10000) / 10000;
}

export function checkIsLeadingVsIhsg(
  stock: {
    isLiquid: boolean;
    alphaVsIhsg1M: number | null;
    alphaVsIhsg3M: number | null;
    isStage2?: boolean;
    change?: number | null;
  },
  ihsg?: {
    change?: number | null;
    trend?: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
    perfMonth?: number | null;
  } | null
): boolean {
  if (!stock.isLiquid || stock.alphaVsIhsg1M === null || stock.alphaVsIhsg3M === null) {
    return false;
  }
  const positiveAlpha = stock.alphaVsIhsg1M > 0 && stock.alphaVsIhsg3M > 0;
  if (!positiveAlpha) return false;

  if (ihsg && (ihsg.trend === 'DOWNTREND' || (ihsg.perfMonth != null && ihsg.perfMonth < 0))) {
    return stock.isStage2 === true || (stock.change != null && stock.change >= 0);
  }
  return true;
}

export function checkIsBlueSkyRs(
  stock: {
    isStage2: boolean;
    near52wHigh: boolean;
    rsScore: number | null;
  },
  ihsg?: {
    dist52wHighPct?: number | null;
    trend?: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  } | null
): boolean {
  if (!stock.isStage2 || !stock.near52wHigh || stock.rsScore === null || stock.rsScore < 80) {
    return false;
  }
  if (ihsg) {
    const ihsgLagging =
      (ihsg.dist52wHighPct != null && ihsg.dist52wHighPct > 10) || ihsg.trend !== 'UPTREND';
    return ihsgLagging;
  }
  return true;
}

export function parseIhsgBenchmarkResponse(json: unknown): IhsgBenchmark | null {
  if (!json || typeof json !== 'object') return null;
  const rawList = (json as { data?: Array<{ s?: unknown; d?: unknown[] }> }).data;
  if (!Array.isArray(rawList) || rawList.length === 0) return null;
  const row = rawList[0];
  const d = Array.isArray(row.d) ? row.d : [];
  const name = typeof d[0] === 'string' ? d[0] : 'IDX Composite Index';
  const close = parseNumber(d[1]);
  const change = parseNumber(d[2]);
  const sma50 = parseNumber(d[3]);
  const sma200 = parseNumber(d[4]);
  const ema20 = parseNumber(d[5]);
  const perfWeek = parseNumber(d[6]);
  const perfMonth = parseNumber(d[7]);
  const perf3M = parseNumber(d[8]);
  const perf6M = parseNumber(d[9]);
  const perfYear = parseNumber(d[10]);
  const price52wHigh = parseNumber(d[11]);
  const price52wLow = parseNumber(d[12]);
  const dist52wHighPct = calculateDist52wHighPct(price52wHigh, close);

  let trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS' = 'SIDEWAYS';
  if (close !== null && sma50 !== null) {
    if (close > sma50 && (sma200 === null || sma50 > sma200)) {
      trend = 'UPTREND';
    } else if (close < sma50 && (sma200 === null || sma50 < sma200)) {
      trend = 'DOWNTREND';
    }
  }

  return {
    ticker: 'COMPOSITE',
    symbol: 'IDX:COMPOSITE',
    name,
    close,
    change,
    sma50,
    sma200,
    ema20,
    perfWeek,
    perfMonth,
    perf3M,
    perf6M,
    perfYear,
    price52wHigh,
    price52wLow,
    dist52wHighPct,
    trend,
  };
}

export function parseTradingViewScanResponse(
  json: unknown,
  columns: readonly string[] = TRADINGVIEW_COLUMNS
): Omit<TradingViewStockItem, 'rsScore' | 'isLiquid'>[] {
  if (!json || typeof json !== 'object' || !Array.isArray((json as { data?: unknown[] }).data)) {
    throw new ProviderUnavailableError('Payload scan TradingView tidak valid: data bukan array');
  }

  const colIndex = new Map<string, number>();
  columns.forEach((col, idx) => colIndex.set(col, idx));

  const idxName = colIndex.get('name') ?? 0;
  const idxClose = colIndex.get('close') ?? 1;
  const idxChange = colIndex.get('change') ?? 2;
  const idxVolume = colIndex.get('volume') ?? 3;
  const idxTurnover = colIndex.get('Value.Traded') ?? 4;
  const idxRsi = colIndex.get('RSI') ?? 5;
  const idxSector = colIndex.get('sector') ?? 6;
  const idxIndustry = colIndex.get('industry') ?? 7;
  const idxMcap = colIndex.get('market_cap_basic') ?? 8;
  const idxPe = colIndex.get('price_earnings_ttm') ?? 9;
  const idxPbv = colIndex.get('price_book_fq') ?? 10;
  const idxEma20 = colIndex.get('EMA20') ?? 11;
  const idxSma50 = colIndex.get('SMA50') ?? 12;
  const idxSma200 = colIndex.get('SMA200') ?? 13;
  const idxPerfW = colIndex.get('Perf.W') ?? 14;
  const idxPerf1M = colIndex.get('Perf.1M') ?? 15;
  const idxPerf3M = colIndex.get('Perf.3M') ?? 16;
  const idxPerf6M = colIndex.get('Perf.6M') ?? 17;
  const idxPerfY = colIndex.get('Perf.Y') ?? 18;
  const idx52wHigh = colIndex.get('price_52_week_high');
  const idx52wLow = colIndex.get('price_52_week_low');
  const idxRvol = colIndex.get('relative_volume_10d_calc');
  const idxAvgVol30d = colIndex.get('average_volume_30d_calc');
  const idxVolatilityD = colIndex.get('Volatility.D');
  const idxAtr = colIndex.get('ATR');
  const idxEma10 = colIndex.get('EMA10');
  const idxSma20 = colIndex.get('SMA20');
  const idxGap = colIndex.get('gap');
  const idxChangeFromOpen = colIndex.get('change_from_open');

  const rawList = (json as { data: Array<{ s?: unknown; d?: unknown[] }> }).data;

  return rawList.map((item) => {
    const symbol = typeof item?.s === 'string' ? item.s : '';
    const d = Array.isArray(item?.d) ? item.d : [];

    const rawTicker = d[idxName];
    const ticker = typeof rawTicker === 'string' && rawTicker.length > 0
      ? rawTicker
      : (symbol.startsWith('IDX:') ? symbol.slice(4) : symbol);

    const close = parseNumber(d[idxClose]);
    const change = parseNumber(d[idxChange]);
    const volume = parseNumber(d[idxVolume]);
    const turnover = parseNumber(d[idxTurnover]);
    const rsi = parseNumber(d[idxRsi]);
    const sector = parseString(d[idxSector], 'Other / Diversified');
    const industry = parseString(d[idxIndustry], '-');
    const marketCap = parseNumber(d[idxMcap]);
    const pe = parseNumber(d[idxPe]);
    const pbv = parseNumber(d[idxPbv]);
    const ema20 = parseNumber(d[idxEma20]);
    const sma50 = parseNumber(d[idxSma50]);
    const sma200 = parseNumber(d[idxSma200]);
    const perfWeek = parseNumber(d[idxPerfW]);
    const perfMonth = parseNumber(d[idxPerf1M]);
    const perf3M = parseNumber(d[idxPerf3M]);
    const perf6M = parseNumber(d[idxPerf6M]);
    const perfYear = parseNumber(d[idxPerfY]);

    const price52wHigh = idx52wHigh !== undefined ? parseNumber(d[idx52wHigh]) : null;
    const price52wLow = idx52wLow !== undefined ? parseNumber(d[idx52wLow]) : null;
    const rvol = idxRvol !== undefined ? parseNumber(d[idxRvol]) : null;
    const avgVolume30d = idxAvgVol30d !== undefined ? parseNumber(d[idxAvgVol30d]) : null;
    const volatilityD = idxVolatilityD !== undefined ? parseNumber(d[idxVolatilityD]) : null;
    const atr = idxAtr !== undefined ? parseNumber(d[idxAtr]) : null;
    const ema10 = idxEma10 !== undefined ? parseNumber(d[idxEma10]) : null;
    const sma20 = idxSma20 !== undefined ? parseNumber(d[idxSma20]) : null;
    const gap = idxGap !== undefined ? parseNumber(d[idxGap]) : null;
    const changeFromOpen = idxChangeFromOpen !== undefined ? parseNumber(d[idxChangeFromOpen]) : null;

    const aboveSma200 = close !== null && sma200 !== null ? close > sma200 : null;

    const compositePerf = calculateCompositePerformance({
      change,
      perfWeek,
      perfMonth,
      perf3M,
      perf6M,
      perfYear,
    });

    const dist52wHighPct = calculateDist52wHighPct(price52wHigh, close);
    const isStage2 = checkIsStage2(close, sma50, sma200, ema20);
    const near52wHigh = checkNear52wHigh(isStage2, dist52wHighPct);
    const isPocketPivot = checkIsPocketPivot({
      close,
      ema10,
      ema20,
      rvol,
      change,
      dist52wHighPct,
    });

    return {
      ticker,
      symbol,
      name: ticker,
      close,
      change,
      volume,
      turnover,
      rsi,
      sector,
      industry,
      marketCap,
      pe,
      pbv,
      ema20,
      sma50,
      sma200,
      perfWeek,
      perfMonth,
      perf3M,
      perf6M,
      perfYear,
      compositePerf,
      aboveSma200,
      price52wHigh,
      price52wLow,
      rvol,
      avgVolume30d,
      volatilityD,
      atr,
      ema10,
      sma20,
      gap,
      changeFromOpen,
      dist52wHighPct,
      isStage2,
      near52wHigh,
      isPocketPivot,
      rsLine: null,
      alphaVsIhsg1M: null,
      alphaVsIhsg3M: null,
      alphaVsIhsgYear: null,
      isLeadingVsIhsg: false,
      isBlueSkyRs: false,
    };
  });
}

export function calculateRelativeStrength<T extends {
  turnover: number | null;
  compositePerf: number;
}>(
  stocks: T[],
  options?: { minTurnoverIdr?: number }
): (T & { rsScore: number | null; isLiquid: boolean })[] {
  const minTurnover = options?.minTurnoverIdr ?? DEFAULT_MIN_TURNOVER_IDR;

  // Pisahkan universe likuid (turnover >= minTurnover)
  const liquidIndices: number[] = [];
  stocks.forEach((s, idx) => {
    if (s.turnover !== null && s.turnover >= minTurnover) {
      liquidIndices.push(idx);
    }
  });

  const n = liquidIndices.length;
  // Urutkan indeks liquid berdasarkan compositePerf ascending
  const sortedLiquid = [...liquidIndices].sort((a, b) => {
    return stocks[a].compositePerf - stocks[b].compositePerf;
  });

  const rsMap = new Map<number, number>();

  let currentRank = 1;
  for (let i = 0; i < n; i++) {
    const idx = sortedLiquid[i];
    if (i > 0) {
      const prevIdx = sortedLiquid[i - 1];
      if (stocks[idx].compositePerf === stocks[prevIdx].compositePerf) {
        rsMap.set(idx, rsMap.get(prevIdx)!);
        continue;
      }
    }
    currentRank = i + 1;
    // Minervini / IBD RS Percentile scale: 1 - 99
    const rs = n <= 1
      ? 99
      : Math.min(99, Math.max(1, Math.round(((currentRank - 1) / (n - 1)) * 98) + 1));
    rsMap.set(idx, rs);
  }

  return stocks.map((s, idx) => {
    const rsScore = rsMap.get(idx) ?? null;
    return {
      ...s,
      rsScore,
      isLiquid: rsScore !== null,
    };
  });
}

export function calculateMarketBreadth(
  stocks: Array<{ change: number | null; turnover: number | null }>
): MarketBreadthSummary {
  let advances = 0;
  let declines = 0;
  let unchanged = 0;
  let totalTurnover = 0;

  for (const s of stocks) {
    const chg = s.change ?? 0;
    const to = s.turnover ?? 0;
    totalTurnover += to;

    if (chg > 0) {
      advances++;
    } else if (chg < 0) {
      declines++;
    } else {
      unchanged++;
    }
  }

  const denominator = Math.max(declines, 1);
  const ratio = Math.round((advances / denominator) * 100) / 100;

  let sentiment: 'BULLISH_DOMINANT' | 'BEARISH_DOMINANT' | 'NEUTRAL_CHOPPY';
  if (ratio >= 2.0) {
    sentiment = 'BULLISH_DOMINANT';
  } else if (ratio <= 0.5) {
    sentiment = 'BEARISH_DOMINANT';
  } else {
    sentiment = 'NEUTRAL_CHOPPY';
  }

  return {
    advances,
    declines,
    unchanged,
    totalTurnover,
    totalTurnoverTrillion: Math.round((totalTurnover / 1e12) * 1000) / 1000,
    advanceDeclineRatio: ratio,
    sentiment,
  };
}

export function calculateSectorSummary(
  stocks: Array<{ sector: string; turnover: number | null; change: number | null }>
): SectorSummaryItem[] {
  const map = new Map<string, {
    turnover: number;
    up: number;
    down: number;
    unchanged: number;
    totalStocks: number;
    changes: number[];
  }>();

  let totalMarketTurnover = 0;

  for (const s of stocks) {
    const sec = s.sector || 'Other / Diversified';
    const to = s.turnover ?? 0;
    const chg = s.change ?? 0;
    totalMarketTurnover += to;

    let entry = map.get(sec);
    if (!entry) {
      entry = { turnover: 0, up: 0, down: 0, unchanged: 0, totalStocks: 0, changes: [] };
      map.set(sec, entry);
    }

    entry.turnover += to;
    entry.totalStocks++;
    entry.changes.push(chg);

    if (chg > 0) entry.up++;
    else if (chg < 0) entry.down++;
    else entry.unchanged++;
  }

  const results: SectorSummaryItem[] = [];
  const totalDivisor = Math.max(totalMarketTurnover, 1);

  for (const [sector, d] of map.entries()) {
    const avgChg = d.changes.length > 0
      ? d.changes.reduce((a, b) => a + b, 0) / d.changes.length
      : 0;

    results.push({
      sector,
      turnover: d.turnover,
      turnoverTrillion: Math.round((d.turnover / 1e12) * 1000) / 1000,
      sharePct: Math.round((d.turnover / totalDivisor) * 10000) / 100,
      up: d.up,
      down: d.down,
      unchanged: d.unchanged,
      totalStocks: d.totalStocks,
      avgChangePct: Math.round(avgChg * 100) / 100,
    });
  }

  results.sort((a, b) => b.turnover - a.turnover);
  return results;
}

export async function fetchTradingViewScan(
  options?: TradingViewScannerOptions
): Promise<TradingViewStockItem[]> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_SCANNER_TIMEOUT_MS;
  const endpoint = options?.endpointUrl ?? TRADINGVIEW_SCANNER_URL;
  const fetchFn = options?.fetchFn ?? fetch;
  const columns = options?.customColumns ?? TRADINGVIEW_COLUMNS;
  const payload = buildTradingViewPayload({ range: options?.range, columns });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    const isAbort = (err as Error)?.name === 'AbortError' || controller.signal.aborted;
    throw new ProviderUnavailableError(
      isAbort
        ? `TradingView scan timeout setelah ${timeoutMs}ms`
        : `Gagal menghubungi TradingView scanner: ${(err as Error)?.message ?? 'Network error'}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ProviderUnavailableError(
      `TradingView scanner membalas HTTP ${response.status}: ${response.statusText}`
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err: unknown) {
    throw new ProviderUnavailableError(
      `TradingView scanner response bukan JSON valid: ${(err as Error)?.message ?? 'Parse error'}`
    );
  }

  const rawParsed = parseTradingViewScanResponse(json, columns);
  return calculateRelativeStrength(rawParsed, { minTurnoverIdr: options?.minTurnoverIdr });
}

export async function fetchTradingViewIhsg(
  options?: TradingViewScannerOptions
): Promise<IhsgBenchmark | null> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_SCANNER_TIMEOUT_MS;
  const endpoint = options?.endpointUrl ?? TRADINGVIEW_SCANNER_URL;
  const fetchFn = options?.fetchFn ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      body: JSON.stringify({
        symbols: { tickers: ['IDX:COMPOSITE'] },
        columns: IHSG_BENCHMARK_COLUMNS,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return parseIhsgBenchmarkResponse(json);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function scanIdxMarket(
  options?: TradingViewScannerOptions
): Promise<IdxMarketScanResult> {
  const [rawStocks, ihsg] = await Promise.all([
    fetchTradingViewScan(options),
    fetchTradingViewIhsg(options),
  ]);

  const stocks = rawStocks.map((s) => {
    const rsLine = calculateRsLine(s.close, ihsg?.close ?? null);
    const alphaVsIhsg1M =
      s.perfMonth !== null && ihsg?.perfMonth != null
        ? Math.round((s.perfMonth - ihsg.perfMonth) * 100) / 100
        : null;
    const alphaVsIhsg3M =
      s.perf3M !== null && ihsg?.perf3M != null
        ? Math.round((s.perf3M - ihsg.perf3M) * 100) / 100
        : null;
    const alphaVsIhsgYear =
      s.perfYear !== null && ihsg?.perfYear != null
        ? Math.round((s.perfYear - ihsg.perfYear) * 100) / 100
        : null;
    const isLeadingVsIhsg = checkIsLeadingVsIhsg(
      { isLiquid: s.isLiquid, alphaVsIhsg1M, alphaVsIhsg3M, isStage2: s.isStage2, change: s.change },
      ihsg
    );
    const isBlueSkyRs = checkIsBlueSkyRs(
      { isStage2: s.isStage2, near52wHigh: s.near52wHigh, rsScore: s.rsScore },
      ihsg
    );

    return {
      ...s,
      rsLine,
      alphaVsIhsg1M,
      alphaVsIhsg3M,
      alphaVsIhsgYear,
      isLeadingVsIhsg,
      isBlueSkyRs,
    };
  });

  const breadth = calculateMarketBreadth(stocks);
  const sectors = calculateSectorSummary(stocks);

  const liquidStocks = stocks.filter((s) => s.isLiquid && s.rsScore !== null);
  const topRs = [...liquidStocks]
    .sort((a, b) => (b.rsScore ?? 0) - (a.rsScore ?? 0) || (b.turnover ?? 0) - (a.turnover ?? 0))
    .slice(0, 10);

  const topTurnover = [...stocks]
    .sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0))
    .slice(0, 15);

  const stage2Stocks = stocks.filter((s) => s.isStage2);
  const near52wStocks = stocks
    .filter((s) => s.near52wHigh)
    .sort((a, b) => (a.dist52wHighPct ?? 999) - (b.dist52wHighPct ?? 999) || (b.turnover ?? 0) - (a.turnover ?? 0));
  const pocketPivotStocks = stocks
    .filter((s) => s.isPocketPivot)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0) || (b.turnover ?? 0) - (a.turnover ?? 0));
  const leadingStocks = stocks
    .filter((s) => s.isLeadingVsIhsg)
    .sort((a, b) => (b.alphaVsIhsg3M ?? 0) - (a.alphaVsIhsg3M ?? 0) || (b.rsScore ?? 0) - (a.rsScore ?? 0));
  const blueSkyRsStocks = stocks
    .filter((s) => s.isBlueSkyRs)
    .sort((a, b) => (b.rsScore ?? 0) - (a.rsScore ?? 0) || (a.dist52wHighPct ?? 999) - (b.dist52wHighPct ?? 999));

  const nowWib = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date()).replace(' ', ' ') + ' WIB';

  return {
    timestamp: nowWib,
    totalCount: stocks.length,
    liquidCount: liquidStocks.length,
    marketBreadth: breadth,
    sectors,
    ihsg,
    stocks,
    topRs,
    topTurnover,
    stage2Stocks,
    near52wStocks,
    pocketPivotStocks,
    leadingStocks,
    blueSkyRsStocks,
  };
}
