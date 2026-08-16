import pg from 'pg';

let pass = 0;
let warn = 0;
let fail = 0;
const out = (kind, msg) => { console.log(`${kind.padEnd(5)} ${msg}`); if (kind === 'PASS') pass += 1; else if (kind === 'WARN') warn += 1; else fail += 1; };

if (!process.env.DATABASE_URL) {
  out('FAIL', 'DATABASE_URL tidak tersedia');
  console.log(`Summary: ${pass} pass, ${warn} warn, ${fail} fail`);
  process.exit(1);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
try {
  await db.connect();
  const tables = await db.query(`SELECT to_regclass('public.market_data_reconciliation_runs')::text AS runs, to_regclass('public.market_close_reconciliation')::text AS rows`);
  if (!tables.rows[0]?.runs || !tables.rows[0]?.rows) {
    out('FAIL', 'schema D-1 belum ada; jalankan migration 007_market_data_reconciliation.sql');
  } else {
    out('PASS', 'schema market data reconciliation tersedia');
    const latest = await db.query(`
      SELECT trade_date::text,status,universe_count,compared_count,match_count,mismatch_count,
             primary_only_count,secondary_only_count,no_data_count,started_at,finished_at
      FROM market_data_reconciliation_runs
      ORDER BY started_at DESC
      LIMIT 1
    `);
    if (!latest.rows.length) {
      out('WARN', 'reconciliation belum pernah dijalankan');
    } else {
      const r = latest.rows[0];
      const universe = Number(r.universe_count ?? 0);
      const compared = Number(r.compared_count ?? 0);
      const matches = Number(r.match_count ?? 0);
      const mismatches = Number(r.mismatch_count ?? 0);
      const gaps = Number(r.primary_only_count ?? 0) + Number(r.secondary_only_count ?? 0) + Number(r.no_data_count ?? 0);
      const coverage = universe > 0 ? compared / universe : 0;
      out(compared > 0 ? 'PASS' : 'WARN', `latest ${r.trade_date ?? '-'}: ${matches}/${compared} exact match; coverage ${(coverage * 100).toFixed(2)}% dari ${universe}`);
      out(mismatches === 0 ? 'PASS' : 'WARN', mismatches === 0 ? 'tidak ada mismatch pada run terbaru' : `${mismatches} ticker mismatch — harus tetap under review`);
      out(gaps === 0 ? 'PASS' : 'WARN', gaps === 0 ? 'tidak ada gap sumber pada run terbaru' : `${gaps} gap sumber — tidak dihitung sebagai match`);
    }
  }
} catch (error) {
  out('FAIL', error instanceof Error ? error.message : String(error));
} finally {
  await db.end().catch(() => {});
}

console.log(`Summary: ${pass} pass, ${warn} warn, ${fail} fail`);
if (fail) process.exitCode = 1;
