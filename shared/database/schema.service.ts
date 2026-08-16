import { assertDatabaseMigrated } from './migration-guard';

/**
 * Compatibility facade retained for existing repositories.
 *
 * IMPORTANT: runtime DDL was intentionally removed. Schema ownership now belongs
 * exclusively to numbered SQL migrations under database/migrations/. This keeps
 * production boot/read requests deterministic and makes every schema change
 * reviewable, checksum-protected, and auditable.
 */
export function ensureSharedSchema(): Promise<void> {
  return assertDatabaseMigrated();
}
