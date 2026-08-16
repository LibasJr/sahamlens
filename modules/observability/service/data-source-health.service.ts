import { pool } from '@/shared/database/postgres.client';

export type DataSourceHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
export interface DataSourceHealthRow {
  sourceId: string;
  status: DataSourceHealthStatus;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastLatencyMs: number | null;
  consecutiveFailures: number;
  dataObservedAt: string | null;
  detail: Record<string, unknown>;
  updatedAt: string;
}

const DOWN_AFTER_CONSECUTIVE_FAILURES = 3;
const globalState = globalThis as unknown as { __sourceHealthWriteAt?: Map<string, number> };
const lastWrite = globalState.__sourceHealthWriteAt ?? (globalState.__sourceHealthWriteAt = new Map());

function iso(value: unknown): string | null {
  return value == null ? null : value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Best-effort operational telemetry. One failure is DEGRADED; only repeated failures
 * become DOWN. Health logging itself must never break market/auth functionality.
 */
export async function recordDataSourceHealth(input: {
  sourceId: string;
  ok: boolean;
  latencyMs?: number | null;
  dataObservedAt?: string | null;
  detail?: Record<string, unknown>;
  force?: boolean;
}): Promise<void> {
  const key = `${input.sourceId}:${input.ok ? 'ok' : 'fail'}`;
  const now = Date.now();
  if (!input.force && now - (lastWrite.get(key) ?? 0) < 5 * 60_000) return;
  lastWrite.set(key, now);

  try {
    await pool.query(
      `INSERT INTO data_source_health
       (source_id,status,last_success_at,last_failure_at,last_latency_ms,consecutive_failures,data_observed_at,detail,updated_at)
       VALUES(
         $1,
         CASE WHEN $3 THEN 'HEALTHY' ELSE 'DEGRADED' END,
         CASE WHEN $3 THEN now() END,
         CASE WHEN NOT $3 THEN now() END,
         $4,
         CASE WHEN $3 THEN 0 ELSE 1 END,
         $5,
         $6::jsonb,
         now()
       )
       ON CONFLICT(source_id) DO UPDATE SET
         status=CASE
           WHEN $3 THEN 'HEALTHY'
           WHEN data_source_health.consecutive_failures + 1 >= $7 THEN 'DOWN'
           ELSE 'DEGRADED'
         END,
         last_success_at=CASE WHEN $3 THEN now() ELSE data_source_health.last_success_at END,
         last_failure_at=CASE WHEN NOT $3 THEN now() ELSE data_source_health.last_failure_at END,
         last_latency_ms=EXCLUDED.last_latency_ms,
         consecutive_failures=CASE WHEN $3 THEN 0 ELSE data_source_health.consecutive_failures + 1 END,
         data_observed_at=COALESCE(EXCLUDED.data_observed_at,data_source_health.data_observed_at),
         detail=EXCLUDED.detail,
         updated_at=now()`,
      [
        input.sourceId,
        input.ok ? 'HEALTHY' : 'DEGRADED',
        input.ok,
        input.latencyMs ?? null,
        input.dataObservedAt ?? null,
        JSON.stringify(input.detail ?? {}),
        DOWN_AFTER_CONSECUTIVE_FAILURES,
      ],
    );
  } catch {
    // Migration/DB health logging is observability, not a dependency of the operation.
  }
}

export async function listDataSourceHealth(): Promise<DataSourceHealthRow[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM data_source_health ORDER BY source_id');
    return rows.map((row: Record<string, unknown>) => ({
      sourceId: String(row.source_id),
      status: String(row.status) as DataSourceHealthStatus,
      lastSuccessAt: iso(row.last_success_at),
      lastFailureAt: iso(row.last_failure_at),
      lastLatencyMs: row.last_latency_ms == null ? null : Number(row.last_latency_ms),
      consecutiveFailures: Number(row.consecutive_failures ?? 0),
      dataObservedAt: iso(row.data_observed_at),
      detail: (row.detail ?? {}) as Record<string, unknown>,
      updatedAt: iso(row.updated_at) ?? '',
    }));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '42P01') return [];
    throw error;
  }
}
