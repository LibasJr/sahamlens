import { randomUUID } from 'node:crypto';
import { AI_PICK_UNIVERSE } from '@/modules/market/constants/ai-pick-universe';
import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import { fetchLatestIdxCloseBatch } from './idx-close-source.service';
import { fetchYahooCloseForDate } from './yahoo-close-source.service';
import { finishReconciliationRun, startReconciliationRun, upsertCloseReconciliation } from '../repository/market-data-reconciliation.repository';
import type { CloseObservation, CloseReconciliationRow, ReconciliationStatus } from '../types';

import { CURRENT_LQ45_UNIVERSE } from '@/modules/market/constants/lq45-universe';
const PRIMARY_SOURCE = 'IDX_TRADING_INFO_SS_ARTIFACT';
const SECONDARY_SOURCE = 'YAHOO_CHART';

function limitUniverse(): string[] {
  const mode = process.env.MARKET_RECON_UNIVERSE_MODE?.trim().toLowerCase();
  const base = mode === 'lq45' ? [...CURRENT_LQ45_UNIVERSE] : AI_PICK_UNIVERSE;
  const raw = Number(process.env.MARKET_RECON_UNIVERSE_LIMIT ?? base.length);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), base.length) : base.length;
  return base.slice(0, limit);
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let next = 0;
  async function runner() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()));
  return output;
}

export function reconcileClose(primary: CloseObservation | null, secondary: CloseObservation | null, runId: string, ticker: string, tradeDate: string): CloseReconciliationRow {
  let status: ReconciliationStatus;
  if (primary && secondary) status = primary.close === secondary.close ? 'MATCH' : 'MISMATCH';
  else if (primary) status = 'PRIMARY_ONLY';
  else if (secondary) status = 'SECONDARY_ONLY';
  else status = 'NO_DATA';

  const diffAbs = primary && secondary ? Math.abs(primary.close - secondary.close) : null;
  const diffPct = primary && secondary && secondary.close > 0 ? (diffAbs! / secondary.close) * 100 : null;
  return {
    ticker,
    tradeDate,
    primarySource: PRIMARY_SOURCE,
    secondarySource: SECONDARY_SOURCE,
    primaryClose: primary?.close ?? null,
    secondaryClose: secondary?.close ?? null,
    diffAbs,
    diffPct,
    status,
    primaryObservedAt: primary?.observedAt ?? null,
    secondaryObservedAt: secondary?.observedAt ?? null,
    runId,
    detail: {
      rule: 'same_trade_date_exact_close_match',
      note: status === 'MISMATCH' ? 'Harga penutupan berbeda; ticker harus diperlakukan sebagai data sedang diperiksa.' : null,
    },
  };
}

export async function runDailyCloseReconciliation(): Promise<Record<string, unknown>> {
  if (process.env.MARKET_RECON_ENABLED === 'false') {
    return { status: 'SKIPPED', reason: 'MARKET_RECON_ENABLED=false' };
  }
  const universe = limitUniverse();
  const runId = randomUUID();
  await startReconciliationRun({ runId, primarySource: PRIMARY_SOURCE, secondarySource: SECONDARY_SOURCE, universeCount: universe.length });

  const idxBatch = await fetchLatestIdxCloseBatch(universe);
  if (!idxBatch) {
    await finishReconciliationRun({ runId, tradeDate: null, status: 'FAILED', compared: 0, matches: 0, mismatches: 0, primaryOnly: 0, secondaryOnly: 0, noData: 0, detail: { reason: 'primary_source_unavailable' } });
    return { status: 'FAILED', runId, reason: 'primary_source_unavailable' };
  }

  const idxMap = new Map(idxBatch.rows.map((row) => [row.ticker, row]));
  const concurrency = Math.max(1, Math.min(8, Number(process.env.MARKET_RECON_YAHOO_CONCURRENCY ?? 4) || 4));
  const reconciled = await mapConcurrent(universe, concurrency, async (ticker) => {
    const primary = idxMap.get(ticker) ?? null;
    // IDX adalah primary untuk universe LQ45. Yahoo dipertahankan sebagai pembanding.
    const secondary = await fetchYahooCloseForDate(ticker, idxBatch.tradeDate);
    return reconcileClose(primary, secondary, runId, ticker, idxBatch.tradeDate);
  });

  let matches = 0;
  let mismatches = 0;
  let primaryOnly = 0;
  let secondaryOnly = 0;
  let noData = 0;
  for (const row of reconciled) {
    await upsertCloseReconciliation(row);
    if (row.status === 'MATCH') matches += 1;
    else if (row.status === 'MISMATCH') mismatches += 1;
    else if (row.status === 'PRIMARY_ONLY') primaryOnly += 1;
    else if (row.status === 'SECONDARY_ONLY') secondaryOnly += 1;
    else noData += 1;
  }
  const compared = matches + mismatches;
  const partial = mismatches > 0 || primaryOnly > 0 || secondaryOnly > 0 || noData > 0;
  await finishReconciliationRun({
    runId,
    tradeDate: idxBatch.tradeDate,
    status: partial ? 'PARTIAL' : 'COMPLETED',
    compared,
    matches,
    mismatches,
    primaryOnly,
    secondaryOnly,
    noData,
    detail: { universeCount: universe.length, idxRows: idxBatch.rows.length, rule: 'exact_close_same_trade_date' },
  });
  await recordDataSourceHealth({
    sourceId: 'MARKET_CLOSE_RECONCILIATION',
    ok: mismatches === 0 && primaryOnly === 0 && secondaryOnly === 0 && noData === 0 && compared > 0,
    force: true,
    dataObservedAt: `${idxBatch.tradeDate}T16:00:00+07:00`,
    detail: { runId, compared, matches, mismatches, primaryOnly, secondaryOnly, noData },
  });
  return { status: partial ? 'PARTIAL' : 'COMPLETED', runId, tradeDate: idxBatch.tradeDate, universe: universe.length, compared, matches, mismatches, primaryOnly, secondaryOnly, noData };
}
