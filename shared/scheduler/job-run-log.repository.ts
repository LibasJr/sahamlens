import { pool } from '../database/postgres.client';

export type JobStatus = 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface JobRunLog {
  id: number;
  job_name: string;
  item_key: string | null;
  status: JobStatus;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  meta: Record<string, unknown> | null;
}

export async function startJobRun(jobName: string, itemKey: string | null = null): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO job_run_log (job_name, item_key, status) VALUES ($1, $2, 'RUNNING') RETURNING id`,
    [jobName, itemKey]
  );
  return rows[0].id;
}

export async function finishJobRun(id: number, status: 'SUCCESS' | 'FAILED', errorMessage?: string, meta?: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE job_run_log SET status = $2, finished_at = now(), error_message = $3, meta = $4 WHERE id = $1`,
    [id, status, errorMessage ?? null, meta ? JSON.stringify(meta) : null]
  );
}

// Dipakai dashboard admin (Scheduler Architecture Fase 4) & alerting - "kapan
// terakhir job ini sukses" adalah sinyal kesehatan scheduler paling dasar.
export async function getLastRun(jobName: string): Promise<JobRunLog | null> {
  const { rows } = await pool.query(
    `SELECT * FROM job_run_log WHERE job_name = $1 ORDER BY started_at DESC LIMIT 1`,
    [jobName]
  );
  return rows[0] || null;
}

// Bungkus satu eksekusi job global (bukan fan-out) dengan pencatatan otomatis -
// pola Cron -> Worker langsung dari Scheduler Architecture bagian 3a.
export async function withJobRunLog<T>(jobName: string, fn: () => Promise<T>): Promise<T> {
  const id = await startJobRun(jobName);
  try {
    const result = await fn();
    await finishJobRun(id, 'SUCCESS');
    return result;
  } catch (err) {
    await finishJobRun(id, 'FAILED', err instanceof Error ? err.message : String(err));
    throw err;
  }
}
