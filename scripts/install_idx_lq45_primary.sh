#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/sahamlens/app}"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-/opt/sahamlens/backups/idx-lq45-primary-${STAMP}}"

cd "$APP_DIR"

need_file() {
  [[ -f "$1" ]] || { echo "ERROR: file tidak ditemukan: $1" >&2; exit 1; }
}

TARGETS=(
  "modules/technical/service/yahoo-history.service.ts"
  "modules/technical/index.ts"
  "app/api/stock/[ticker]/route.ts"
  "modules/market-data-integrity/service/close-reconciliation.service.ts"
  "modules/lens-radar/service/calibration-yahoo-history.service.ts"
  "modules/lens-radar/service/bucket-backtest.service.ts"
  "modules/recommendation/service/tpcl-validation.service.ts"
  "modules/backtest/service/precompute.service.ts"
  "modules/backtest/service/live-filter-check.service.ts"
  "modules/intraday/service/intraday-validation.service.ts"
  "modules/lens-radar/service/transparency.service.ts"
)

for f in "${TARGETS[@]}"; do need_file "$f"; done
need_file ".env.production"

mkdir -p "$BACKUP_DIR"
for f in "${TARGETS[@]}"; do
  mkdir -p "$BACKUP_DIR/$(dirname "$f")"
  cp -a "$f" "$BACKUP_DIR/$f"
done
cp -a .env.production "$BACKUP_DIR/.env.production"

echo "Backup: $BACKUP_DIR"

rollback() {
  local ec=$?
  if [[ $ec -eq 0 ]]; then return 0; fi
  echo
  echo "ERROR: installer gagal (exit=$ec). Melakukan rollback source + .env.production..." >&2
  for f in "${TARGETS[@]}"; do
    if [[ -f "$BACKUP_DIR/$f" ]]; then cp -a "$BACKUP_DIR/$f" "$f"; fi
  done
  cp -a "$BACKUP_DIR/.env.production" .env.production
  rm -f modules/market/constants/lq45-universe.ts
  rm -f modules/technical/service/idx-lq45-history.service.ts
  echo "Rollback selesai. Backup tetap ada di $BACKUP_DIR" >&2
  exit "$ec"
}
trap rollback ERR

# -----------------------------------------------------------------------------
# 0. Network preflight. Abort BEFORE changing code if IDX endpoint is unavailable.
# -----------------------------------------------------------------------------
echo "=== PREFLIGHT IDX GetTradingInfoSS / ASII ==="
if [[ "${SKIP_NETWORK_PREFLIGHT:-0}" != "1" ]]; then
node - <<'NODE'
const url = 'https://www.idx.co.id/primary/ListedCompany/GetTradingInfoSS?code=ASII&start=0&length=5';
const c = new AbortController();
const t = setTimeout(() => c.abort(), 15000);
(async () => {
  try {
    const r = await fetch(url, {
      headers: {
        Accept: 'application/json,text/plain,*/*',
        Referer: 'https://www.idx.co.id/id/perusahaan-tercatat/profil-perusahaan-tercatat/ASII',
        'User-Agent': 'Mozilla/5.0 (compatible; SahamLens/1.0; +https://sahamlens.id/transparency)',
      },
      signal: c.signal,
      cache: 'no-store',
    });
    console.log('HTTP', r.status, r.statusText);
    const text = await r.text();
    console.log('BODY_PREFIX', text.slice(0, 220).replace(/\s+/g, ' '));
    if (!r.ok) process.exit(3);
    try {
      const j = JSON.parse(text);
      const rows = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.Data) ? j.Data : [];
      console.log('PARSED_ROWS', rows.length);
      if (!rows.length) process.exit(4);
    } catch {
      process.exit(5);
    }
  } finally {
    clearTimeout(t);
  }
})().catch((e) => { console.error(e); process.exit(2); });
NODE
else
  echo "SKIP_NETWORK_PREFLIGHT=1"
fi

mkdir -p modules/market/constants modules/technical/service

# -----------------------------------------------------------------------------
# 1. Current LQ45 universe, explicitly versioned by effective period.
# -----------------------------------------------------------------------------
cat > modules/market/constants/lq45-universe.ts <<'TS'
/**
 * LQ45 current constituent snapshot.
 * Effective period: 2026-08-03 through 2026-10-30.
 * Announcement reference: Peng-00148/BEI.POP/07-2026.
 *
 * IMPORTANT: this is a point-in-time universe snapshot. Never use this list to
 * backtest dates before its effectiveFrom without a historical constituent table.
 */
