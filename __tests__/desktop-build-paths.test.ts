import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * ===================================================================================
 * KENAPA GERBANG INI ADA
 * ===================================================================================
 *
 * PR #419 memasukkan `import { readFileSync } from 'node:fs'` ke sebuah berkas di
 * `modules/validation/`, yang ditarik ke bundel klien lewat `app/dashboard/page.tsx`.
 * Typecheck, lint, 3.170 test, dan build Linux SEMUANYA hijau. Yang menangkapnya
 * hanya `Build SahamLens Pro Windows` (static export Tauri, tidak punya `fs`).
 *
 * Build itu terpicu hanya karena PR tersebut KEBETULAN juga menyentuh `shared/**`.
 * Berkas yang benar-benar rusak ada di `modules/**`, dan `modules/**` saat itu TIDAK
 * terdaftar di `paths` pemicu workflow. PR berikutnya (#420) membuktikannya: hanya
 * menyentuh `modules/**`, dan build Windows tidak berjalan sama sekali.
 *
 * Jadi satu-satunya gerbang yang bisa menangkap kelas galat ini bisa dilewati oleh
 * perubahan yang justru paling mungkin menyebabkannya. Test ini mengunci daftar
 * `paths` supaya mengikuti impor yang NYATA, bukan ingatan orang yang menyuntingnya.
 */

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW = path.join(ROOT, '.github/workflows/desktop-pro.yml');

/** Direktori sumber tingkat atas yang benar-benar diimpor oleh app/ dan components/. */
function importedTopLevelDirs(): Set<string> {
  // git grep: cepat, dan otomatis mengabaikan node_modules/.next.
  const out = execFileSync(
    'git',
    ['grep', '-hoE', "from '@/[a-z-]+/", '--', 'app', 'components'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );

  const dirs = new Set<string>();
  for (const line of out.split('\n')) {
    const m = line.match(/from '@\/([a-z-]+)\//);
    if (m) dirs.add(m[1]);
  }
  return dirs;
}

function declaredPaths(): string[] {
  const yml = readFileSync(WORKFLOW, 'utf8');
  return [...yml.matchAll(/^\s+- '([^']+)'/gm)].map((m) => m[1]);
}

describe('desktop-pro.yml - paths pemicu harus mencakup seluruh sumber bundel klien', () => {
  it('pemindainya benar-benar menemukan impor (penjaga jumlah)', () => {
    // Kalau ini jatuh ke nol, git grep-nya yang rusak - bukan berarti tidak ada impor.
    expect(importedTopLevelDirs().size).toBeGreaterThan(2);
  });

  it('setiap direktori yang diimpor UI terdaftar sebagai pemicu', () => {
    const declared = declaredPaths();
    const missing = [...importedTopLevelDirs()].filter(
      (d) => !declared.includes(`${d}/**`),
    );

    expect(
      missing,
      `Direktori ini diimpor oleh app/ atau components/ sehingga ikut masuk bundel ` +
        `klien, tetapi TIDAK memicu build Windows: ${missing.join(', ')}. ` +
        `Tambahkan '<dir>/**' ke KEDUA blok paths (push dan pull_request) di ` +
        `.github/workflows/desktop-pro.yml. Lihat komentar di atas berkas test ini.`,
    ).toEqual([]);
  });

  it('blok push dan pull_request memakai daftar yang sama', () => {
    // Kalau keduanya berbeda, sebuah perubahan bisa lolos di PR lalu baru gagal
    // setelah mendarat di main - tempat paling mahal untuk menemukannya.
    const yml = readFileSync(WORKFLOW, 'utf8');
    const blocks = [...yml.matchAll(/paths:\n((?:\s+(?:#[^\n]*|- '[^']+')\n)+)/g)].map(
      (m) => [...m[1].matchAll(/- '([^']+)'/g)].map((x) => x[1]).sort(),
    );

    expect(blocks.length).toBe(2);
    expect(blocks[0]).toEqual(blocks[1]);
  });

  it('berkas konfigurasi yang mengubah hasil build ikut memicu', () => {
    const declared = declaredPaths();
    for (const f of ['package.json', 'package-lock.json', 'next.config.mjs', 'tsconfig.json']) {
      expect(declared, `${f} harus memicu build Windows`).toContain(f);
    }
  });
}, 30_000);
