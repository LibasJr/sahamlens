/**
 * SQL telemetri kesehatan sumber data - dipisah dari service-nya supaya bisa diuji
 * tanpa koneksi database.
 *
 * Sejarah bug (2026-09-25): versi lama mengirim 7 parameter sementara SQL-nya hanya
 * memakai $1 dan $3..$7. Postgres menolak dengan 42P18 "could not determine data type
 * of parameter $2", dan karena catch di service-nya kosong, SELURUH penulisan
 * data_source_health berhenti tanpa satu pun tanda (tabel membeku sejak 25 Agu 2026).
 */

export const DOWN_AFTER_CONSECUTIVE_FAILURES = 3;

export interface HealthUpsertInput {
  sourceId: string;
  ok: boolean;
  latencyMs?: number | null;
  dataObservedAt?: string | null;
  detail?: Record<string, unknown>;
}

export interface HealthUpsert {
  text: string;
  values: unknown[];
}

/**
 * Bangun upsert telemetri. Nomor placeholder WAJIB berurutan dan semuanya terpakai -
 * uji regresi memeriksa itu, karena satu placeholder tak terpakai cukup untuk
 * mematikan seluruh telemetri secara senyap.
 */
export function buildHealthUpsert(input: HealthUpsertInput): HealthUpsert {
  const text = `INSERT INTO data_source_health
       (source_id,status,last_success_at,last_failure_at,last_latency_ms,consecutive_failures,data_observed_at,detail,updated_at)
       VALUES(
         $1,
         CASE WHEN $2 THEN 'HEALTHY' ELSE 'DEGRADED' END,
         CASE WHEN $2 THEN now() END,
         CASE WHEN NOT $2 THEN now() END,
         $3,
         CASE WHEN $2 THEN 0 ELSE 1 END,
         $4,
         $5::jsonb,
         now()
       )
       ON CONFLICT(source_id) DO UPDATE SET
         status=CASE
           WHEN $2 THEN 'HEALTHY'
           WHEN data_source_health.consecutive_failures + 1 >= $6 THEN 'DOWN'
           ELSE 'DEGRADED'
         END,
         last_success_at=CASE WHEN $2 THEN now() ELSE data_source_health.last_success_at END,
         last_failure_at=CASE WHEN NOT $2 THEN now() ELSE data_source_health.last_failure_at END,
         last_latency_ms=EXCLUDED.last_latency_ms,
         consecutive_failures=CASE WHEN $2 THEN 0 ELSE data_source_health.consecutive_failures + 1 END,
         data_observed_at=COALESCE(EXCLUDED.data_observed_at,data_source_health.data_observed_at),
         detail=EXCLUDED.detail,
         updated_at=now()`;

  const values: unknown[] = [
    input.sourceId,
    input.ok,
    input.latencyMs ?? null,
    input.dataObservedAt ?? null,
    JSON.stringify(input.detail ?? {}),
    DOWN_AFTER_CONSECUTIVE_FAILURES,
  ];

  return { text, values };
}