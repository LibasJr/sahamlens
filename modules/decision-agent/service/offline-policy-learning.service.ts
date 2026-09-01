import crypto from 'node:crypto';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { learnOfflinePolicy, type LearningObservation, type OfflineLearningResult } from './offline-policy-learning';

export const OFFLINE_REWARD_VERSION = 'risk-adjusted-t5-t20-v1';

function number(value: unknown): number { return Number(value); }

export async function loadLearningObservations(): Promise<LearningObservation[]> {
  await ensureSharedSchema();
  const result = await pool.query(`
    WITH daily_signals AS (
      SELECT DISTINCT ON (s.ticker,(s.data_as_of AT TIME ZONE 'Asia/Jakarta')::date)
        s.id,s.ticker,s.data_as_of,s.lens_score,s.coverage_pct,s.payload,
        (s.data_as_of AT TIME ZONE 'Asia/Jakarta')::date AS signal_date
      FROM decision_agent_signals s
      WHERE s.action='BUY_CANDIDATE' AND s.paper_readiness='PAPER_READY'
      ORDER BY s.ticker,(s.data_as_of AT TIME ZONE 'Asia/Jakarta')::date,s.created_at
    ), prices AS (
      SELECT signal.*,
        MAX(calendar.price) FILTER (WHERE calendar.horizon_offset=1) AS entry_price,
        MAX(calendar.price) FILTER (WHERE calendar.horizon_offset=5) AS t5_price,
        MAX(calendar.price) FILTER (WHERE calendar.horizon_offset=20) AS t20_price
      FROM daily_signals signal
      CROSS JOIN LATERAL (
        SELECT observed.price,ROW_NUMBER() OVER (ORDER BY observed.date)::int AS horizon_offset
        FROM (
          SELECT history.date,COALESCE(history.adjusted_close_price,history.raw_close_price,history.close_price)::numeric AS price
          FROM lens_radar_history history
          WHERE history.ticker=signal.ticker AND history.date>signal.signal_date
          ORDER BY history.date LIMIT 20
        ) observed
      ) calendar
      GROUP BY signal.id,signal.ticker,signal.data_as_of,signal.lens_score,signal.coverage_pct,signal.payload,signal.signal_date
    )
    SELECT * FROM prices WHERE entry_price>0 AND t5_price IS NOT NULL AND t20_price IS NOT NULL ORDER BY data_as_of,id
  `);
  return result.rows.map((row) => {
    const payload = row.payload as Record<string, unknown>;
    const breakdown = (payload.scoreBreakdown ?? {}) as Record<string, unknown>;
    const risk = (payload.riskSetup ?? {}) as Record<string, unknown>;
    const entry = number(row.entry_price);
    return {
      observedAt: new Date(String(row.data_as_of)).toISOString(), ticker: String(row.ticker),
      lensScore: number(row.lens_score), coveragePct: number(row.coverage_pct),
      riskReward: number(risk.riskReward ?? 0), technicalScore: number(breakdown.technical ?? 0),
      fundamentalScore: number(breakdown.fundamental ?? 0), flowScore: number(breakdown.flow ?? 0),
      t5ReturnPct: (number(row.t5_price) / entry - 1) * 100,
      t20ReturnPct: (number(row.t20_price) / entry - 1) * 100,
    };
  });
}

export async function runOfflinePolicyLearning(): Promise<OfflineLearningResult & { id: string; createdAt: string; rewardVersion: string }> {
  const observations = await loadLearningObservations();
  const learned = learnOfflinePolicy(observations);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await pool.query(`INSERT INTO decision_agent_policy_learning_runs
    (id,status,observation_count,baseline_policy,challenger_policy,train_metrics,validation_metrics,promotion_eligible,blockers,reward_version,created_at)
    VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10,$11)`, [
    id, learned.status, observations.length, JSON.stringify(learned.baseline),
    learned.challenger ? JSON.stringify(learned.challenger) : null,
    JSON.stringify(learned.train), JSON.stringify(learned.validation), learned.promotionEligible,
    JSON.stringify(learned.blockers), OFFLINE_REWARD_VERSION, createdAt,
  ]);
  return { ...learned, id, createdAt, rewardVersion: OFFLINE_REWARD_VERSION };
}

export async function getLatestOfflinePolicyLearning(): Promise<Record<string, unknown> | null> {
  await ensureSharedSchema();
  const row = (await pool.query(`SELECT * FROM decision_agent_policy_learning_runs ORDER BY created_at DESC LIMIT 1`)).rows[0];
  if (!row) return null;
  return {
    id: row.id, status: row.status, observationCount: number(row.observation_count),
    baseline: row.baseline_policy, challenger: row.challenger_policy, train: row.train_metrics,
    validation: row.validation_metrics, promotionEligible: Boolean(row.promotion_eligible),
    blockers: row.blockers, rewardVersion: row.reward_version,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}
