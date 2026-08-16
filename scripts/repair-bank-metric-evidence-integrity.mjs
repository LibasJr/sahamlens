#!/usr/bin/env node
/**
 * One-time / repeat-safe repair for active bank metric evidence integrity.
 *
 * Rules:
 * - never edit a reported value in-place;
 * - use superseded_at lineage only;
 * - manual/curated evidence wins over conflicting AUTO_COLLECTED evidence;
 * - if an all-auto group contains conflicting values, supersede every row in
 *   that group (fail closed: metric becomes unavailable rather than guessed);
 * - if curated/manual evidence itself conflicts, do not auto-resolve it;
 * - truly future-dated AUTO_COLLECTED rows (relative to Asia/Jakarta) are
 *   superseded; manual future rows remain BLOCKED for human review.
 */

import dns from 'node:dns';
import net from 'node:net';
import process from 'node:process';

dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);

const confirm = process.argv.includes('--confirm');
for (const arg of process.argv.slice(2)) {
  if (arg !== '--confirm') throw new Error(`Argumen tidak dikenal: ${arg}`);
}

function isAuto(row) {
  return String(row.notes ?? '').startsWith('AUTO_COLLECTED:');
}
function keyOf(row) {
  return [row.ticker, String(row.period_end).slice(0, 10), row.basis, row.metric_key].join('|');
}
function uniqueValues(rows) {
  return [...new Set(rows.map((r) => Number(r.value).toFixed(10)))];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib');
  const pg = await import('pg');
  const Client = pg.Client ?? pg.default?.Client;
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
  await db.connect();
  try {
    const jakarta = await db.query(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date::text AS today`);
    const jakartaToday = String(jakarta.rows[0]?.today ?? '');

    const future = await db.query(`
      SELECT id,ticker,period_end::text,observed_date::text,metric_key,value::float8 value,basis,source_title,source_url,notes
      FROM bank_metric_evidence
      WHERE superseded_at IS NULL
        AND observed_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
      ORDER BY observed_date,ticker,metric_key,id
    `);

    const conflicts = await db.query(`
      SELECT e.id,e.ticker,e.period_end::text,e.observed_date::text,e.metric_key,e.value::float8 value,
             e.unit,e.basis,e.evidence_type,e.source_tier,e.source_title,e.source_url,e.notes,e.evidence_fingerprint
      FROM bank_metric_evidence e
      JOIN (
        SELECT ticker,period_end,basis,metric_key
        FROM bank_metric_evidence
        WHERE superseded_at IS NULL
        GROUP BY ticker,period_end,basis,metric_key
        HAVING COUNT(DISTINCT value) > 1
      ) g
        ON g.ticker=e.ticker AND g.period_end=e.period_end AND g.basis=e.basis AND g.metric_key=e.metric_key
      WHERE e.superseded_at IS NULL
      ORDER BY e.ticker,e.period_end,e.basis,e.metric_key,e.id
    `);

    const groups = new Map();
    for (const row of conflicts.rows) {
      const key = keyOf(row);
      const arr = groups.get(key) ?? [];
      arr.push(row);
      groups.set(key, arr);
    }

    const actions = [];
    const blocked = [];

    for (const row of future.rows) {
      if (isAuto(row)) {
        actions.push({ id: Number(row.id), reason: `AUTO_FUTURE_OBSERVED_DATE_FAIL_CLOSED:${row.observed_date}>${jakartaToday}` });
      } else {
        blocked.push({ type: 'MANUAL_FUTURE_DATE', id: row.id, ticker: row.ticker, metric: row.metric_key, observedDate: row.observed_date });
      }
    }

    for (const [key, rows] of groups.entries()) {
      const manual = rows.filter((r) => !isAuto(r));
      const auto = rows.filter(isAuto);
      const manualValues = uniqueValues(manual);

      if (manualValues.length > 1) {
        blocked.push({ type: 'MANUAL_CONFLICT', key, values: manualValues, ids: manual.map((r) => r.id) });
        continue;
      }

      if (manualValues.length === 1) {
        const canonical = Number(manual[0].value);
        for (const row of auto) {
          if (Math.abs(Number(row.value) - canonical) > 1e-12) {
            actions.push({ id: Number(row.id), reason: `AUTO_CONFLICT_SUPERSEDED_BY_CURATED:${canonical}` });
          }
        }
        continue;
      }

      // No curated evidence exists and official auto sources disagree. Do not
      // pick a winner: remove the whole conflicting group from active evidence.
      for (const row of auto) {
        actions.push({ id: Number(row.id), reason: `AUTO_CONFLICT_FAIL_CLOSED:${uniqueValues(rows).join('/')}` });
      }
    }

    // Deduplicate ids because a pathological row could be both future-dated and conflicting.
    const byId = new Map();
    for (const action of actions) if (!byId.has(action.id)) byId.set(action.id, action);
    const uniqueActions = [...byId.values()];

    console.log('=== BANK METRIC EVIDENCE INTEGRITY REPAIR ===');
    console.log(`Mode                  : ${confirm ? 'CONFIRM' : 'DRY RUN'}`);
    console.log(`Jakarta today         : ${jakartaToday}`);
    console.log(`Future active rows    : ${future.rows.length}`);
    console.log(`Conflicting groups    : ${groups.size}`);
    console.log(`Rows to supersede     : ${uniqueActions.length}`);
    console.log(`Blocked manual issues : ${blocked.length}`);

    for (const item of [...groups.entries()].slice(0, 20)) {
      const [key, rows] = item;
      console.log(`  CONFLICT ${key} values=${uniqueValues(rows).join('/')} rows=${rows.length}`);
    }
    for (const b of blocked) console.log(`  BLOCKED ${JSON.stringify(b)}`);

    if (!confirm) {
      console.log('\nDRY RUN - database tidak diubah. Jalankan lagi dengan --confirm jika daftar aksi sesuai.');
      return;
    }
    if (blocked.length) {
      throw new Error(`Repair diblokir: ada ${blocked.length} manual/curated issue yang tidak boleh di-resolve otomatis.`);
    }

    await db.query('BEGIN');
    try {
      for (const action of uniqueActions) {
        await db.query(`
          UPDATE bank_metric_evidence
             SET superseded_at = now(),
                 superseded_reason = $2,
                 superseded_by_fingerprint = NULL
           WHERE id = $1 AND superseded_at IS NULL
        `, [action.id, action.reason]);
      }
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

    const verify = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE superseded_at IS NULL AND observed_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date)::int AS future_rows,
        (SELECT COUNT(*)::int FROM (
          SELECT ticker,period_end,basis,metric_key
          FROM bank_metric_evidence
          WHERE superseded_at IS NULL
          GROUP BY ticker,period_end,basis,metric_key
          HAVING COUNT(DISTINCT value)>1
        ) x) AS conflict_groups
      FROM bank_metric_evidence
    `);
    console.log(`\nVERIFY future_rows=${verify.rows[0]?.future_rows ?? '?'} conflict_groups=${verify.rows[0]?.conflict_groups ?? '?'}`);
    if (Number(verify.rows[0]?.future_rows ?? 0) !== 0 || Number(verify.rows[0]?.conflict_groups ?? 0) !== 0) {
      throw new Error('Repair selesai tetapi integrity gate masih belum nol. Jangan lanjut scoring/adoption.');
    }
    console.log('PASS - active bank metric evidence kembali fail-closed dan conflict-free.');
  } finally {
    await db.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`BANK-EVIDENCE-REPAIR GAGAL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
