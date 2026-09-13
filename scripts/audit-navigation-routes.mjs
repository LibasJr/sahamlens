#!/usr/bin/env node
/**
 * Fail the build audit when an internal link has no matching App Router page.
 *
 * DUA LAPIS, SENGAJA.
 *
 * Lapis 1 (ketat, sudah ada sejak awal): `components/Sidebar.tsx` dan
 * `components/MobileNav.tsx` - pemegang navigasi utama. Link putus di sini berarti
 * menu aplikasi sendiri menunjuk halaman yang tidak ada.
 *
 * Lapis 2 (ditambahkan 13 September 2026): SELURUH `app/` + `components/`. Alasannya
 * terukur - audit tangan hari itu memeriksa 43 href di seluruh repo dan mendapati
 * semuanya hidup, tapi lapis 1 hanya menyentuh 37 link dari 2 berkas. Sisanya - CTA
 * di kartu, tautan footer, tombol "Lihat semua", tautan di dalam halaman - tidak
 * dijaga apa pun. `next build` tidak memvalidasi target href, typecheck tidak tahu
 * `/market` bukan rute, dan test komponen yang me-render <Link href="..."> lulus karena
 * yang diuji markup-nya, bukan tujuannya. Kelas bug ini hanya muncul saat pengguna
 * mengklik.
 *
 * KENAPA `path:` IKUT DIPINDAI, BUKAN HANYA `href=`. Sidebar tidak memakai href sama
 * sekali; ia mendeklarasikan `{ id, name, path: '/market-pulse', icon }` lalu merender
 * <Link> di tempat lain. Pemindai yang hanya mencari `href=` tetap hijau saat
 * `path: '/market-pulse'` dirusak jadi `path: '/market'` - terbukti saat gerbang ini
 * diperluas: versi href-saja lulus dengan 117 temuan sementara rute navigasi utama
 * sudah putus. Itu persis "gerbang yang lulus tanpa memeriksa apa pun" di CLAUDE.md §2.
 *
 * KENAPA KOMENTAR DIBUANG LEBIH DULU. CLAUDE.md §2: berkas di repo ini menjelaskan
 * dirinya dengan menulis contoh kode di komentar. Tanpa stripComments, contoh
 * `href="/contoh"` di komentar dokumentasi terhitung sebagai pelanggaran nyata -
 * kegagalan yang sama sudah pernah menjatuhkan ratchet adopsi.
 *
 * AMBANG. Nol. Link putus adalah cacat, bukan utang gaya penulisan.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const NAV_FILES = ['components/Sidebar.tsx', 'components/MobileNav.tsx'];
const SCAN_DIRS = ['app', 'components'];

/** Pola yang dianggap menunjuk rute internal (lihat catatan `path:` di atas). */
const LINK_PATTERNS = [
  /href=["'](\/[^"'{}\s]*)["']/g,
  /(?:path|href):\s*['"](\/[^'"]*)['"]/g,
];

/**
 * Target yang memang bukan halaman App Router. Sengaja sempit: setiap entri di sini
 * adalah lubang di gerbang.
 */
const NOT_A_PAGE = [
  '/api/',
  '/_next/',
  '/favicon',
  '/icons/',
  '/images/',
  '/logo',
  '/manifest',
  '/robots',
  '/sitemap',
  '/opengraph',
];

/** Path relatif dengan pemisah '/' di semua sistem operasi (CLAUDE.md §2). */
const toPosix = (p) => p.split(path.sep).join('/');

const isNotAPage = (target) => NOT_A_PAGE.some((p) => target === p || target.startsWith(p));

