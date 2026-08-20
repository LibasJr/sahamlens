import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(os.tmpdir(), 'sahamlens-responsive-harness.css');

let cached: string | null = null;

/**
 * CSS produksi aplikasi, dikompilasi sungguhan oleh Tailwind.
 *
 * Bukan salinan aturan yang ditulis tangan di test: yang harus diukur adalah CSS yang
 * benar-benar dikirim ke pengguna, termasuk `app/globals.css` beserta seluruh kelas
 * semantik lens-* dan blok @media rentang tablet di dalamnya.
 */
export function productionStylesheet(): string {
  if (cached) return cached;

  // CLI-nya dipanggil lewat `node <lib/cli.js>`, bukan lewat npx/binary .bin: di Windows
  // keduanya adalah shim .cmd yang tidak bisa dieksekusi execFileSync tanpa shell, dan
  // kegagalannya muncul sebagai ENOENT yang terbaca seperti Tailwind tidak terpasang.
  execFileSync(
    process.execPath,
    [
      path.join(ROOT, 'node_modules', 'tailwindcss', 'lib', 'cli.js'),
      '-c', 'tailwind.config.js',
      '-i', 'app/globals.css',
      '-o', OUT,
    ],
    { cwd: ROOT, stdio: 'pipe' },
  );

  cached = fs.readFileSync(OUT, 'utf8');
  if (cached.length < 10_000) {
    throw new Error(`Kompilasi Tailwind menghasilkan ${cached.length} byte - terlalu kecil untuk CSS produksi; pemindainya rusak.`);
  }
  return cached;
}

/**
 * Variabel font yang di produksi diinjeksikan next/font ke elemen <html>.
 *
 * Tanpa ini setiap peran tipografi RUNTUH ke serif: `font-family: var(--font-inter),
 * 'Inter', sans-serif` menjadi invalid at computed-value time begitu `--font-inter` tidak
 * terdefinisi - bukan jatuh ke item berikutnya dalam daftar, melainkan membatalkan seluruh
 * deklarasinya. Akibatnya potret dan pengukuran memakai bentuk huruf yang tidak pernah
 * dilihat pengguna.
 *
 * Nilainya sengaja stack sistem, bukan berkas font sungguhan: harness ini mengukur tata
 * letak dan ritme, dan mengunduh font hanya menambah kerapuhan jaringan.
 */
const FONT_VARS = `:root {
  --font-inter: system-ui, -apple-system, 'Segoe UI', Roboto, Arial;
  --font-jetbrains-mono: 'Cascadia Mono', Consolas, 'Courier New';
}`;

/** Halaman kosong bergaya produksi, siap diisi markup uji. */
export function pageHtml(body: string): string {
  return `<!doctype html>
<html lang="id" class="dark">
  <head><meta charset="utf-8"><style>${FONT_VARS}</style><style>${productionStylesheet()}</style></head>
  <body>${body}</body>
</html>`;
}

/** Isi berkas sumber repo, apa adanya. */
export function readSource(relativePath: string): string {
  const full = path.join(ROOT, relativePath);
  if (!fs.existsSync(full)) {
    throw new Error(`${relativePath} hilang - pindahkan harness-nya, jangan biarkan lulus tanpa memeriksa`);
  }
  return fs.readFileSync(full, 'utf8');
}

/**
 * className pertama di `source` yang memuat SEMUA `fragments`.
 *
 * Diambil dari sumber, bukan disalin ke dalam test, supaya yang diukur selalu kelas yang
 * benar-benar dipakai komponennya. Kalau kelasnya berubah, pengukurannya ikut berubah;
 * kalau kelas yang dicari hilang sama sekali, harness melempar - bukan diam-diam lulus.
 */
export function classNameContaining(source: string, fragments: string[]): string {
  // Komentar dibuang dulu: satu berkas di repo ini pernah meluluskan gerbang lewat daftar
  // kelas yang ditulis di komentar sementara markup sungguhannya sudah berubah.
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  // Dua bentuk, karena keduanya dipakai di repo ini: className="..." dan className={`...`}.
  // Yang kedua sering justru yang memuat kelas tata letak, karena di situlah varian
  // kondisional ditulis - membacanya setengah berarti harness diam-diam melewatkan
  // komponen yang paling mungkin berubah.
  const kandidat: string[] = [];
  for (const match of clean.matchAll(/className="([^"]*)"/g)) kandidat.push(match[1]);
  for (const match of clean.matchAll(/className=\{`([^`]*)`\}/g)) {
    // Bagian ${...} dibuang: yang tersisa adalah kelas yang selalu ada, dan hanya itu
    // yang boleh diukur sebagai kontrak.
    kandidat.push(match[1].replace(/\$\{[^}]*\}/g, ' '));
  }

  for (const value of kandidat) {
    if (fragments.every((fragment) => value.includes(fragment))) return value.replace(/\s+/g, ' ').trim();
  }
  throw new Error(`Tidak ada className yang memuat ${fragments.join(' + ')} - kelasnya pindah atau hilang`);
}
