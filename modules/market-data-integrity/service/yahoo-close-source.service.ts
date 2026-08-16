import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import { isProviderCircuitOpen, recordProviderFailure, recordProviderSuccess } from '@/shared/http/provider-circuit-breaker';
import type { CloseObservation } from '../types';

const SOURCE_ID = 'YAHOO_CHART';

function epochSeconds(date: string, dayOffset: number): number {
  const ms = Date.parse(`${date}T00:00:00Z`) + dayOffset * 86_400_000;
  return Math.floor(ms / 1000);
}

function dateKey(timestampSec: number): string {
  return new Date(timestampSec * 1000).toISOString().slice(0, 10);
}

export async function fetchYahooCloseForDate(ticker: string, tradeDate: string): Promise<CloseObservation | null> {
  if (await isProviderCircuitOpen(SOURCE_ID)) return null;

  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`);
  url.searchParams.set('period1', String(epochSeconds(tradeDate, -1)));
  url.searchParams.set('period2', String(epochSeconds(tradeDate, 2)));
  url.searchParams.set('interval', '1d');
  url.searchParams.set('events', 'history');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const startedAt = Date.now();
  try {
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      const immediateOpen = response.status === 403 || response.status === 429;
      await recordProviderFailure(SOURCE_ID, { immediateOpen });
      await recordDataSourceHealth({ sourceId: SOURCE_ID, ok: false, force: true, latencyMs: Date.now() - startedAt, detail: { status: response.status, phase: 'reconciliation' } });
      return null;
    }
    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
    for (let i = 0; i < timestamps.length; i += 1) {
      if (dateKey(timestamps[i]) !== tradeDate) continue;
      const close = closes[i];
      if (typeof close !== 'number' || !Number.isFinite(close) || close <= 0) continue;
      await recordProviderSuccess(SOURCE_ID);
      return {
        ticker,
        tradeDate,
        close,
        observedAt: new Date(timestamps[i] * 1000).toISOString(),
        source: SOURCE_ID,
      };
    }
    // Respons provider berhasil, tetapi tidak ada bar pada tanggal yang diminta.
    // Ini bisa terjadi karena suspend/delisting/perbedaan kalender dan bukan outage
    // transport provider, sehingga jangan menambah failure circuit global.
    await recordProviderSuccess(SOURCE_ID);
    return null;
  } catch (error) {
    await recordProviderFailure(SOURCE_ID);
    await recordDataSourceHealth({ sourceId: SOURCE_ID, ok: false, force: true, latencyMs: Date.now() - startedAt, detail: { reason: error instanceof Error ? error.message : String(error), phase: 'reconciliation' } });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