/** Membuang komentar blok dan baris tanpa menyentuh isi string. */
function stripComments(src) {
  let out = '';
  let i = 0;
  let state = 'code';
  let quote = '';
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (state === 'code') {
      if (c === '/' && next === '*') { state = 'block'; i += 2; continue; }
      if (c === '/' && next === '/') { state = 'line'; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { state = 'string'; quote = c; out += c; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (state === 'string') {
      if (c === '\\') { out += c + (next ?? ''); i += 2; continue; }
      if (c === quote) { state = 'code'; quote = ''; }
      out += c; i += 1; continue;
    }
    if (state === 'block') {
      if (c === '*' && next === '/') { state = 'code'; i += 2; continue; }
      if (c === '\n') out += c; // jaga nomor baris temuan tetap benar
      i += 1; continue;
    }
    if (c === '\n') { state = 'code'; out += c; }
    i += 1;
  }
  return out;
}

function routePattern(pageFile) {
  const relative = pageFile
    .replace(/^app\//, '')
    .replace(/\/page\.tsx$/, '')
    .replace(/^page\.tsx$/, '');
  const segments = relative.split('/').filter(Boolean).filter((segment) => !/^\(.+\)$/.test(segment));
  const source = segments.map((segment) => {
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return '.*';
    if (/^\[\.\.\..+\]$/.test(segment)) return '.+';
    if (/^\[.+\]$/.test(segment)) return '[^/]+';
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return new RegExp(`^/${source}${source ? '' : '?'}$`);
}

async function pages(dir = path.join(ROOT, 'app')) {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await pages(full));
    else if (entry.name === 'page.tsx') found.push(toPosix(path.relative(ROOT, full)));
  }
  return found;
}

async function sourceFiles(dir, acc = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      await sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Kumpulkan target link per berkas, dengan nomor baris untuk pesan kegagalan. */
function extractLinks(source) {
  const clean = stripComments(source);
  const out = [];
  for (const re of LINK_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(clean)) !== null) {
      const target = m[1].split(/[?#]/)[0] || '/';
      if (isNotAPage(target)) continue;
      out.push({ target, line: clean.slice(0, m.index).split('\n').length });
    }
  }
  return out;
}

const pageFiles = await pages();
const patterns = pageFiles.map((file) => ({ file, pattern: routePattern(file) }));
const resolves = (link) => patterns.some(({ pattern }) => pattern.test(link));

console.log('=== SAHAMLENS NAVIGATION ROUTE AUDIT ===');

// ---- Lapis 1: navigasi utama ----
const primary = new Set();
const missingNavFiles = [];
for (const file of NAV_FILES) {
  let source;
  try {
    source = await fs.readFile(path.join(ROOT, file), 'utf8');
  } catch {
    // Berkas navigasi yang hilang BUKAN alasan untuk crash dengan ENOENT: jejak tumpukan
    // node membuat kegagalan gerbang terbaca seperti skrip rusak, bukan seperti temuan.
    // Ia dicatat lalu ditangkap penjaga jumlah di bawah dengan pesan yang bisa dibaca.
    missingNavFiles.push(file);
    continue;
  }
  for (const { target } of extractLinks(source)) primary.add(target);
}
const missingPrimary = [...primary].filter((link) => !resolves(link));

// ---- Lapis 2: seluruh app/ + components/ ----
const wide = [];
for (const dir of SCAN_DIRS) {
  const base = path.join(ROOT, dir);
  try {
    await fs.access(base);
  } catch {
    continue;
  }
  for (const file of await sourceFiles(base)) {
    const rel = toPosix(path.relative(ROOT, file));
    // Berkas test boleh memakai href dummy (<a href="/x">) sebagai fixture.
    if (/(^|\/)__tests__\//.test(rel) || /\.test\.tsx?$/.test(rel)) continue;
    const source = await fs.readFile(file, 'utf8');
    for (const hit of extractLinks(source)) wide.push({ ...hit, file: rel });
  }
}
const missingWide = wide.filter(({ target }) => !resolves(target));

console.log(
  `Lapis 1 (navigasi utama): ${primary.size} link unik dari ${NAV_FILES.length} berkas.`,
);
console.log(
  `Lapis 2 (app/ + components/): ${wide.length} target link di seluruh sumber.`,
);
console.log(`Dibandingkan terhadap ${pageFiles.length} halaman App Router.`);

/**
 * PENJAGA JUMLAH (CLAUDE.md §2). Pemindai yang berhenti menemukan apa pun - karena
 * regex rusak, direktori pindah, atau stripComments memakan isi berkas - akan LULUS
 * tanpa memeriksa apa pun. Itu jauh lebih buruk daripada merah.
 */
const MIN_PRIMARY = 20;
const MIN_WIDE = 80;
if (missingNavFiles.length > 0 || primary.size < MIN_PRIMARY || wide.length < MIN_WIDE) {
  if (missingNavFiles.length > 0) {
    console.error(
      `\nFAIL pemindai rusak: berkas navigasi utama tidak ditemukan: ${missingNavFiles.join(', ')}.\n` +
        'Kalau berkasnya memang pindah, perbarui NAV_FILES - jangan biarkan gerbang ini\n' +
        'memindai daftar kosong (CLAUDE.md §2: gerbang yang menunjuk path lama LULUS\n' +
        'tanpa memeriksa apa pun, dan itu jauh lebih buruk daripada merah).',
    );
  } else {
    console.error(
      `\nFAIL pemindai rusak: lapis 1 menemukan ${primary.size} (minimum ${MIN_PRIMARY}), ` +
        `lapis 2 menemukan ${wide.length} (minimum ${MIN_WIDE}).\n` +
        'Ini BUKAN berarti tidak ada link putus - ini berarti pemeriksaannya tidak berjalan.',
    );
  }
  process.exit(1);
}

let failed = false;
for (const link of missingPrimary) {
  console.error(`FAIL missing page for menu link: ${link}`);
  failed = true;
}
for (const { file, line, target } of missingWide) {
  if (missingPrimary.includes(target)) continue; // sudah dilaporkan di lapis 1
  console.error(`FAIL missing page for link: ${target}  (${file}:${line})`);
  failed = true;
}

if (failed) {
  console.error(
    '\nPerbaiki target link-nya, atau tambahkan rute app/<path>/page.tsx. Jangan menambah\n' +
      'entri NOT_A_PAGE kecuali target itu memang bukan halaman (aset atau route handler).',
  );
  process.exit(1);
}

console.log('PASS: every internal link resolves to an application page.');
