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
  PaperPosition,
  PersistedDecisionSignal,
} from '../types/decision-agent.types';

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
            SET last_price = $3, updated_at = $4
          WHERE account_id = $1 AND ticker = $2 AND lots > 0`,
        ['internal-paper', signal.ticker, signal.price, createdAt],
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
    status: row.status as PaperOrder['status'],
    rationale: String(row.rationale),
    proposedAt: new Date(String(row.proposed_at)).toISOString(),
    executedAt: row.executed_at ? new Date(String(row.executed_at)).toISOString() : null,
  };
}

export async function getDecisionAgentDashboard(): Promise<DecisionAgentDashboard> {
  await ensureSharedSchema();
  const [runResult, accountResult, positionResult, orderResult] = await Promise.all([
    pool.query(`SELECT * FROM decision_agent_runs ORDER BY created_at DESC LIMIT 1`),
    pool.query(`SELECT * FROM decision_agent_paper_accounts WHERE id = 'internal-paper'`),
    pool.query(`SELECT * FROM decision_agent_paper_positions WHERE account_id = 'internal-paper' AND lots > 0 ORDER BY ticker`),
    pool.query(`SELECT * FROM decision_agent_orders ORDER BY proposed_at DESC LIMIT 50`),
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
    enabled: Boolean(accountRow.enabled),
  } : null;

  const positions: PaperPosition[] = positionResult.rows.map((row) => ({
    ticker: String(row.ticker),
    lots: number(row.lots),
    avgPrice: number(row.avg_price),
    lastPrice: number(row.last_price),
  }));

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
