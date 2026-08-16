#!/usr/bin/env node
import dns from 'node:dns';
import net from 'node:net';
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
import fs from 'node:fs/promises';

const VALID_KEYS = new Set([
  'RISK_FREE_RATE_PCT',
  'EQUITY_RISK_PREMIUM_PCT',
  'MAX_PERPETUAL_GROWTH_PCT',
  'BI_RATE_PCT',
  'INFLATION_TARGET_MID_PCT',
  'INFLATION_TARGET_UPPER_PCT',
]);
const EVIDENCE_TYPES = new Set(['MARKET_OBSERVATION','RESEARCH_ESTIMATE','POLICY_TARGET','POLICY_RATE','MODEL_POLICY']);
const SOURCE_TIERS = new Set(['GOVERNMENT_OFFICIAL','ACADEMIC_RESEARCH','INTERNAL_MODEL_POLICY']);

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const confirm = process.argv.includes('--confirm');
const file = arg('--file');
if (!file) {
  console.error('Usage: node scripts/import-macro-assumptions.mjs --file macro-evidence.csv [--confirm]');
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
function dateKey(value, name, nullable = false) {
  if (nullable && !value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new Error(`${name} wajib YYYY-MM-DD`);
  return value;
}
function assertValueGuardrail(key, value, lineNo) {
  if (value < 0 || value > 30) throw new Error(`${key} di luar guardrail 0..30 pada line ${lineNo}`);
  if (key === 'EQUITY_RISK_PREMIUM_PCT' && value <= 0) throw new Error(`ERP wajib >0 pada line ${lineNo}`);
  if (key === 'MAX_PERPETUAL_GROWTH_PCT' && value > 15) throw new Error(`growth cap >15% pada line ${lineNo}`);
}

const raw = await fs.readFile(file, 'utf8');
const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter((x) => x.trim() && !x.trimStart().startsWith('#'));
if (lines.length < 2) throw new Error('CSV kosong');
const headers = csvLine(lines[0]).map((x) => x.toLowerCase());
const required = [
  'input_key','value_pct','market_date','observed_date','usable_from_date',
  'evidence_type','source_tier','source_name','source_url','methodology',
];
for (const key of required) if (!headers.includes(key)) throw new Error(`Kolom wajib hilang: ${key}`);
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

const rows = lines.slice(1).map((line, zeroLineNo) => {
  const lineNo = zeroLineNo + 2;
  const c = csvLine(line);
  const inputKey = c[idx.input_key]?.trim().toUpperCase();
  if (!VALID_KEYS.has(inputKey)) throw new Error(`input_key tidak dikenal line ${lineNo}: ${inputKey}`);
  const valuePct = n(c[idx.value_pct], `value_pct line ${lineNo}`);
  assertValueGuardrail(inputKey, valuePct, lineNo);
  const marketDate = dateKey(c[idx.market_date], `market_date line ${lineNo}`, true);
  const observedDate = dateKey(c[idx.observed_date], `observed_date line ${lineNo}`);
  const usableFromDate = dateKey(c[idx.usable_from_date], `usable_from_date line ${lineNo}`);
  if (marketDate && marketDate > observedDate) throw new Error(`market_date > observed_date line ${lineNo}`);
  if (observedDate > usableFromDate) throw new Error(`observed_date > usable_from_date line ${lineNo}`);

  const evidenceType = c[idx.evidence_type]?.trim().toUpperCase();
  const sourceTier = c[idx.source_tier]?.trim().toUpperCase();
  if (!EVIDENCE_TYPES.has(evidenceType)) throw new Error(`evidence_type tidak dikenal line ${lineNo}`);
  if (!SOURCE_TIERS.has(sourceTier)) throw new Error(`source_tier tidak dikenal line ${lineNo}`);
  if (evidenceType === 'MODEL_POLICY' && sourceTier !== 'INTERNAL_MODEL_POLICY') {
    throw new Error(`MODEL_POLICY wajib INTERNAL_MODEL_POLICY line ${lineNo}`);
  }
  if (evidenceType !== 'MODEL_POLICY' && sourceTier === 'INTERNAL_MODEL_POLICY') {
    throw new Error(`INTERNAL_MODEL_POLICY hanya boleh MODEL_POLICY line ${lineNo}`);
  }

  const sourceName = c[idx.source_name]?.trim();
  if (!sourceName) throw new Error(`source_name kosong line ${lineNo}`);
  const sourceUrl = c[idx.source_url]?.trim() || null;
  if (sourceTier !== 'INTERNAL_MODEL_POLICY' && (!sourceUrl || !/^https:\/\//i.test(sourceUrl))) {
    throw new Error(`source_url HTTPS wajib untuk sumber eksternal line ${lineNo}`);
  }
  const methodology = c[idx.methodology]?.trim();
  if (!methodology) throw new Error(`methodology kosong line ${lineNo}`);
  const notes = idx.notes == null ? null : c[idx.notes]?.trim() || null;

  return { inputKey, valuePct, marketDate, observedDate, usableFromDate, evidenceType, sourceTier, sourceName, sourceUrl, methodology, notes };
});

const duplicateKeys = new Set();
for (const r of rows) {
  const fingerprint = `${r.inputKey}|${r.usableFromDate}|${r.sourceName}`;
  if (duplicateKeys.has(fingerprint)) throw new Error(`Duplikat evidence dalam file: ${fingerprint}`);
  duplicateKeys.add(fingerprint);
}

console.log('\n=== MACRO PIT COMPONENT EVIDENCE ===');
console.table(rows.map((r) => ({
  input: r.inputKey,
  value_pct: r.valuePct,
  market: r.marketDate ?? '-',
  observed: r.observedDate,
  usable_from: r.usableFromDate,
  type: r.evidenceType,
  tier: r.sourceTier,
  source: r.sourceName,
})));
console.log(`Valid rows: ${rows.length}. Mode: ${confirm ? 'CONFIRM' : 'DRY RUN'}`);
console.log('Catatan: import evidence TIDAK mengubah MACRO_ASSUMPTIONS production.');
if (!confirm) process.exit(0);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tidak tersedia');

const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  let inserted = 0;
  let existing = 0;
  for (const r of rows) {
    const result = await client.query(
      `INSERT INTO macro_input_evidence
       (input_key, value_pct, market_date, observed_date, usable_from_date,
        evidence_type, source_tier, source_name, source_url, methodology, notes)
       VALUES ($1,$2,$3::date,$4::date,$5::date,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (input_key, usable_from_date, source_name) DO NOTHING`,
      [r.inputKey,r.valuePct,r.marketDate,r.observedDate,r.usableFromDate,r.evidenceType,r.sourceTier,r.sourceName,r.sourceUrl,r.methodology,r.notes],
    );
    if ((result.rowCount ?? 0) === 1) inserted += 1; else existing += 1;
  }
  await client.query('COMMIT');
  console.log(`Macro PIT evidence: ${inserted} baru, ${existing} sudah ada.`);
  console.log('Production model tetap FROZEN_BY_MODEL_VERSION; tidak ada fair value yang berubah dari import ini.');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  await client.end();
}