export const CURRENT_LQ45_VERSION = 'lq45-2026-08';
export const CURRENT_LQ45_EFFECTIVE_FROM = '2026-08-03';
export const CURRENT_LQ45_EFFECTIVE_TO = '2026-10-30';

export const CURRENT_LQ45_UNIVERSE = [
  'AADI.JK', 'ADMR.JK', 'ADRO.JK', 'AKRA.JK', 'AMMN.JK',
  'AMRT.JK', 'ANTM.JK', 'ASII.JK', 'BBCA.JK', 'BBNI.JK',
  'BBRI.JK', 'BBTN.JK', 'BMRI.JK', 'BRPT.JK', 'BUMI.JK',
  'CPIN.JK', 'CUAN.JK', 'DEWA.JK', 'EMTK.JK', 'ESSA.JK',
  'EXCL.JK', 'GOTO.JK', 'HRTA.JK', 'ICBP.JK', 'INCO.JK',
  'INDF.JK', 'INDY.JK', 'INKP.JK', 'ISAT.JK', 'ITMG.JK',
  'JPFA.JK', 'KLBF.JK', 'MAPI.JK', 'MBMA.JK', 'MDKA.JK',
  'MEDC.JK', 'NCKL.JK', 'PGAS.JK', 'PGEO.JK', 'PTBA.JK',
  'SCMA.JK', 'TLKM.JK', 'UNTR.JK', 'UNVR.JK', 'WIFI.JK',
] as const;

const CURRENT_LQ45_SET = new Set<string>(CURRENT_LQ45_UNIVERSE);

export function normalizeLq45Ticker(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (!t || t.startsWith('^')) return t;
  return t.endsWith('.JK') ? t : `${t}.JK`;
}

export function isCurrentLq45Ticker(raw: string): boolean {
  return CURRENT_LQ45_SET.has(normalizeLq45Ticker(raw));
}
TS

# -----------------------------------------------------------------------------
# 2. IDX EOD/historical provider for LQ45.
#    - Raw OHLCV comes from IDX TradingInfoSS.
#    - Yahoo AdjClose remains enrichment only, because TradingInfoSS does not
#      expose a dividend-adjusted close series.
#    - No dummy/default numeric values.
# -----------------------------------------------------------------------------
cat > modules/technical/service/idx-lq45-history.service.ts <<'TS'
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
  previousClose: number | null;
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
  latestCloseReconciliation: 'MATCH' | 'MISMATCH' | 'NO_OVERLAP' | 'IDX_ONLY';
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
    const previous = history.length >= 2 ? history[history.length - 2] : null;
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
      previousClose: previous?.Close ?? null,
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
      latestCloseReconciliation: 'IDX_ONLY',
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
TS

# -----------------------------------------------------------------------------
# 3. Patch existing source with narrow, verified edits.
# -----------------------------------------------------------------------------
python3 - <<'PY'
from pathlib import Path
import re


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    s = p.read_text()
    if new in s:
        print(f"SKIP already patched: {label}")
        return
    if old not in s:
        raise SystemExit(f"PATCH ERROR [{label}]: marker tidak ditemukan di {path}")
    p.write_text(s.replace(old, new, 1))
    print(f"OK: {label}")


def insert_after_imports(path: str, import_line: str, label: str):
    p = Path(path)
    s = p.read_text()
    if import_line in s:
        print(f"SKIP already patched: {label}")
        return
    matches = list(re.finditer(r"^import .*?;\s*$", s, flags=re.M))
    if not matches:
        raise SystemExit(f"PATCH ERROR [{label}]: tidak menemukan blok import di {path}")
    pos = matches[-1].end()
    p.write_text(s[:pos] + "\n" + import_line + s[pos:])
    print(f"OK: {label}")

