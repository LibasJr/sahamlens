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

// Implementation primitives and fixed-size export canvases are not adoption debt:
// the primitive must contain the native element it abstracts, while export cards are
// deliberately isolated rendering surfaces rather than interactive product UI.
const buttonAdoptionFiles = tsxFiles.filter(
  (file) => file !== path.join(ROOT, 'components', 'ui', 'Button.tsx'),
);
const cardAdoptionFiles = tsxFiles.filter(
  (file) =>
    !file.includes(`${path.sep}components${path.sep}export${path.sep}`) &&
    file !== path.join(ROOT, 'components', 'ui', 'Table.tsx'),
);

const RAW_API_FETCH_ALLOWLIST = new Map([
  [path.join(ROOT, 'components', 'AIChat.tsx'), 1], // NDJSON stream: apiRequest intentionally buffers JSON.
]);
const routeFiles = walk(path.join(ROOT, 'app', 'api'), (n) => n === 'route.ts');
const clientSourceFiles = [
  ...walk(path.join(ROOT, 'app'), (n) => n.endsWith('.ts') || n.endsWith('.tsx')),
  ...walk(path.join(ROOT, 'components'), (n) => n.endsWith('.ts') || n.endsWith('.tsx')),
  ...walk(path.join(ROOT, 'lib'), (n) => n.endsWith('.ts') || n.endsWith('.tsx')),
  ...walk(path.join(ROOT, 'shared'), (n) => n.endsWith('.ts') || n.endsWith('.tsx')),
].filter((file) => !file.includes(`${path.sep}app${path.sep}api${path.sep}`) && !file.includes(`${path.sep}__tests__${path.sep}`));

/**
 * Kartu yang dirakit tangan: satu atribut className yang sekaligus menyebut permukaan
 * kartu, garis tepi, dan sudut membulat - yaitu persis yang sudah disediakan <Card>.
 * Dicocokkan per-className, bukan per-berkas, supaya angkanya mencerminkan jumlah tempat
 * yang harus disentuh, bukan jumlah berkas yang kebetulan memuat salah satunya.
 */
function countRawCards(text) {
  let n = 0;
  // Only card-like semantic containers count. Inputs, pills, labels and toolbar buttons
  // may legitimately share the same surface/border/radius tokens without being Cards.
  for (const m of text.matchAll(/<(?:div|section|article|form|aside)\b[^>]*className="([^"]*)"[^>]*>/gs)) {
    const cls = m[1];
    if (
      cls.includes('bg-tv-card') &&
      /\bborder\b/.test(cls) &&
      /\brounded-/.test(cls) &&
      !/\brounded-full\b/.test(cls) &&
      !/\babsolute\b/.test(cls) &&
      !(/\btext-\[(?:9|10|11)px\]/.test(cls) && /\bpy-(?:0\.5|1)\b/.test(cls))
    ) n++;
  }
  return n;
}

const metrics = {
  rawCardClassNames: {
    label: 'className kartu mentah (pakai <Card>)',
    value: cardAdoptionFiles.reduce((sum, f) => sum + countRawCards(fs.readFileSync(f, 'utf8')), 0),
  },
  rawButtonElements: {
    label: '<button> mentah (pakai <Button>)',
    value: buttonAdoptionFiles.reduce(
      (sum, f) => sum + (fs.readFileSync(f, 'utf8').match(/<button[\s>]/g) || []).length,
      0,
    ),
  },
  routesWithoutRunController: {
    label: 'route API tanpa response adapter',
    value: routeFiles.filter((f) => {
      const text = fs.readFileSync(f, 'utf8');
      return !text.includes('runController') && !text.includes('runCronRoute');
    }).length,
  },
  rawClientApiFetchCalls: {
    label: "fetch('/api/...') mentah di client (pakai apiRequest bila JSON)",
    value: clientSourceFiles.reduce((sum, file) => {
      const text = fs.readFileSync(file, 'utf8');
      const raw = (text.match(/fetch\(\s*['"]\/api\//g) || []).length;
      const intentional = Math.min(raw, RAW_API_FETCH_ALLOWLIST.get(file) ?? 0);
      return sum + raw - intentional;
    }, 0),
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
