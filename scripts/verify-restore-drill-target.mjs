import pg from 'pg';
const { Client } = pg;

function dbFingerprint(urlText) {
  const u = new URL(urlText);
  return `${u.hostname}:${u.port || '5432'}/${u.pathname.replace(/^\//, '')}`;
}

const productionUrl = process.env.DATABASE_URL;
const restoreUrl = process.env.RESTORE_DRILL_DATABASE_URL;
if (!productionUrl || !restoreUrl) {
  console.error('FAIL: DATABASE_URL dan RESTORE_DRILL_DATABASE_URL wajib tersedia.');
  process.exit(1);
}
if (dbFingerprint(productionUrl) === dbFingerprint(restoreUrl)) {
  console.error('FAIL-CLOSED: target restore sama dengan database production. DILARANG menjalankan drill.');
  process.exit(1);
}

const critical = ['users','portfolios','holdings','transactions','watchlists','lens_radar_history','fundamental_history','ownership_flow_history','job_run_log'];
const client = new Client({ connectionString: restoreUrl, connectionTimeoutMillis: 15000 });
try {
  await client.connect();
  console.log(`PASS target restore terisolasi: ${dbFingerprint(restoreUrl)}`);
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [critical],
  );
  const found = new Set(tables.map((r) => r.table_name));
  let fail = 0;
  for (const table of critical) {
    if (!found.has(table)) { console.error(`FAIL tabel kritis tidak ada: ${table}`); fail++; continue; }
    const { rows } = await client.query(`SELECT COUNT(*)::bigint AS count FROM "${table}"`);
    console.log(`PASS ${table}: ${rows[0].count} row`);
  }
  const migrations = await client.query('SELECT version, applied_at FROM schema_migrations ORDER BY version');
  console.log(`PASS schema_migrations: ${migrations.rowCount} migration tercatat`);
  if (found.has('ownership_flow_history')) {
    const snap = await client.query('SELECT MAX(observed_date)::text AS latest, COUNT(DISTINCT observed_date)::int AS snapshots FROM ownership_flow_history');
    console.log(`PASS ownership flow restore: latest=${snap.rows[0].latest ?? '-'}, snapshots=${snap.rows[0].snapshots ?? 0}`);
  }
  if (fail) process.exitCode = 1;
  else console.log('RESTORE TARGET VERIFY: PASS. Catat RPO/RTO aktual di evidence drill sebelum target dihapus.');
} catch (error) {
  console.error('RESTORE TARGET VERIFY: FAIL', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
