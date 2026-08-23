import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { publicCacheHeaders, CDN_FRESHNESS_SEC } from '@/shared/cache/ttl-policy';

/**
 * CACHE CDN HANYA UNTUK RESPONS YANG SAMA BAGI SEMUA ORANG.
 *
 * Ini invarian keamanan, bukan invarian performa. `CDN-Cache-Control: public` menyuruh
 * Cloudflare menyimpan satu salinan dan menyajikannya ke SIAPA PUN yang meminta URL yang
 * sama. Kalau respons sebuah endpoint pernah berbeda menurut sesi - entitlement Pro,
 * isi watchlist, posisi portofolio - maka salinan milik satu pengguna akan disajikan ke
 * pengguna berikutnya. Kegagalannya senyap: tidak ada error, tidak ada log, hanya data
 * orang lain di layar yang salah.
 *
 * Karena itu daftarnya dikunci di sini, bukan dipercayakan pada ingatan bahwa "route ini
 * kan publik". Menambahkan header ke route bersesi akan menggagalkan tes ini; begitu juga
 * membuat route yang sudah ter-cache mulai membaca sesi.
 */

const REPO_ROOT = path.join(__dirname, '..');
const API_ROOT = path.join(REPO_ROOT, 'app', 'api');

/**
 * Komentar dibuang sebelum pencocokan (CLAUDE.md §2). Tanpa ini, route yang MENJELASKAN
 * kenapa ia tidak lagi memakai publicCacheHeaders terhitung sebagai pemakainya - persis
 * yang terjadi 23 Agustus 2026 saat /api/transparency dipindah ke balik gerbang admin.
 * Menghukum penjelasan membuat orang menghapus penjelasannya, bukan memperbaiki gerbangnya.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function code(file: string): string {
  return stripComments(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'));
}

/** Route yang BOLEH memakai publicCacheHeaders. Isinya identik untuk semua pengunjung. */
const PUBLIC_CACHEABLE = new Set([
  'app/api/market-summary/route.ts',
  'app/api/market-pulse/route.ts',
  'app/api/macro/route.ts',
  'app/api/news/route.ts',
  'app/api/calendar/route.ts',
  'app/api/ai-pick/route.ts',
  'app/api/daily-picks/route.ts',
  'app/api/public-chart/[ticker]/route.ts',
]);

/**
 * Penanda bahwa sebuah respons dapat bergantung pada siapa yang meminta. `cookies` tidak
 * ikut: beberapa route menyebutnya hanya di komentar, dan yang menentukan adalah apakah
 * identitas benar-benar dibaca untuk membentuk body.
 */
const SESSION_MARKERS = [
  'getSession(',
  'hasOpenOrProAccess',
  'requireAuth',
  'getAuthRequestMeta',
  'verifyAdminToken',
  // Ditambahkan 23 Agustus 2026 bersama pemindahan /api/transparency ke balik gerbang
  // admin. Tanpa keduanya, route yang HANYA memeriksa keadminan lolos daftar ini -
  // padahal itu justru respons yang paling tidak boleh disajikan Cloudflare ke publik.
  'isAdminFromRequestCookies',
  'isAdminServer',
];

function listRouteFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listRouteFiles(full);
    // Selalu pisah '/' - di Windows path.relative memakai '\' dan tiap berkas jadi
    // "pelanggar" palsu karena tidak pernah cocok dengan PUBLIC_CACHEABLE.
    return entry.name === 'route.ts' ? [path.relative(REPO_ROOT, full).split(path.sep).join('/')] : [];
  });
}

const routeFiles = listRouteFiles(API_ROOT);

describe('header cache CDN', () => {
  it('menemukan route API untuk diperiksa', () => {
    expect(routeFiles.length).toBeGreaterThan(50);
  });

  it('hanya route dalam daftar publik yang memakai publicCacheHeaders', () => {
    const offenders = routeFiles.filter(
      (file) => code(file).includes('publicCacheHeaders') && !PUBLIC_CACHEABLE.has(file),
    );
    expect(offenders).toEqual([]);
  });

  it('tidak ada route ter-cache publik yang membaca sesi pengguna', () => {
    const offenders: string[] = [];
    for (const file of PUBLIC_CACHEABLE) {
      const source = code(file);
      const hit = SESSION_MARKERS.find((marker) => source.includes(marker));
      if (hit) offenders.push(`${file} memakai ${hit}`);
    }
    expect(offenders).toEqual([]);
  });

  it('setiap berkas dalam daftar publik memang ada dan benar-benar memasang header', () => {
    for (const file of PUBLIC_CACHEABLE) {
      const full = path.join(REPO_ROOT, file);
      expect(fs.existsSync(full), `${file} tidak ada`).toBe(true);
      // Juga tanpa komentar: route yang hanya MENYEBUT header di prosa belum memasangnya.
      expect(code(file), `${file} tidak memasang header`).toContain('publicCacheHeaders');
    }
  });
});

describe('publicCacheHeaders', () => {
  it('menahan cache peramban tapi mengizinkan cache CDN', () => {
    const headers = publicCacheHeaders(300);
    expect(headers['Cache-Control']).toBe('public, max-age=0');
    expect(headers['CDN-Cache-Control']).toBe(
      'public, s-maxage=300, stale-while-revalidate=300',
    );
  });

  it('memakai jendela stale terpisah bila diberikan', () => {
    expect(publicCacheHeaders(60, 86_400)['CDN-Cache-Control']).toBe(
      'public, s-maxage=60, stale-while-revalidate=86400',
    );
  });

  it('membulatkan dan menjaga nilai tetap non-negatif', () => {
    expect(publicCacheHeaders(-5, 10.9)['CDN-Cache-Control']).toBe(
      'public, s-maxage=0, stale-while-revalidate=10',
    );
  });

  it('tidak pernah menyajikan langit-langit kesegaran yang lebih panjang dari irama cron pengisinya', () => {
    // Cron market-pulse dan breakout-scan berjalan tiap 5 menit selama jam bursa.
    expect(CDN_FRESHNESS_SEC.MARKET_PULSE).toBeLessThanOrEqual(300);
    expect(CDN_FRESHNESS_SEC.LENS_RADAR).toBeLessThanOrEqual(300);
    // Cron macro berjalan sejam sekali.
    expect(CDN_FRESHNESS_SEC.MACRO).toBeLessThanOrEqual(3600);
  });
});
