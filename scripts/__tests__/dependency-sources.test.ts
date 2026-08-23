import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * KENAPA TEST INI ADA.
 *
 * `xlsx` tidak diambil dari registry npm, melainkan dari tarball resmi SheetJS di
 * cdn.sheetjs.com. Itu terlihat seperti kesalahan, dan itulah masalahnya: cepat atau
 * lambat ada yang "merapikan"-nya kembali jadi `"xlsx": "^0.18.5"` karena URL di
 * dependencies terbaca seperti sisa eksperimen.
 *
 * Yang terjadi kalau itu dilakukan: 0.18.5 adalah rilis terakhir yang pernah masuk
 * registry, dan ia memikul dua advisory high yang TIDAK akan pernah ditambal di sana -
 * GHSA-4r6h-8v6p-xvw6 (prototype pollution) dan GHSA-5pgg-2g8v-p4x9 (ReDoS). SheetJS
 * berhenti menerbitkan ke npm sejak 0.19; perbaikannya hanya ada di CDN mereka, jadi
 * `npm audit` melaporkan `fixAvailable: false` dan job perawatan mingguan memerah
 * setiap Minggu tanpa ada yang bisa dilakukan.
 *
 * Gerbang yang memerah tiap minggu untuk hal yang tidak bisa diperbaiki akan diabaikan
 * dalam sebulan, dan kegagalan sungguhan ikut tidak terbaca (CLAUDE.md §2). Karena itu
 * sumbernya dipindah - dan karena itu pula pemindahannya dikunci di sini, di CI, bukan
 * menunggu `npm audit` menemukannya lagi hari Minggu 03:34 WIB.
 *
 * Konsekuensi yang harus disadari: `npm ci` di CI dan di VPS sekarang ikut bergantung
 * pada cdn.sheetjs.com. Kegagalannya keras dan langsung terbaca (install berhenti),
 * bukan diam-diam, dan integritas tarball-nya tetap terkunci di package-lock.json.
 */
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));

/** Rilis xlsx terendah yang berada di luar KEDUA advisory di atas. */
const MINIMUM_SAFE_XLSX = [0, 20, 2];

function parseVersion(value: string) {
  return String(value).split('.').map((part) => Number.parseInt(part, 10));
}

function atLeast(actual: number[], minimum: number[]) {
  for (let i = 0; i < minimum.length; i += 1) {
    const left = actual[i] ?? 0;
    if (left > minimum[i]) return true;
    if (left < minimum[i]) return false;
  }
  return true;
}

describe('xlsx diambil dari SheetJS, bukan registry npm', () => {
  it('membaca manifest yang cukup untuk diperiksa', () => {
    // Penjaga jumlah: kalau package.json/lock gagal diurai, seluruh test di bawah
    // lulus tanpa memeriksa apa pun - lebih buruk daripada merah (CLAUDE.md §2).
    expect(Object.keys(pkg.dependencies ?? {}).length).toBeGreaterThan(10);
    expect(Object.keys(lock.packages ?? {}).length).toBeGreaterThan(100);
  });

  it('dideklarasikan sebagai tarball cdn.sheetjs.com', () => {
    const spec = String(pkg.dependencies?.xlsx ?? '');
    expect(
      spec,
      'xlsx dikembalikan ke registry npm. Rilis terakhir di sana (0.18.5) memikul dua advisory high '
        + 'tanpa tambalan - job perawatan mingguan akan FAIL tiap Minggu. Pakai tarball cdn.sheetjs.com.',
    ).toMatch(/^https:\/\/cdn\.sheetjs\.com\/xlsx-\d+\.\d+\.\d+\/xlsx-\d+\.\d+\.\d+\.tgz$/);
  });

  it('terkunci di lockfile pada versi yang di luar kedua advisory, dengan integritas', () => {
    const entry = lock.packages?.['node_modules/xlsx'];
    expect(entry, 'node_modules/xlsx hilang dari package-lock.json').toBeTruthy();
    expect(String(entry.resolved)).toMatch(/^https:\/\/cdn\.sheetjs\.com\//);
    // Tarball URL tanpa integrity berarti isinya bisa berganti tanpa lockfile berubah.
    expect(String(entry.integrity ?? '')).toMatch(/^sha\d+-/);
    expect(
      atLeast(parseVersion(entry.version), MINIMUM_SAFE_XLSX),
      `xlsx ${entry.version} masih di dalam jangkauan GHSA-5pgg-2g8v-p4x9 (<0.20.2)`,
    ).toBe(true);
  });

  it('deklarasi dan lockfile menunjuk tarball yang sama', () => {
    // Keduanya benar sendiri-sendiri tapi berbeda satu sama lain = `npm ci` memasang
    // versi lain daripada yang tertulis di package.json, dan tidak ada yang memerah.
    expect(lock.packages?.['node_modules/xlsx']?.resolved).toBe(pkg.dependencies?.xlsx);
  });
});
