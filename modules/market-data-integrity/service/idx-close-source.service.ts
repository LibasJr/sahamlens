import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import { isProviderCircuitOpen, recordProviderFailure, recordProviderSuccess } from '@/shared/http/provider-circuit-breaker';
import type { CloseObservation } from '../types';

const SOURCE_ID = 'IDX_PUBLIC_STOCK_SUMMARY';
const DEFAULT_URL = 'https://www.idx.co.id/umbraco/Surface/TradingSummary/GetStockSummary';

function finitePositive(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function stringField(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function numericField(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = finitePositive(row[key]);
    if (parsed != null) return parsed;
  }
  return null;
}

function extractRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object');
  if (!payload || typeof payload !== 'object') return [];
  const object = payload as Record<string, unknown>;
  for (const key of ['data', 'Data', 'items', 'Items', 'results', 'Results']) {
    const value = object[key];
    if (Array.isArray(value)) return value.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object');
  }
  return [];
}

export function parseIdxStockSummary(payload: unknown, tradeDate: string): CloseObservation[] {
  const rows = extractRows(payload);
  const result: CloseObservation[] = [];
  for (const row of rows) {
    const code = stringField(row, ['StockCode', 'Code', 'stockCode', 'code', 'Symbol', 'symbol']);
    const close = numericField(row, ['Close', 'ClosingPrice', 'ClosePrice', 'close', 'closingPrice', 'Last', 'last']);
    if (!code || close == null) continue;
    const normalizedCode = code.toUpperCase().replace(/\.JK$/, '');
    if (!/^[A-Z0-9]{4,6}$/.test(normalizedCode)) continue;
    result.push({
      ticker: `${normalizedCode}.JK`,
      tradeDate,
      close,
      observedAt: `${tradeDate}T16:00:00+07:00`,
      source: SOURCE_ID,
    });
  }
  return result;
}

async function fetchDate(tradeDate: string): Promise<CloseObservation[]> {
  if (await isProviderCircuitOpen(SOURCE_ID)) return [];
  const base = process.env.IDX_PUBLIC_STOCK_SUMMARY_URL?.trim() || DEFAULT_URL;
  const date = tradeDate.replace(/-/g, '');
  const url = new URL(base);
  url.searchParams.set('date', date);
  url.searchParams.set('start', '0');
  url.searchParams.set('length', '2000');
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json,text/plain,*/*',
        Referer: 'https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham/',
        'User-Agent': 'Mozilla/5.0 (compatible; SahamLens-DataIntegrity/1.0; +https://sahamlens.id/about)',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      await recordProviderFailure(SOURCE_ID, { immediateOpen: response.status === 403 || response.status === 429 });
      await recordDataSourceHealth({ sourceId: SOURCE_ID, ok: false, force: true, latencyMs: Date.now() - startedAt, detail: { status: response.status } });
      return [];
    }
    const payload = await response.json();
    const rows = parseIdxStockSummary(payload, tradeDate);
    // HTTP 200 + JSON yang dapat diparse berarti provider sehat. `rows=[]` adalah
    // keadaan valid untuk akhir pekan/libur bursa dan TIDAK boleh membuka circuit.
    await recordProviderSuccess(SOURCE_ID);
    await recordDataSourceHealth({
      sourceId: SOURCE_ID,
      ok: rows.length > 0,
      force: true,
      latencyMs: Date.now() - startedAt,
      dataObservedAt: rows.length ? `${tradeDate}T16:00:00+07:00` : null,
      detail: { tradeDate, rows: rows.length, mode: 'VERIFY_ONLY' },
    });
    return rows;
  } catch (error) {
    await recordProviderFailure(SOURCE_ID);
    await recordDataSourceHealth({ sourceId: SOURCE_ID, ok: false, force: true, latencyMs: Date.now() - startedAt, detail: { reason: error instanceof Error ? error.message : String(error) } });
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function wibDate(offsetDays = 0): string {
  const now = new Date(Date.now() - offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** Find the newest exchange summary without assuming weekends/holidays. */
export async function fetchLatestIdxCloseBatch(maxLookbackDays = 8): Promise<{ tradeDate: string; rows: CloseObservation[] } | null> {
  for (let offset = 0; offset <= maxLookbackDays; offset += 1) {
    const tradeDate = wibDate(offset);
    const rows = await fetchDate(tradeDate);
    if (rows.length > 0) return { tradeDate, rows };
  }
  return null;
}