# 3a. modules/technical/service/yahoo-history.service.ts
path = 'modules/technical/service/yahoo-history.service.ts'
insert_after_imports(
    path,
    "import { applyIdxLq45EodPrimary } from './idx-lq45-history.service';",
    'import IDX LQ45 overlay into shared history service',
)
replace_once(
    path,
    "export async function fetchYahooHistory(ticker: string, range: string = '1y'): Promise<YahooHistoryResult | null> {",
    "export async function fetchYahooHistory(ticker: string, range: string = '1y', options: { sourcePolicy?: 'AUTO' | 'YAHOO_ONLY' } = {}): Promise<YahooHistoryResult | null> {",
    'add sourcePolicy option',
)
replace_once(
    path,
    "    return { history, currentPrice, regularMarketTime, previousClose };",
    """    const eod = options.sourcePolicy === 'YAHOO_ONLY'
      ? null
      : await applyIdxLq45EodPrimary(ticker, range, history);
    return {
      history: eod?.history ?? history,
      currentPrice,
      regularMarketTime,
      previousClose,
      historySource: eod?.source ?? 'YAHOO_CHART',
      liveQuoteSource: 'YAHOO_CHART',
      adjustedCloseSource: eod?.adjustedCloseSource ?? (history.some((row) => typeof row.AdjClose === 'number') ? 'YAHOO_CHART' : null),
      universeVersion: eod?.universeVersion ?? null,
      reconciliationStatus: eod?.latestCloseReconciliation ?? null,
    } as YahooHistoryResult & Record<string, unknown>;""",
    'overlay IDX raw EOD history',
)
# Append direct-Yahoo compatibility helper for research/validation paths.
p = Path(path)
s = p.read_text()
helper = """

/** Research/validation escape hatch: immutable Yahoo-only input for legacy datasets. */
export async function fetchYahooHistoryDirect(ticker: string, range: string = '1y'): Promise<YahooHistoryResult | null> {
  return fetchYahooHistory(ticker, range, { sourcePolicy: 'YAHOO_ONLY' });
}
"""
if 'export async function fetchYahooHistoryDirect' not in s:
    p.write_text(s.rstrip() + helper + '\n')
    print('OK: add fetchYahooHistoryDirect')

# 3b. Export direct helper from barrel.
replace_once(
    'modules/technical/index.ts',
    "export { fetchYahooHistory, type OhlcRow, type YahooHistoryResult } from './service/yahoo-history.service';",
    "export { fetchYahooHistory, fetchYahooHistoryDirect, type OhlcRow, type YahooHistoryResult } from './service/yahoo-history.service';",
    'export Yahoo direct helper',
)

# 3c. Pin research/validation modules to Yahoo-only so current lab baselines do not change silently.
research_files = [
    'modules/lens-radar/service/calibration-yahoo-history.service.ts',
    'modules/lens-radar/service/bucket-backtest.service.ts',
    'modules/recommendation/service/tpcl-validation.service.ts',
    'modules/backtest/service/precompute.service.ts',
    'modules/backtest/service/live-filter-check.service.ts',
    'modules/intraday/service/intraday-validation.service.ts',
    'modules/lens-radar/service/transparency.service.ts',
]
for fp in research_files:
    p = Path(fp)
    s = p.read_text()
    if 'fetchYahooHistoryDirect' in s:
        print(f'SKIP already research-pinned: {fp}')
        continue
    if 'fetchYahooHistory' not in s:
        print(f'SKIP no fetchYahooHistory symbol: {fp}')
        continue
    p.write_text(s.replace('fetchYahooHistory', 'fetchYahooHistoryDirect'))
    print(f'OK: research Yahoo-only -> {fp}')

# 3d. app/api/stock route: raw completed EOD history from IDX for LQ45,
# while currentPrice + adjusted close enrichment remain Yahoo.
path = 'app/api/stock/[ticker]/route.ts'
insert_after_imports(
    path,
    "import { applyIdxLq45EodPrimary } from '@/modules/technical/service/idx-lq45-history.service';",
    'import IDX overlay into stock API',
)
replace_once(path, '    const history = [];', '    let history: any[] = [];', 'make stock history replaceable')
marker = """    // Window 200 hari terakhir untuk analyzer/scoring (Performance Roadmap Fase 2
    // poin 6)"""
insert = """    const eodHistory = await applyIdxLq45EodPrimary(ticker, range, history);
    history = eodHistory.history;

    // Window 200 hari terakhir untuk analyzer/scoring (Performance Roadmap Fase 2
    // poin 6)"""
