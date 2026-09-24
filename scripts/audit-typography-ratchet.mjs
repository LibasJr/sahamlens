// RATCHET TIPOGRAFI: angka boleh turun, tidak boleh naik.
//
// Konteks (audit tipografi 24 September 2026): aplikasi ini punya DUA sistem ukuran
// huruf yang bertabrakan - peran semantik (.lens-body, .lens-metric, ...) dan ukuran
// piksel acak yang ditulis langsung di komponen (text-[10px], text-[11px], ...).
// Terukur saat audit: 733 penyebutan `text-[Npx]` di 112 berkas, dan 623 di antaranya
// di bawah 13px - yaitu teks yang di desktop dirender 10-12px lalu di ponsel dinaikkan
// paksa oleh "lantai kompatibilitas" di globals.css. Akibatnya kode tidak lagi
// menggambarkan ukuran yang benar-benar dilihat pengguna.
//
// Migrasi 733 titik tidak bisa diselesaikan dalam satu PR. Yang membuatnya benar-benar
// bergerak bukan jadwal, melainkan pagar: setiap perubahan baru dilarang menambah
// ukuran piksel acak, dan setiap kali angka turun, capaian itu dikunci dengan
// `node scripts/audit-typography-ratchet.mjs --update`.
//
// PENGECUALIAN YANG DISENGAJA:
//   - `components/export/**` dan berkas bertanda export card: kanvas PNG berukuran
//     tetap, dirender di luar alur halaman, dan tipografinya ikut ukuran kanvas -
//     bukan hierarki baca aplikasi. Peran semantik justru salah di sana.
//   - `app/globals.css` tidak dipindai: berkas itu memang tempat peran semantik
//     didefinisikan, dan lantai kompatibilitas menyebut ukuran piksel sebagai kunci
//     selektor (bukan sebagai utang migrasi).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, 'config', 'typography-baseline.json');
const UPDATE = process.argv.includes('--update');

const SCAN_DIRS = ['app', 'components'];
const SOURCE_EXT = /\.(tsx?|jsx?)$/;
const BASELINE_SIZE = 13;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
      // Kanvas export: ukuran tetap, lihat catatan pengecualian di atas.
      if (entry.name === 'export') return [];
      return walk(full);
    }
    if (!SOURCE_EXT.test(entry.name) || entry.name.endsWith('.d.ts')) return [];
    // Nama berkas yang menyatakan dirinya sebagai export card (mis. FundamentalExportCard.tsx)
    // juga dikecualikan: konvensi itu yang dipakai repo ini untuk kanvas PNG.
    if (/Export(Card|Sheet|Image)?\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

/**
 * Buang komentar sebelum mencocokkan pola.
 *
 * Berkas ini sendiri menjelaskan dirinya dengan menulis `text-[10px]` di komentar, dan
 * globals.css menyebut ukuran piksel sebagai kunci selektor lantai kompatibilitas.
 * Menghitung prosa sebagai utang migrasi akan menghukum justru berkas yang
 * mendokumentasikan pola yang harus ditinggalkan - kesalahan yang sudah pernah terjadi
 * di ratchet adopsi (lihat scripts/audit-adoption-ratchet.mjs).
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const ARBITRARY_RE = /text-\[(\d+(?:\.\d+)?)px\]/g;

const files = SCAN_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));

function countArbitrary(source) {
  const text = stripComments(source);
  let total = 0;
  let subBaseline = 0;
  const bySize = {};
  for (const match of text.matchAll(ARBITRARY_RE)) {
    const size = Number.parseFloat(match[1]);
    total += 1;
    if (size < BASELINE_SIZE) subBaseline += 1;
    bySize[size] = (bySize[size] || 0) + 1;
  }
  return { total, subBaseline, bySize };
}

const totals = { arbitrary_total: 0, sub13_total: 0 };
const bySizeTotals = {};
let filesWithArbitrary = 0;
let filesScanned = 0;

for (const file of files) {
  const real = path.relative(ROOT, file).split(path.sep).join('/');
  if (real.startsWith('components/export/')) continue;
  filesScanned += 1;
  const counts = countArbitrary(fs.readFileSync(file, 'utf8'));
  if (counts.total > 0) filesWithArbitrary += 1;
  totals.arbitrary_total += counts.total;
  totals.sub13_total += counts.subBaseline;
  for (const [size, count] of Object.entries(counts.bySize)) {
    bySizeTotals[size] = (bySizeTotals[size] || 0) + count;
  }
}

// Penjaga pemindai: kalau jumlah berkas yang diperiksa jatuh mendekati nol, yang rusak
// adalah pemindainya - bukan berarti utangnya lunas.
if (filesScanned < 400) {
  console.error(`[ratchet tipografi] hanya ${filesScanned} berkas diperiksa - pemindainya rusak, bukan bersih.`);
  process.exit(1);
}

const metrics = [
  {
    key: 'arbitrary_total',
    label: 'ukuran piksel acak (text-[Npx]) di app/ + components/',
    value: totals.arbitrary_total,
  },
  {
    key: 'sub13_total',
    label: `ukuran piksel acak di bawah ${BASELINE_SIZE}px (lantai kompatibilitas yang menutupinya)`,
    value: totals.sub13_total,
  },
];

const baseline = fs.existsSync(BASELINE_PATH)
  ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
  : null;

const next = { ...(baseline || {}) };
let regression = false;

console.log('\nRatchet tipografi');
console.log('--------------------------------------------------------');
for (const metric of metrics) {
  const before = baseline ? baseline[metric.key] : undefined;
  next[metric.key] = metric.value;
  if (before === undefined) {
    console.log(`  ${String(metric.value).padStart(4)}  ${metric.label}  (baseline baru)`);
    continue;
  }
  const delta = metric.value - before;
  const tanda = delta > 0 ? 'NAIK' : delta < 0 ? 'turun' : 'sama';
  console.log(`  ${String(metric.value).padStart(4)}  ${metric.label}  (${tanda} ${delta >= 0 ? '+' : ''}${delta})`);
  if (delta > 0) regression = true;
}
console.log(
  `  ${String(filesWithArbitrary).padStart(4)}  berkas yang masih memakai ukuran piksel acak (dari ${filesScanned} diperiksa)`,
);
console.log(`  Sebaran ukuran: ${Object.entries(bySizeTotals).sort((a, b) => Number(a[0]) - Number(b[0])).map(([s, c]) => `${s}px=${c}`).join('  ')}`);
console.log('--------------------------------------------------------');

if (regression) {
  console.error(
    '\n[ratchet tipografi] Ukuran piksel acak BERTAMBAH.\n\n' +
      'Pakai peran semantik dari app/globals.css: lens-body / lens-ui / lens-body-sm /\n' +
      'lens-label / lens-meta / lens-caption / lens-eyebrow / lens-card-title /\n' +
      'lens-section-title / lens-page-title / lens-chip / lens-number / lens-metric /\n' +
      'lens-metric-lg / lens-display.\n\n' +
      'Bila ukuran baru memang tidak terhindarkan (kanvas berukuran tetap, visualisasi,\n' +
      'atau pengecualian ekspor), tambahkan berkasnya ke pengecualian di skrip ini\n' +
      'dengan alasan tertulis - jangan naikkan baseline tanpa alasan.\n',
  );
  process.exit(1);
}

if (UPDATE) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\n[ratchet tipografi] baseline ditulis ke ${path.relative(ROOT, BASELINE_PATH)}`);
}

console.log('');