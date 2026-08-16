import {
  assertDatabaseMigrated,
  resetDatabaseMigrationGuardForTests,
} from '@/shared/database/migration-guard';

/**
 * Intraday tables are migration-owned. Kept as a compatibility facade so callers
 * do not need to change, but this function performs NO CREATE/ALTER at runtime.
 */
export function ensureIntradaySchema(): Promise<void> {
  return assertDatabaseMigrated();
}

/** Test-only compatibility helper. */
export function resetIntradaySchemaCacheForTests(): void {
  resetDatabaseMigrationGuardForTests();
}