replace_once(path, marker, insert, 'apply IDX history before analyzers')
replace_once(
    path,
    "      _meta: {\n        source: 'live',",
    """      _meta: {
        source: 'live',
        eodHistorySource: eodHistory.source,
        liveQuoteSource: 'YAHOO_CHART',
        adjustedCloseSource: eodHistory.adjustedCloseSource,
        lq45UniverseVersion: eodHistory.universeVersion,
        eodLatestTradeDate: eodHistory.latestTradeDate,
        eodReconciliationStatus: eodHistory.latestCloseReconciliation,""",
    'expose provider provenance in stock API',
)
# Bust computed cache after provider policy change.
p = Path(path)
s = p.read_text()
if 'idx-lq45-eod-v1' not in s:
    old = """    const cacheKey = `sahamlens:cache:computed:technical:${COMPUTED_CACHE_VERSION}:${ticker}:${range}`;"""
    new = """    const providerCacheTag = process.env.IDX_LQ45_EOD_PRIMARY_ENABLED === 'true' ? 'idx-lq45-eod-v1' : 'yahoo-eod-v1';
    const cacheKey = `sahamlens:cache:computed:technical:${COMPUTED_CACHE_VERSION}:${providerCacheTag}:${ticker}:${range}`;"""
    if old not in s:
        raise SystemExit('PATCH ERROR [cache tag]: cacheKey marker tidak ditemukan')
    s = s.replace(old, new, 1)
    old2 = """    const staleFallbackKey = `sahamlens:cache:computed:technical-stale-fallback:${COMPUTED_CACHE_VERSION}:${ticker}:${range}`;"""
    new2 = """    const staleFallbackKey = `sahamlens:cache:computed:technical-stale-fallback:${COMPUTED_CACHE_VERSION}:${providerCacheTag}:${ticker}:${range}`;"""
    if old2 not in s:
        raise SystemExit('PATCH ERROR [stale cache tag]: marker tidak ditemukan')
    s = s.replace(old2, new2, 1)
    p.write_text(s)
    print('OK: provider-versioned stock cache keys')

# 3e. Reconciliation becomes LQ45-first and source ordering reflects IDX primary.
path = 'modules/market-data-integrity/service/close-reconciliation.service.ts'
insert_after_imports(
    path,
    "import { CURRENT_LQ45_UNIVERSE } from '@/modules/market/constants/lq45-universe';",
    'import LQ45 universe into reconciliation',
)
replace_once(path, "const PRIMARY_SOURCE = 'YAHOO_CHART';", "const PRIMARY_SOURCE = 'IDX_PUBLIC_STOCK_SUMMARY';", 'reconciliation primary IDX')
replace_once(path, "const SECONDARY_SOURCE = 'IDX_PUBLIC_STOCK_SUMMARY';", "const SECONDARY_SOURCE = 'YAHOO_CHART';", 'reconciliation secondary Yahoo')
p = Path(path)
s = p.read_text()
pattern = re.compile(r"function limitUniverse\(\): string\[\] \{.*?\n\}", re.S)
replacement = """function limitUniverse(): string[] {
  const mode = process.env.MARKET_RECON_UNIVERSE_MODE?.trim().toLowerCase();
  const base = mode === 'lq45' ? [...CURRENT_LQ45_UNIVERSE] : AI_PICK_UNIVERSE;
  const raw = Number(process.env.MARKET_RECON_UNIVERSE_LIMIT ?? base.length);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), base.length) : base.length;
  return base.slice(0, limit);
}"""
new_s, n = pattern.subn(replacement, s, count=1)
if n != 1:
    raise SystemExit('PATCH ERROR [limitUniverse]: function block tidak ditemukan/ambigu')
s = new_s
old_worker = """    const secondary = idxMap.get(ticker) ?? null;
    // Fetch primary untuk SELURUH universe. Kalau secondary tidak punya ticker ini,
    // kita tetap ingin membedakan PRIMARY_ONLY dari NO_DATA; gap coverage tidak boleh
    // hilang hanya karena sumber pembanding tidak punya row.
    const primary = await fetchYahooCloseForDate(ticker, idxBatch.tradeDate);
    return reconcileClose(primary, secondary, runId, ticker, idxBatch.tradeDate);"""
new_worker = """    const primary = idxMap.get(ticker) ?? null;
    // IDX adalah primary untuk universe LQ45. Yahoo dipertahankan sebagai pembanding.
    const secondary = await fetchYahooCloseForDate(ticker, idxBatch.tradeDate);
    return reconcileClose(primary, secondary, runId, ticker, idxBatch.tradeDate);"""
if new_worker not in s:
    if old_worker not in s:
        raise SystemExit('PATCH ERROR [reconciliation worker]: marker tidak ditemukan')
    s = s.replace(old_worker, new_worker, 1)
p.write_text(s)
print('OK: LQ45 reconciliation routing')
PY

