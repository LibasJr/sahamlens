import { pool } from '../database/postgres.client';
import { ensureSharedSchema } from '../database/schema.service';

// SKIPPED & REJECTED ditambahkan 2026-08-11. Sebelumnya cron yang berhenti SEBELUM
// withJobRunLog - karena di luar jam bursa, atau karena signature QStash ditolak - tidak
// meninggalkan jejak apa pun. Akibatnya tiga keadaan yang butuh tindakan sangat berbeda
// terlihat identik di database: job tidak pernah dipanggil, dipanggil lalu dilewati, dan
// dipanggil lalu ditolak. Itulah yang membuat "sudah 4 hari tapi lens_radar_history masih
// kosong" tidak bisa didiagnosis sama sekali.
//
// Kolom `status` di skema bertipe TEXT tanpa CHECK constraint, jadi nilai baru ini tidak
// butuh migrasi apa pun.
export type JobStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'REJECTED';

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
  await ensureSharedSchema();
  const { rows } = await pool.query(
    `INSERT INTO job_run_log (job_name, item_key, status) VALUES ($1, $2, 'RUNNING') RETURNING id`,
    [jobName, itemKey]
  );
  return rows[0].id;
}

export async function finishJobRun(id: number, status: 'SUCCESS' | 'FAILED', errorMessage?: string, meta?: Record<string, unknown>): Promise<void> {
  await ensureSharedSchema();
  await pool.query(
    `UPDATE job_run_log SET status = $2, finished_at = now(), error_message = $3, meta = $4 WHERE id = $1`,
    [id, status, errorMessage ?? null, meta ? JSON.stringify(meta) : null]
  );
}

// Dipakai dashboard admin (Scheduler Architecture Fase 4) & alerting - "kapan
// terakhir job ini sukses" adalah sinyal kesehatan scheduler paling dasar.
export async function getLastRun(jobName: string): Promise<JobRunLog | null> {
  await ensureSharedSchema();
  const { rows } = await pool.query(
    `SELECT * FROM job_run_log WHERE job_name = $1 ORDER BY started_at DESC LIMIT 1`,
    [jobName]
  );
  return rows[0] || null;
}

/** Catat satu pemanggilan yang BERHENTI sebelum pekerjaan dimulai. Fail-safe: kegagalan
 * mencatat tidak boleh menggagalkan/menahan cron itu sendiri - pencatatan ini alat
 * diagnosis, bukan bagian dari pekerjaannya. */
export async function recordJobNonRun(
  jobName: string,
  status: 'SKIPPED' | 'REJECTED',
  reason: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await ensureSharedSchema();
    await pool.query(
      `INSERT INTO job_run_log (job_name, status, started_at, finished_at, error_message, meta)
       VALUES ($1, $2, now(), now(), $3, $4)`,
      [jobName, status, reason, meta ? JSON.stringify(meta) : null]
    );
  } catch {
    // sengaja diabaikan
  }
}

/** Satu baris ringkasan per job: eksekusi TERAKHIR apa pun statusnya, plus kapan terakhir
 * benar-benar SUKSES. Keduanya diperlukan - job yang tiap 15 menit dijawab SKIPPED terlihat
 * "aktif" kalau hanya baris terakhir yang dilihat, padahal sudah berhari-hari tidak bekerja. */
export interface JobRunOverviewRow {
  job_name: string;
  last_status: JobStatus;
  last_started_at: string;
  last_error_message: string | null;
  last_meta: Record<string, unknown> | null;
  last_success_at: string | null;
  runs_24h: number;
  failures_24h: number;
}

export async function getJobRunOverview(): Promise<JobRunOverviewRow[]> {
  await ensureSharedSchema();
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (job_name)
       job_name,
       status       AS last_status,
       started_at   AS last_started_at,
       error_message AS last_error_message,
       meta         AS last_meta,
       (SELECT max(started_at) FROM job_run_log s
          WHERE s.job_name = j.job_name AND s.status = 'SUCCESS')            AS last_success_at,
       (SELECT count(*) FROM job_run_log r
          WHERE r.job_name = j.job_name AND r.started_at > now() - interval '24 hours') AS runs_24h,
       (SELECT count(*) FROM job_run_log f
          WHERE f.job_name = j.job_name AND f.status = 'FAILED'
            AND f.started_at > now() - interval '24 hours')                  AS failures_24h
     FROM job_run_log j
     ORDER BY job_name, started_at DESC`
  );
  return rows;
}

// Bungkus satu eksekusi job global (bukan fan-out) dengan pencatatan otomatis -
// pola Cron -> Worker langsung dari Scheduler Architecture bagian 3a.
export async function withJobRunLog<T>(jobName: string, fn: () => Promise<T>): Promise<T> {
  const id = await startJobRun(jobName);
  try {
    const result = await fn();
    // Hasil job disimpan sebagai meta. Sebelumnya finishJobRun dipanggil TANPA meta, jadi
    // angka yang justru paling menentukan - mis. `archived: 0` dari ai-pick-scan - hilang.
    // Run yang "SUCCESS" tapi tidak menyimpan satu baris pun jadi tak terbedakan dari run
    // yang bekerja normal.
    const meta = result && typeof result === 'object' && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : undefined;
    await finishJobRun(id, 'SUCCESS', undefined, meta);
    return result;
  } catch (err) {
    await finishJobRun(id, 'FAILED', err instanceof Error ? err.message : String(err));
    throw err;
  }
}
