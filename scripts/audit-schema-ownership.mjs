#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const sourceRoots = ['app', 'modules', 'shared'];
const offenders = [];

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

for (const root of sourceRoots) {
  const dir = path.join(ROOT, root);
  for (const file of await walk(dir)) {
    const text = await fs.readFile(file, 'utf8');
    if (/\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i.test(text) || /\bALTER\s+TABLE\b/i.test(text)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
}

const migration = await fs.readFile(path.join(ROOT, 'database/migrations/000_runtime_schema_baseline.sql'), 'utf8');
const destructive = [];
for (const pattern of [
  /\bDELETE\s+FROM\b/i,
  /\bTRUNCATE\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bUPDATE\s+users\b/i,
]) if (pattern.test(migration)) destructive.push(String(pattern));

if (offenders.length || destructive.length) {
  console.error('SCHEMA OWNERSHIP AUDIT: FAIL');
  for (const file of offenders) console.error(`Runtime DDL ditemukan: ${file}`);
  for (const pattern of destructive) console.error(`Baseline migration mengandung mutasi data/destruktif: ${pattern}`);
  process.exit(1);
}

console.log('SCHEMA OWNERSHIP AUDIT: PASS');
console.log('Runtime app/modules/shared bebas CREATE TABLE/ALTER TABLE; numbered migration menjadi source of truth.');
