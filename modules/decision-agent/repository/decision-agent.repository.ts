import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import type {
  DecisionAgentDashboard,
  DecisionAgentRun,
  DecisionAgentSignal,
  PaperAccount,
  PaperOrder,
  PaperPerformance,
  PaperPosition,
  PersistedDecisionSignal,
} from '../types/decision-agent.types';
import { aggregateShadowCohorts } from '../service/shadow-evaluation';

type Queryable = Pick<PoolClient, 'query'>;

function number(value: unknown): number {
  return Number(value);
}

export async function insertDecisionRun(run: Omit<DecisionAgentRun, 'id' | 'createdAt'>): Promise<DecisionAgentRun> {
  await ensureSharedSchema();
  const client = await pool.connect();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO decision_agent_runs
        (id, trigger_type, data_as_of, model_validated, engine_version, summary, created_at,
         hybrid_status, hybrid_model, hybrid_reviewed_count, hybrid_input_tokens, hybrid_output_tokens, hybrid_error_code)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id, run.trigger, run.dataAsOf, run.modelValidated, run.version, JSON.stringify(run.summary), createdAt,
        run.hybrid.status, run.hybrid.model, run.hybrid.reviewedCount, run.hybrid.inputTokens,
        run.hybrid.outputTokens, run.hybrid.errorCode,
      ],
    );
    for (const signal of run.signals) {
      const signalId = await insertSignal(client, id, signal, createdAt);
      if (signal.hybridReview) {
        await client.query(
          `INSERT INTO decision_agent_hybrid_reviews
            (id, signal_id, verdict, confidence, evidence_refs, concerns, next_evidence, model, reviewed_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9)`,
          [
            crypto.randomUUID(), signalId, signal.hybridReview.verdict, signal.hybridReview.confidence,
            JSON.stringify(signal.hybridReview.evidenceRefs), JSON.stringify(signal.hybridReview.concerns),
            JSON.stringify(signal.hybridReview.nextEvidence), signal.hybridReview.model, signal.hybridReview.reviewedAt,
          ],
        );
      }
      // Mark-to-market memakai harga dari snapshot AI Pick yang sama dengan run ini.
      // Tidak ada interpolasi atau harga pengganti ketika simbol tidak ada di snapshot.
      await client.query(
        `UPDATE decision_agent_paper_positions
            SET last_price = $3,
                observed_mae_pct = LEAST(observed_mae_pct, (($3-avg_price)/avg_price)*100),
                observed_mfe_pct = GREATEST(observed_mfe_pct, (($3-avg_price)/avg_price)*100),
                updated_at = $4
          WHERE account_id = $1 AND ticker = $2 AND lots > 0`,
        ['internal-paper', signal.ticker, signal.price, createdAt],
      );
      await client.query(
        `UPDATE decision_agent_paper_round_trips trip
            SET observed_mae_pct = position.observed_mae_pct,
                observed_mfe_pct = position.observed_mfe_pct
           FROM decision_agent_paper_positions position
          WHERE trip.account_id=$1 AND trip.ticker=$2 AND trip.status='OPEN'
            AND position.account_id=trip.account_id AND position.ticker=trip.ticker`,
        ['internal-paper', signal.ticker],
      );
    }
    const nav = await client.query(
      `SELECT a.cash,COALESCE(SUM(p.lots*100*p.last_price),0) AS positions_value
         FROM decision_agent_paper_accounts a
         LEFT JOIN decision_agent_paper_positions p ON p.account_id=a.id AND p.lots>0
        WHERE a.id='internal-paper' GROUP BY a.cash`,
    );
    if (nav.rows[0]) {
      const cash = number(nav.rows[0].cash);
      const positionsValue = number(nav.rows[0].positions_value);
      await client.query(
        `INSERT INTO decision_agent_paper_nav_snapshots
          (id,account_id,nav,cash,positions_value,source,observed_at)
         VALUES ($1,'internal-paper',$2,$3,$4,'SCAN',$5)`,
        [crypto.randomUUID(), cash + positionsValue, cash, positionsValue, createdAt],
      );
    }
    await client.query('COMMIT');
    return { ...run, id, createdAt };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function insertSignal(
  client: Queryable,
  runId: string,
  signal: DecisionAgentSignal,
  createdAt: string,
): Promise<string> {
  const signalId = crypto.randomUUID();
  await client.query(
    `INSERT INTO decision_agent_signals
      (id, run_id, ticker, action, price, lens_score, coverage_pct,
       paper_readiness,
       live_readiness, data_as_of, stale, payload, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
    [
      signalId, runId, signal.ticker, signal.action, signal.price,
      signal.lensScore, signal.coveragePct, signal.paperReadiness, signal.liveReadiness,
      signal.dataAsOf, signal.stale, JSON.stringify(signal), createdAt,
    ],
  );
  return signalId;
}

function mapSignal(row: Record<string, unknown>): PersistedDecisionSignal {
  const payload = row.payload as DecisionAgentSignal;
  return {
    ...payload,
    sector: payload.sector ?? null,
    avgValue20d: payload.avgValue20d ?? null,
    news: {
      ...payload.news,
      matchedArticles: payload.news?.matchedArticles ?? [],
    },
    hybridStatus: payload.hybridStatus ?? 'NOT_REVIEWED',
    hybridReview: payload.hybridReview ?? null,
    id: String(row.id),
    runId: String(row.run_id),
  };
}

function mapOrder(row: Record<string, unknown>): PaperOrder {
  return {
    id: String(row.id),
    signalId: String(row.signal_id),
    ticker: String(row.ticker),
    side: row.side as PaperOrder['side'],
    lots: number(row.lots),
    limitPrice: number(row.limit_price),
    fillPrice: row.fill_price == null ? null : number(row.fill_price),
    grossValue: row.gross_value == null ? null : number(row.gross_value),
    feeValue: row.fee_value == null ? null : number(row.fee_value),
    slippageBps: row.slippage_bps == null ? null : number(row.slippage_bps),
    priceSource: row.price_source == null ? null : String(row.price_source),
    priceAsOf: row.price_as_of ? new Date(String(row.price_as_of)).toISOString() : null,
    freshness: row.freshness == null ? null : String(row.freshness),
    status: row.status as PaperOrder['status'],
    rationale: String(row.rationale),
    proposedAt: new Date(String(row.proposed_at)).toISOString(),
    executedAt: row.executed_at ? new Date(String(row.executed_at)).toISOString() : null,
  };
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export async function getDecisionAgentDashboard(): Promise<DecisionAgentDashboard> {
  await ensureSharedSchema();
  const [runResult, accountResult, positionResult, orderResult, roundTripResult, navSnapshotResult, thesisResult, shadowResult] = await Promise.all([
    pool.query(`SELECT * FROM decision_agent_runs ORDER BY created_at DESC LIMIT 1`),
    pool.query(`SELECT * FROM decision_agent_paper_accounts WHERE id = 'internal-paper'`),
    pool.query(`SELECT * FROM decision_agent_paper_positions WHERE account_id = 'internal-paper' AND lots > 0 ORDER BY ticker`),
    pool.query(`SELECT * FROM decision_agent_orders ORDER BY proposed_at DESC LIMIT 50`),
    pool.query(`SELECT * FROM decision_agent_paper_round_trips WHERE account_id='internal-paper' ORDER BY opened_at`),
    pool.query(`SELECT nav,observed_at FROM decision_agent_paper_nav_snapshots WHERE account_id='internal-paper' ORDER BY observed_at`),
    pool.query(`SELECT * FROM decision_agent_theses WHERE account_id='internal-paper' ORDER BY status,review_at,ticker`),
    pool.query(`
      WITH daily_signals AS (
        SELECT DISTINCT ON (s.ticker, (s.data_as_of AT TIME ZONE 'Asia/Jakarta')::date)
          s.id,s.ticker,(s.data_as_of AT TIME ZONE 'Asia/Jakarta')::date AS signal_date,
          COALESCE(review.verdict,'NOT_REVIEWED') AS verdict
        FROM decision_agent_signals s
        LEFT JOIN decision_agent_hybrid_reviews review ON review.signal_id=s.id
        WHERE s.action='BUY_CANDIDATE' AND s.paper_readiness='PAPER_READY'
        ORDER BY s.ticker,(s.data_as_of AT TIME ZONE 'Asia/Jakarta')::date,s.created_at
      ), signal_prices AS (
        SELECT signal.id,signal.verdict,calendar.horizon_offset,
               calendar.price
        FROM daily_signals signal
        CROSS JOIN LATERAL (
          SELECT observed.price,ROW_NUMBER() OVER (ORDER BY observed.date)::int AS horizon_offset
          FROM (
            SELECT history.date,
                   COALESCE(history.adjusted_close_price,history.raw_close_price,history.close_price)::numeric AS price
            FROM lens_radar_history history
            WHERE history.ticker=signal.ticker AND history.date > signal.signal_date
            ORDER BY history.date LIMIT 20
          ) observed
        ) calendar
        WHERE calendar.horizon_offset IN (1,5,20)
      )
      SELECT id,verdict,
             MAX(price) FILTER (WHERE horizon_offset=1) AS entry_price,
             MAX(price) FILTER (WHERE horizon_offset=5) AS t5_price,
             MAX(price) FILTER (WHERE horizon_offset=20) AS t20_price
      FROM signal_prices GROUP BY id,verdict
    `),
  ]);

  const runRow = runResult.rows[0] as Record<string, unknown> | undefined;
  const signalRows = runRow
    ? (await pool.query(`SELECT * FROM decision_agent_signals WHERE run_id = $1 ORDER BY lens_score DESC, ticker`, [runRow.id])).rows
    : [];
  const accountRow = accountResult.rows[0] as Record<string, unknown> | undefined;

  const paperAccount: PaperAccount | null = accountRow ? {
    id: String(accountRow.id),
    name: String(accountRow.name),
    cash: number(accountRow.cash),
    initialCash: number(accountRow.initial_cash),
    riskBudgetPct: number(accountRow.risk_budget_pct),
    maxPositionPct: number(accountRow.max_position_pct),
    maxOpenPositions: number(accountRow.max_open_positions),
    maxTotalExposurePct: accountRow.max_total_exposure_pct == null ? null : number(accountRow.max_total_exposure_pct),
    maxSectorExposurePct: accountRow.max_sector_exposure_pct == null ? null : number(accountRow.max_sector_exposure_pct),
    maxPositionsPerSector: accountRow.max_positions_per_sector == null ? null : number(accountRow.max_positions_per_sector),
    maxAdvParticipationPct: accountRow.max_adv_participation_pct == null ? null : number(accountRow.max_adv_participation_pct),
    maxDrawdownPct: accountRow.max_drawdown_pct == null ? null : number(accountRow.max_drawdown_pct),
    buyFeePct: accountRow.buy_fee_pct == null ? null : number(accountRow.buy_fee_pct),
    sellFeePct: accountRow.sell_fee_pct == null ? null : number(accountRow.sell_fee_pct),
    slippageBps: accountRow.slippage_bps == null ? null : number(accountRow.slippage_bps),
    enabled: Boolean(accountRow.enabled),
  } : null;

  const positions: PaperPosition[] = positionResult.rows.map((row) => ({
    ticker: String(row.ticker),
    lots: number(row.lots),
    avgPrice: number(row.avg_price),
    lastPrice: number(row.last_price),
    sector: row.sector == null ? null : String(row.sector),
    avgValue20d: row.avg_value_20d == null ? null : number(row.avg_value_20d),
    observedMaePct: number(row.observed_mae_pct ?? 0),
    observedMfePct: number(row.observed_mfe_pct ?? 0),
  }));

  const closedTrips = roundTripResult.rows.filter((row) => row.status === 'CLOSED' && row.realized_pnl != null);
  const realizedValues = closedTrips.map((row) => number(row.realized_pnl));
  const wins = realizedValues.filter((value) => value > 0);
  const losses = realizedValues.filter((value) => value < 0);
  const positionValue = positions.reduce((sum, position) => sum + position.lots * 100 * position.lastPrice, 0);
  const nav = paperAccount ? paperAccount.cash + positionValue : null;
  const openTrips = new Map(roundTripResult.rows.filter((row) => row.status === 'OPEN').map((row) => [String(row.ticker), row]));
  const unrealizedPnl = positions.reduce((sum, position) => {
    const trip = openTrips.get(position.ticker);
    if (!trip) return sum;
    return sum + position.lots * 100 * position.lastPrice - number(trip.gross_buy) - number(trip.buy_fee);
  }, 0);
  let runningHigh = 0;
  let maxDrawdownPct: number | null = null;
  for (const row of navSnapshotResult.rows) {
    const value = number(row.nav);
    runningHigh = Math.max(runningHigh, value);
    if (runningHigh <= 0) continue;
    const drawdown = (runningHigh - value) / runningHigh * 100;
    maxDrawdownPct = Math.max(maxDrawdownPct ?? 0, drawdown);
  }
  const highWaterNav = Math.max(runningHigh, nav ?? 0) || null;
  const currentDrawdownPct = nav != null && highWaterNav != null && highWaterNav > 0
    ? (highWaterNav - nav) / highWaterNav * 100
    : null;
  const performance: PaperPerformance = {
    initialCash: paperAccount?.initialCash ?? null,
    nav,
    totalReturnPct: paperAccount && nav != null ? (nav - paperAccount.initialCash) / paperAccount.initialCash * 100 : null,
    realizedPnl: realizedValues.reduce((sum, value) => sum + value, 0),
    unrealizedPnl,
    closedTrades: closedTrips.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: closedTrips.length > 0 ? wins.length / closedTrips.length * 100 : null,
    averageWin: average(wins),
    averageLoss: average(losses),
    expectancy: average(realizedValues),
    maxDrawdownPct,
    averageMaePct: average(closedTrips.map((row) => number(row.observed_mae_pct))),
    averageMfePct: average(closedTrips.map((row) => number(row.observed_mfe_pct))),
  };
  const shadowRows = shadowResult.rows.map((row) => {
    const entry = row.entry_price == null ? null : number(row.entry_price);
    const t5 = row.t5_price == null ? null : number(row.t5_price);
    const t20 = row.t20_price == null ? null : number(row.t20_price);
    return {
      verdict: String(row.verdict),
      t5: entry && t5 ? (t5 / entry - 1) * 100 : null,
      t20: entry && t20 ? (t20 / entry - 1) * 100 : null,
    };
  });
  const shadowCohorts = aggregateShadowCohorts(shadowRows);
  const sectorMap = new Map<string, number>();
  for (const position of positions) {
    const sector = position.sector ?? 'TIDAK TERSEDIA';
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + position.lots * 100 * position.lastPrice);
  }
  const sectorExposure = [...sectorMap.entries()].map(([sector, value]) => ({
    sector,
    value,
    pctNav: nav && nav > 0 ? value / nav * 100 : 0,
  })).sort((a, b) => b.value - a.value);
  const totalExposurePct = nav && nav > 0 ? positionValue / nav * 100 : null;
  const blockers: string[] = [];
  if (paperAccount) {
    if ([paperAccount.maxTotalExposurePct, paperAccount.maxSectorExposurePct, paperAccount.maxPositionsPerSector, paperAccount.maxAdvParticipationPct,
      paperAccount.maxDrawdownPct, paperAccount.buyFeePct, paperAccount.sellFeePct, paperAccount.slippageBps].some((value) => value == null)) {
      blockers.push('Kebijakan pilot 90 hari belum lengkap.');
    }
    if (currentDrawdownPct != null && paperAccount.maxDrawdownPct != null && currentDrawdownPct >= paperAccount.maxDrawdownPct) {
      blockers.push('Batas drawdown tercapai; paper BUY baru dihentikan.');
    }
    if (totalExposurePct != null && paperAccount.maxTotalExposurePct != null && totalExposurePct >= paperAccount.maxTotalExposurePct) {
      blockers.push('Batas total exposure tercapai.');
    }
    const breachedSector = sectorExposure.find((item) => paperAccount.maxSectorExposurePct != null && item.pctNav >= paperAccount.maxSectorExposurePct);
    if (breachedSector) blockers.push(`Batas exposure sektor ${breachedSector.sector} tercapai.`);
  }

  return {
    latestRun: runRow ? {
      id: String(runRow.id),
      createdAt: new Date(String(runRow.created_at)).toISOString(),
      dataAsOf: new Date(String(runRow.data_as_of)).toISOString(),
      trigger: runRow.trigger_type as DecisionAgentRun['trigger'],
      modelValidated: Boolean(runRow.model_validated),
      version: runRow.engine_version as DecisionAgentRun['version'],
      summary: runRow.summary as DecisionAgentRun['summary'],
      hybrid: {
        status: (runRow.hybrid_status ?? 'SKIPPED_NOT_CONFIGURED') as DecisionAgentRun['hybrid']['status'],
        model: runRow.hybrid_model ? String(runRow.hybrid_model) : null,
        reviewedCount: number(runRow.hybrid_reviewed_count ?? 0),
        inputTokens: runRow.hybrid_input_tokens == null ? null : number(runRow.hybrid_input_tokens),
        outputTokens: runRow.hybrid_output_tokens == null ? null : number(runRow.hybrid_output_tokens),
        errorCode: runRow.hybrid_error_code ? String(runRow.hybrid_error_code) : null,
      },
    } : null,
    signals: signalRows.map(mapSignal),
    paperAccount,
    positions,
    orders: orderResult.rows.map(mapOrder),
    performance,
    riskContext: { totalExposurePct, currentDrawdownPct, highWaterNav, sectorExposure, blockers },
    shadowEvaluation: {
      calendarSource: 'OBSERVED_MARKET_DATES',
      entryRule: 'NEXT_OBSERVED_TRADING_CLOSE',
      cohorts: shadowCohorts,
    },
    theses: thesisResult.rows.map((row) => ({
      id: String(row.id), ticker: String(row.ticker), status: row.status as 'ACTIVE' | 'CLOSED',
      thesis: String(row.thesis), invalidationCriteria: Array.isArray(row.invalidation_criteria) ? row.invalidation_criteria.map(String) : [],
      catalyst: row.catalyst == null ? null : String(row.catalyst),
      reviewAt: new Date(String(row.review_at)).toISOString(), sourceType: 'USER_APPROVED' as const,
      createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(),
    })),
  };
}

export async function getOpenPaperPositionTickers(): Promise<Set<string>> {
  await ensureSharedSchema();
  const { rows } = await pool.query(
    `SELECT ticker FROM decision_agent_paper_positions WHERE account_id = 'internal-paper' AND lots > 0`,
  );
  return new Set(rows.map((row) => String(row.ticker)));
}

export interface DecisionSignalTransition {
  signal: PersistedDecisionSignal;
  previousAction: DecisionAgentSignal['action'];
}

/** Hanya perubahan dari run sebelumnya; run pertama sengaja tidak dianggap alert. */
export async function getDecisionSignalTransitions(runId: string): Promise<DecisionSignalTransition[]> {
  await ensureSharedSchema();
  const { rows } = await pool.query(
    `SELECT current_signal.*, previous.action AS previous_action
       FROM decision_agent_signals current_signal
       JOIN LATERAL (
         SELECT older.action
           FROM decision_agent_signals older
          WHERE older.ticker = current_signal.ticker
            AND older.run_id <> current_signal.run_id
            AND older.created_at < current_signal.created_at
          ORDER BY older.created_at DESC
          LIMIT 1
       ) previous ON true
      WHERE current_signal.run_id = $1
        AND current_signal.action <> previous.action
      ORDER BY current_signal.lens_score DESC, current_signal.ticker`,
    [runId],
  );
  return rows.map((row) => ({
    signal: mapSignal(row),
    previousAction: row.previous_action as DecisionAgentSignal['action'],
  }));
}
