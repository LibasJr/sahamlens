import { pool } from './postgres.client';

const REQUIRED_MIGRATIONS = [
  '000_runtime_schema_baseline.sql',
  '001_production_hardening.sql',
] as const;

let migrationReady: Promise<void> | null = null;

/**
 * Runtime code must never mutate the production schema implicitly.
 * Every repository that depends on application tables calls this cached guard;
 * schema changes are owned exclusively by scripts/migrate-database.mjs.
 */
export function assertDatabaseMigrated(): Promise<void> {
  if (!migrationReady) {
    migrationReady = pool
      .query<{ migration: string }>(
        `SELECT migration
           FROM schema_migrations
          WHERE migration = ANY($1::text[])`,
        [REQUIRED_MIGRATIONS],
      )
      .then(({ rows }) => {
        const applied = new Set(rows.map((row) => row.migration));
        const missing = REQUIRED_MIGRATIONS.filter((name) => !applied.has(name));
        if (missing.length > 0) {
          throw new Error(
            `Database migration belum lengkap: ${missing.join(', ')}. ` +
              'Jalankan `npm run db:migrate` sebelum menyalakan aplikasi.',
          );
        }
      })
      .catch((error) => {
        migrationReady = null;
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('Database migration belum lengkap')) throw error;
        throw new Error(
          'Database belum memiliki migration baseline SahamLens. ' +
            'Jalankan `npm run db:migrate` sebelum menyalakan aplikasi.',
          { cause: error },
        );
      });
  }
  return migrationReady;
}

/** Test-only: force the next guard call to query the migration table again. */
export function resetDatabaseMigrationGuardForTests(): void {
  migrationReady = null;
}
