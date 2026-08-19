import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Penjaga ini lahir dari kegagalan build produksi 2026-08-19: `git pull` tanpa `npm ci`
 * di VPS membuat webpack melaporkan `Can't resolve 'swr'` di tiga berkas halaman, seolah
 * kodenyalah yang rusak. Yang dijaga di sini adalah PEMASANGANNYA, bukan logikanya -
 * skrip yang benar tapi tidak pernah dipanggil sama sekali tidak menolong siapa pun, dan
 * hook `prebuild` adalah hal yang paling gampang hilang saat seseorang merapikan skrip.
 */

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'check-deps-installed.mjs');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

describe('penjaga sinkronisasi node_modules', () => {
  it('terpasang sebagai hook prebuild, bukan skrip yatim', () => {
    // npm menjalankan `prebuild` otomatis sebelum `build`. Tanpa baris ini skripnya ada
    // tapi tidak pernah jalan di jalur yang penting - yaitu build di server.
    expect(pkg.scripts?.prebuild).toBe('node scripts/check-deps-installed.mjs');
  });

  it('skripnya benar-benar ada di lokasi yang dirujuk', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  it('lulus pada pohon dependensi yang sehat', () => {
    // Kalau ini merah di CI, node_modules-nya yang bermasalah - bukan tesnya.
    const out = execFileSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/dependensi terpasang lengkap/);
    // 30 detik: proses node terpisah, sama seperti gerbang a11y - 5 detik bawaan terlalu
    // ketat saat suite penuh berjalan paralel.
  }, 30_000);

  it('menyebut `npm ci` di pesan galatnya - itu seluruh gunanya', () => {
    // Nilai skrip ini bukan "mendeteksi", melainkan MEMBERI TAHU perintah perbaikannya.
    // Pesan yang cuma bilang "dependensi hilang" mengembalikan orang ke tebak-tebakan.
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toContain('npm ci');
    expect(src).toContain('process.exit(1)');
  });

  it('memeriksa devDependencies juga, bukan hanya dependencies', () => {
    // `next build` mengompilasi dengan typescript + tailwind + plugin postcss, semuanya
    // devDependencies. devDep yang hilang menggagalkan build produksi sama persis.
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toContain('pkg.devDependencies');
  });
});
