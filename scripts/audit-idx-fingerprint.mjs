#!/usr/bin/env node
// Penjaga fingerprint IDX.
//
// Insiden 2026-09-24/25: seluruh skrip IDX memakai fingerprint curl_cffi yang sama persis
// ("chrome124"). Cloudflare berhenti menerimanya -> HTTP 403 di semua endpoint IDX ->
// pipeline berhenti (foreign flow, UMA, suspension, broker summary) tanpa alarm, karena job
// mengembalikan nilai alih-alih melempar.
//
// Aturan yang dijaga berkas ini:
//   1. Tidak ada skrip yang boleh mengunci satu fingerprint browser (harus lewat
//      build_session() dari scripts/idx_session.py yang menguji beberapa kandidat).
//   2. Rantai kandidat harus punya minimal dua fingerprint, supaya satu fingerprint yang
//      ditolak Cloudflare tidak mematikan seluruh pipeline.
import fs from 'node:fs';
import path from 'node:path';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');
const HELPER = 'idx_session.py';
const ALLOWED_HARDCODE = new Set([HELPER]);

/** Buang docstring dan komentar supaya catatan sejarah di kepala berkas tidak dianggap kode. */
function codeLines(body) {
  const result = [];
  let blockQuote = null;
  body.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (blockQuote) {
      const close = line.indexOf(blockQuote);
      if (close !== -1) {
        blockQuote = null;
        const rest = line.slice(close + 3).trim();
        if (rest && !rest.startsWith('#')) result.push([index + 1, rest]);
      }
      return;
    }
    const openMatch = trimmed.match(/^[ru]?("""|''')/);
    if (openMatch) {
      const closer = openMatch[1];
      if (trimmed.length > openMatch[0].length && trimmed.includes(closer, openMatch[0].length)) return; // docstring satu baris
      blockQuote = closer;
      return;
    }
    if (!trimmed || trimmed.startsWith('#')) return;
    result.push([index + 1, trimmed]);
  });
  return result;
}

const files = fs.readdirSync(SCRIPTS_DIR).filter((name) => name.endsWith('.py'));
const offenders = [];

for (const name of files) {
  if (ALLOWED_HARDCODE.has(name)) continue;
  const body = fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf8');
  for (const [lineNumber, code] of codeLines(body)) {
    if (/impersonate\s*=\s*["']/.test(code)) offenders.push(`${name}:${lineNumber} -> ${code.slice(0, 120)}`);
  }
}

const helperPath = path.join(SCRIPTS_DIR, HELPER);
if (!fs.existsSync(helperPath)) {
  console.error(`[audit:idx-fingerprint] FAIL - ${HELPER} tidak ada; skrip IDX tidak punya jalur fingerprint cadangan.`);
  process.exit(1);
}

const helper = fs.readFileSync(helperPath, 'utf8');
const chainMatch = helper.match(/DEFAULT_CHAIN\s*=\s*"([^"]+)"/);
const chain = chainMatch ? chainMatch[1].split(',').map((value) => value.trim()).filter(Boolean) : [];

if (chain.length < 2) {
  console.error(`[audit:idx-fingerprint] FAIL - rantai fingerprint di ${HELPER} kurang dari 2 kandidat (${chain.join(', ') || 'kosong'}).`);
  process.exit(1);
}

if (!/IDX_IMPERSONATE_CHAIN/.test(helper)) {
  console.error(`[audit:idx-fingerprint] FAIL - ${HELPER} tidak menyediakan override IDX_IMPERSONATE_CHAIN.`);
  process.exit(1);
}

const users = files.filter((name) => name !== HELPER && /build_session\(/.test(fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf8')));

if (offenders.length > 0) {
  console.error('[audit:idx-fingerprint] FAIL - fingerprint browser masih dikunci di skrip berikut:');
  for (const line of offenders) console.error(`  - ${line}`);
  console.error('  Pakai build_session() dari scripts/idx_session.py.');
  process.exit(1);
}

console.log(`[audit:idx-fingerprint] PASS: ${files.length} skrip Python diperiksa, 0 fingerprint dikunci; ${users.length} skrip memakai build_session(); rantai kandidat: ${chain.join(' > ')}.`);