import { randomUUID } from 'node:crypto';
import { pool } from '@/shared/database/postgres.client';
import type { TpclHistoryRange, TpclValidationDashboard } from '../service/tpcl-validation.service';

export type TpclValidationRunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
export interface TpclValidationRun {
  id: string;
  historyRange: TpclHistoryRange;
  status: TpclValidationRunStatus;
  progressPct: number;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  protocolVersion: string | null;
  scoreVersion: string | null;
  parameterFingerprint: string | null;
  datasetFingerprint: string | null;
  result: TpclValidationDashboard | null;
  errorMessage: string | null;
}
function iso(v: unknown): string | null { return v == null ? null : v instanceof Date ? v.toISOString() : String(v); }
function map(row: Record<string, unknown>): TpclValidationRun {
  return {
    id: String(row.id), historyRange: String(row.history_range) as TpclHistoryRange,
    status: String(row.status) as TpclValidationRunStatus, progressPct: Number(row.progress_pct ?? 0),
    requestedAt: iso(row.requested_at) ?? '', startedAt: iso(row.started_at), finishedAt: iso(row.finished_at),
    protocolVersion: row.protocol_version == null ? null : String(row.protocol_version),
    scoreVersion: row.score_version == null ? null : String(row.score_version),
    parameterFingerprint: row.parameter_fingerprint == null ? null : String(row.parameter_fingerprint),
    datasetFingerprint: row.dataset_fingerprint == null ? null : String(row.dataset_fingerprint),
    result: row.result == null ? null : row.result as TpclValidationDashboard,
    errorMessage: row.error_message == null ? null : String(row.error_message),
  };
}
export async function createTpclValidationRun(historyRange: TpclHistoryRange): Promise<TpclValidationRun> {
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO tpcl_validation_runs (id, history_range, status, progress_pct)
     VALUES ($1,$2,'QUEUED',0) RETURNING *`, [id, historyRange]);
  return map(rows[0]);
}

export async function claimNextTpclValidationRun(): Promise<TpclValidationRun | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // A server restart must not leave a run RUNNING forever. A 30-minute lease is
    // deliberately much longer than the expected 1y/3y/5y/10y validation run.
    await client.query(
      `UPDATE tpcl_validation_runs
          SET status='FAILED', progress_pct=100, finished_at=now(),
              error_message=COALESCE(error_message,'Worker lease expired before completion')
        WHERE status='RUNNING' AND started_at < now() - interval '30 minutes'`,
    );
    const { rows } = await client.query(
      `SELECT * FROM tpcl_validation_runs
        WHERE status='QUEUED'
        ORDER BY requested_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
    );
    if (!rows[0]) {
      await client.query('COMMIT');
      return null;
    }
    const id = String(rows[0].id);
    const updated = await client.query(
      `UPDATE tpcl_validation_runs
          SET status='RUNNING', progress_pct=10, started_at=now(), error_message=NULL
        WHERE id=$1
        RETURNING *`,
      [id],
    );
    await client.query('COMMIT');
    return map(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function markTpclValidationRunRunning(id: string): Promise<void> {
  await pool.query(`UPDATE tpcl_validation_runs SET status='RUNNING', progress_pct=10, started_at=now(), error_message=NULL WHERE id=$1`, [id]);
}
export async function completeTpclValidationRun(id: string, dashboard: TpclValidationDashboard, datasetFingerprint: string): Promise<void> {
  await pool.query(
    `UPDATE tpcl_validation_runs SET status='SUCCEEDED', progress_pct=100, finished_at=now(),
      protocol_version=$2, score_version=$3, parameter_fingerprint=$4, dataset_fingerprint=$5,
      result=$6::jsonb, error_message=NULL WHERE id=$1`,
    [id, dashboard.protocolVersion, dashboard.scoreVersion, dashboard.forwardOos.parameterFingerprint, datasetFingerprint, JSON.stringify(dashboard)]);
}
export async function failTpclValidationRun(id: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await pool.query(`UPDATE tpcl_validation_runs SET status='FAILED', progress_pct=100, finished_at=now(), error_message=$2 WHERE id=$1`, [id, message.slice(0, 2000)]);
}
export async function getTpclValidationRun(id: string): Promise<TpclValidationRun | null> {
  const { rows } = await pool.query(`SELECT * FROM tpcl_validation_runs WHERE id=$1 LIMIT 1`, [id]);
  return rows[0] ? map(rows[0]) : null;
}
export async function listRecentTpclValidationRuns(limit=10): Promise<TpclValidationRun[]> {
  const { rows } = await pool.query(`SELECT * FROM tpcl_validation_runs ORDER BY requested_at DESC LIMIT $1`, [Math.max(1, Math.min(limit,100))]);
  return rows.map(map);
}