# -----------------------------------------------------------------------------
# 4. Environment flags: idempotent update, no duplicate keys.
# -----------------------------------------------------------------------------
python3 - <<'PY'
from pathlib import Path
p = Path('.env.production')
s = p.read_text().splitlines()
updates = {
  'IDX_LQ45_EOD_PRIMARY_ENABLED': 'true',
  'IDX_TRADING_INFO_URL': 'https://www.idx.co.id/primary/ListedCompany/GetTradingInfoSS',
  'IDX_LQ45_CONCURRENCY': '3',
  'IDX_LQ45_CACHE_TTL_MS': '600000',
  'MARKET_RECON_ENABLED': 'true',
  'MARKET_RECON_UNIVERSE_MODE': 'lq45',
  'MARKET_RECON_UNIVERSE_LIMIT': '45',
  'MARKET_RECON_YAHOO_CONCURRENCY': '4',
}
seen = set()
out = []
for line in s:
    if '=' in line and not line.lstrip().startswith('#'):
        k = line.split('=', 1)[0].strip()
        if k in updates:
            if k not in seen:
                out.append(f'{k}={updates[k]}')
                seen.add(k)
            continue
    out.append(line)
for k, v in updates.items():
    if k not in seen:
        out.append(f'{k}={v}')
p.write_text('\n'.join(out).rstrip() + '\n')
print('OK: .env.production flags updated')
PY

# -----------------------------------------------------------------------------
# 5. Static guards before typecheck.
# -----------------------------------------------------------------------------
echo "=== STATIC VERIFY ==="
grep -n "CURRENT_LQ45_VERSION\|CURRENT_LQ45_UNIVERSE" modules/market/constants/lq45-universe.ts | head
grep -n "applyIdxLq45EodPrimary" modules/technical/service/yahoo-history.service.ts app/api/stock/'[ticker]'/route.ts
grep -n "fetchYahooHistoryDirect" modules/lens-radar/service/calibration-yahoo-history.service.ts modules/recommendation/service/tpcl-validation.service.ts | head
grep -nE 'IDX_LQ45_EOD_PRIMARY_ENABLED|IDX_TRADING_INFO_URL|MARKET_RECON_UNIVERSE_MODE' .env.production

# -----------------------------------------------------------------------------
# 6. Typecheck + selected tests + build. Any failure triggers rollback.
# -----------------------------------------------------------------------------
if [[ "${SKIP_VALIDATION:-0}" != "1" ]]; then
  echo "=== TYPECHECK ==="
  npm run typecheck

  echo "=== SELECTED TESTS ==="
  npx vitest run \
    modules/market-data-integrity/__tests__/close-reconciliation.test.ts \
    modules/technical/service/__tests__/golden-indicators.test.ts \
    modules/technical/service/__tests__/ema-single-source.test.ts

  echo "=== BUILD ==="
  npm run build
else
  echo "SKIP_VALIDATION=1"
fi

# -----------------------------------------------------------------------------
# 7. Restart production only after clean build.
# -----------------------------------------------------------------------------
if [[ "${SKIP_RESTART:-0}" != "1" ]]; then
  echo "=== RESTART SAHAMLENS ==="
  sudo systemctl restart sahamlens
  sleep 3
  sudo systemctl --no-pager --full status sahamlens | sed -n '1,24p'
else
  echo "SKIP_RESTART=1"
fi

# -----------------------------------------------------------------------------
# 8. Source-level smoke test. This does not run calibration/backfill.
# -----------------------------------------------------------------------------
if [[ "${SKIP_SMOKE:-0}" != "1" ]]; then
  echo "=== SMOKE IDX LQ45 ==="
  set +e
NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection" \
  npx tsx -e "import { fetchIdxLq45History } from './modules/technical/service/idx-lq45-history.service'; const r=await fetchIdxLq45History('ASII.JK','1y'); console.log(JSON.stringify({source:r?.source,rows:r?.history.length,latestTradeDate:r?.latestTradeDate,latestClose:r?.latestClose,foreignFields:r?.history.at(-1) ? {foreignBuy:r.history.at(-1)?.ForeignBuy,foreignSell:r.history.at(-1)?.ForeignSell,value:r.history.at(-1)?.Value,frequency:r.history.at(-1)?.Frequency}:null},null,2)); if(!r?.history.length) process.exit(7);"
SMOKE=$?
set -e
if [[ $SMOKE -ne 0 ]]; then
    echo "WARNING: build/service sukses, tetapi smoke source IDX gagal. Provider akan fail-open ke Yahoo karena overlay mengembalikan Yahoo saat IDX null." >&2
  fi
else
  echo "SKIP_SMOKE=1"
fi

trap - ERR

echo
echo "=============================================="
echo "IDX LQ45 EOD PRIMARY INSTALLED"
echo "Backup: $BACKUP_DIR"
echo "Research/Calibration/TPCL tetap Yahoo-only untuk menjaga baseline saat ini."
echo "JANGAN jalankan backfill lens-history pada maintenance ini."
echo "=============================================="
