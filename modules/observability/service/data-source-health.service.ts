import { pool } from '@/shared/database/postgres.client';
import { logger } from '@/shared/logger/logger';
import { buildHealthUpsert } from './data-source-health.sql';

export { DOWN_AFTER_CONSECUTIVE_FAILURES } from './data-source-health.sql';

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

  const { text, values } = buildHealthUpsert(input);
  try {
    await pool.query(text, values);
  } catch (error) {
    // Telemetri tidak boleh menghentikan operasi, tetapi juga TIDAK BOLEH senyap:
    // bug 2026-09-25 (parameter $2 tak dipakai -> Postgres 42P18) membuat tabel
    // data_source_health berhenti terisi berbulan-bulan tanpa satu pun tanda.
    logger.warn('data_source_health gagal ditulis', {
      sourceId: input.sourceId,
      ok: input.ok,
      code: (error as { code?: string } | null)?.code ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
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
