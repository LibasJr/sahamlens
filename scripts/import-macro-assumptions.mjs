#!/usr/bin/env node
import dns from 'node:dns';
import net from 'node:net';
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
import fs from 'node:fs/promises';
import pg from 'pg';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const confirm = process.argv.includes('--confirm');
const file = arg('--file');
if (!file) {
  console.error('Usage: node scripts/import-macro-assumptions.mjs --file macro.csv [--confirm]');
  process.exit(2);
}

function csvLine(line) {
  const out = []; let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') { cur += '"'; i += 1; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function n(value, name) {
  const x = Number(value);
  if (!Number.isFinite(x)) throw new Error(`${name} wajib angka: ${value}`);
  return x;
}
function dateKey(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new Error(`${name} wajib YYYY-MM-DD`);
  return value;
}

const raw = await fs.readFile(file, 'utf8');
const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter((x) => x.trim());
if (lines.length < 2) throw new Error('CSV kosong');
const headers = csvLine(lines[0]).map((x) => x.toLowerCase());
const required = ['effective_date','observed_date','risk_free_rate_pct','equity_risk_premium_pct','max_perpetual_growth_pct','source','source_url'];
for (const key of required) if (!headers.includes(key)) throw new Error(`Kolom wajib hilang: ${key}`);
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
const rows = lines.slice(1).map((line, lineNo) => {
  const c = csvLine(line);
  const effectiveDate = dateKey(c[idx.effective_date], `effective_date line ${lineNo + 2}`);
  const observedDate = dateKey(c[idx.observed_date], `observed_date line ${lineNo + 2}`);
  if (observedDate > effectiveDate) throw new Error(`observed_date > effective_date line ${lineNo + 2}`);
  const riskFree = n(c[idx.risk_free_rate_pct], 'risk_free_rate_pct');
  const erp = n(c[idx.equity_risk_premium_pct], 'equity_risk_premium_pct');
  const maxGrowth = n(c[idx.max_perpetual_growth_pct], 'max_perpetual_growth_pct');
  if (riskFree < 0 || riskFree > 30 || erp <= 0 || erp > 30 || maxGrowth < 0 || maxGrowth > 15) {
    throw new Error(`Macro assumption di luar guardrail pada line ${lineNo + 2}`);
  }
  const source = c[idx.source]?.trim();
  if (!source) throw new Error(`source kosong line ${lineNo + 2}`);
  const sourceUrl = c[idx.source_url]?.trim() || null;
  if (!sourceUrl || !/^https:\/\//i.test(sourceUrl)) throw new Error(`source_url HTTPS wajib line ${lineNo + 2}`);
  return { effectiveDate, observedDate, riskFree, erp, maxGrowth, source, sourceUrl, notes: idx.notes == null ? null : c[idx.notes]?.trim() || null };
});
console.table(rows);
console.log(`Valid rows: ${rows.length}. Mode: ${confirm ? 'CONFIRM' : 'DRY RUN'}`);
if (!confirm) process.exit(0);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tidak tersedia');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  let inserted = 0;
  let existing = 0;
  for (const r of rows) {
    const result = await client.query(
      `INSERT INTO macro_assumption_history
       (effective_date, observed_date, risk_free_rate_pct, equity_risk_premium_pct,
        max_perpetual_growth_pct, source, source_url, notes)
       VALUES ($1::date,$2::date,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (effective_date, source) DO NOTHING`,
      [r.effectiveDate,r.observedDate,r.riskFree,r.erp,r.maxGrowth,r.source,r.sourceUrl,r.notes],
    );
    if ((result.rowCount ?? 0) === 1) inserted += 1; else existing += 1;
  }
  await client.query('COMMIT');
  console.log(`Macro evidence: ${inserted} baru, ${existing} sudah ada. Existing evidence tidak ditimpa. Production model constants tetap frozen sampai adopsi model-version eksplisit.`);
} catch (e) {
  await client.query('ROLLBACK'); throw e;
} finally { await client.end(); }
