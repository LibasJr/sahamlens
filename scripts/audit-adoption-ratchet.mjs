// RATCHET ADOPSI: angka boleh turun, tidak boleh naik.
//
// Dua migrasi besar sedang berjalan di repo ini, dan keduanya bertanda "XL" di dokumen
// audit masing-masing:
//
//   1. Design system - <Card>/<Button> vs pola className mentah yang setara.
//   2. Kontrak API   - runController (bentuk error seragam + X-Request-Id) vs
//                      NextResponse.json langsung.
//
// Pekerjaan bertanda XL yang bergantung pada niat baik akan tetap XL selamanya. Yang
// membuatnya bergerak bukan menjadwalkan migrasinya, tapi memastikan angkanya tidak bisa
// memburuk: setiap kali seseorang menyentuh berkas lama, ia merapikan bagian yang ia
// sentuh, dan hasilnya tidak pernah hilang lagi.
//
// Karena itu skrip ini TIDAK menuntut angka nol. Ia hanya menolak kemunduran. Saat sebuah
// angka turun, jalankan `node scripts/audit-adoption-ratchet.mjs --update` untuk mengunci
// capaian barunya - itu satu-satunya arah baseline boleh bergerak tanpa pembahasan.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, 'config', 'ui-adoption-baseline.json');
const UPDATE = process.argv.includes('--update');

function walk(dir, filter) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : walk(full, filter);
    }
    return filter(entry.name) ? [full] : [];
  });
}

const tsxFiles = [
  ...walk(path.join(ROOT, 'app'), (n) => n.endsWith('.tsx')),
  ...walk(path.join(ROOT, 'components'), (n) => n.endsWith('.tsx')),
];
const routeFiles = walk(path.join(ROOT, 'app', 'api'), (n) => n === 'route.ts');

/**
 * Kartu yang dirakit tangan: satu atribut className yang sekaligus menyebut permukaan
 * kartu, garis tepi, dan sudut membulat - yaitu persis yang sudah disediakan <Card>.
 * Dicocokkan per-className, bukan per-berkas, supaya angkanya mencerminkan jumlah tempat
 * yang harus disentuh, bukan jumlah berkas yang kebetulan memuat salah satunya.
 */
function countRawCards(text) {
  let n = 0;
  for (const m of text.matchAll(/className="([^"]*)"/g)) {
    const cls = m[1];
    if (cls.includes('bg-tv-card') && /\bborder\b/.test(cls) && /\brounded-/.test(cls)) n++;
  }
  return n;
}

const metrics = {
  rawCardClassNames: {
    label: 'className kartu mentah (pakai <Card>)',
    value: tsxFiles.reduce((sum, f) => sum + countRawCards(fs.readFileSync(f, 'utf8')), 0),
  },
  rawButtonElements: {
    label: '<button> mentah (pakai <Button>)',
    value: tsxFiles.reduce(
      (sum, f) => sum + (fs.readFileSync(f, 'utf8').match(/<button[\s>]/g) || []).length,
      0,
    ),
  },
  routesWithoutRunController: {
    label: 'route API tanpa runController',
    value: routeFiles.filter((f) => !fs.readFileSync(f, 'utf8').includes('runController')).length,
  },
};

const baseline = fs.existsSync(BASELINE_PATH)
  ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
  : {};

console.log('SahamLens Adoption Ratchet');
console.log(`Dipindai: ${tsxFiles.length} berkas TSX, ${routeFiles.length} route API\n`);

const regressions = [];
const improvements = [];
const next = {};

for (const [key, { label, value }] of Object.entries(metrics)) {
  const before = baseline[key];
  next[key] = before == null ? value : Math.min(before, value);

  if (before == null) {
    console.log(`  ${String(value).padStart(4)}  ${label}  (baseline baru)`);
  } else if (value > before) {
    console.log(`  ${String(value).padStart(4)}  ${label}  NAIK dari ${before}`);
    regressions.push(`${label}: ${before} -> ${value} (+${value - before})`);
  } else if (value < before) {
    console.log(`  ${String(value).padStart(4)}  ${label}  turun dari ${before}`);
    improvements.push(`${label}: ${before} -> ${value} (-${before - value})`);
  } else {
    console.log(`  ${String(value).padStart(4)}  ${label}  tetap`);
  }
}

if (UPDATE) {
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\n[ratchet] baseline ditulis ke ${path.relative(ROOT, BASELINE_PATH)}`);
  process.exit(0);
}

if (regressions.length > 0) {
  console.error('\n[ratchet] FAIL - adopsi mundur:');
  for (const line of regressions) console.error(`  - ${line}`);
  console.error(
    '\nPakai primitif yang sudah ada (<Card>, <Button>, runController) untuk kode baru.\n' +
      'Kalau kemunduran ini memang tidak terhindarkan, naikkan baseline di\n' +
      `${path.relative(ROOT, BASELINE_PATH)} DALAM commit yang sama berikut alasannya.`,
  );
  process.exit(1);
}

if (improvements.length > 0) {
  console.log('\n[ratchet] Adopsi membaik:');
  for (const line of improvements) console.log(`  - ${line}`);
  console.log('\nJalankan `npm run audit:adoption -- --update` untuk mengunci capaian ini.');
}

console.log('\n[ratchet] PASS: tidak ada kemunduran adopsi.');
