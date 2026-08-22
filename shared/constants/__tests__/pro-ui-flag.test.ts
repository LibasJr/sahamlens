import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRO_UI_ENABLED } from '../access';

/**
 * Fitur Pro BELUM ADA (keputusan produk 2026-08-23). Seluruh penyebutannya ke pengguna
 * dimatikan lewat satu konstanta, dan test ini menjaga dua hal berbeda:
 *
 *   1. default-nya benar-benar MATI - kalau seseorang mengubahnya jadi opt-out,
 *      Pro akan menyala di produksi tanpa ada yang memutuskan;
 *   2. tidak ada ajakan Pro baru yang lolos tanpa gerbang - ini yang paling mudah
 *      terjadi, karena menambah tombol "Upgrade" terasa seperti pekerjaan sepele.
 */

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const ROOT = path.join(__dirname, '..', '..', '..');
const files = ['app', 'components']
  .flatMap((dir) => walk(path.join(ROOT, dir)))
  .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`));

/** Penanda ajakan Pro yang benar-benar dirender ke pengguna. Definisi komponennya
 * sendiri dikecualikan - PromoUpgradeModal.tsx memang berisi kata-kata itu, dan
 * menggerbangnya di sana justru salah tempat: yang harus digerbang pemanggilnya. */
const CTA_MARKERS = ['Upgrade ke Pro', '<PromoUpgradeModal', '<PaywallModal'];
const DEFINISI_KOMPONEN = ['components/PromoUpgradeModal.tsx', 'components/PaywallModal.tsx'];

/**
 * BELUM DIGERBANG, DAN ITU DISENGAJA - bukan daftar yang boleh ditumbuhkan.
 *
 * Dua belas berkas ini merender <PaywallModal> sebagai gerbang "batas terlampaui" pada
 * halaman fitur, bukan sebagai ajakan berlangganan yang muncul sendiri. Pemicunya
 * bergantung pada entitlement, dan selama TESTING_OPEN_ACCESS masih true tidak ada
 * pengguna yang mencapainya.
 *
 * Menggerbangnya juga adalah keputusan produk tersendiri - menyentuh dua belas halaman
 * fitur sekaligus jauh melampaui "sembunyikan Pro di profil" yang diminta pada
 * 2026-08-23, jadi dicatat di sini alih-alih dikerjakan diam-diam.
 *
 * Daftar ini ada supaya gerbangnya tetap jujur: ia MELIHAT berkas-berkas ini dan
 * menyatakannya dikecualikan. Menambah ajakan Pro BARU di berkas lain tetap gagal.
 * Kalau nanti diputuskan menggerbang halaman fitur juga, hapus entrinya dari sini -
 * jangan pernah menambah entri baru untuk meloloskan pekerjaan.
 */
const DIKECUALIKAN_SEMENTARA = [
  'app/backtest/page.tsx',
  'app/breakout-radar/page.tsx',
  'app/calendar/page.tsx',
  'app/compare/page.tsx',
  'app/dividend/page.tsx',
  'app/fundamental/page.tsx',
  'app/market-pulse/page.tsx',
  'app/recommendations/page.tsx',
  'app/watchlist/page.tsx',
  'components/HomeWorkspace.tsx',
  'components/dashboard/DashboardFooterActions.tsx',
  'components/dashboard/DashboardLoadStates.tsx',
];

const ungated: string[] = [];
let filesWithCta = 0;
for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (DEFINISI_KOMPONEN.includes(rel)) continue;
  const source = stripComments(fs.readFileSync(file, 'utf8'));
  if (!CTA_MARKERS.some((m) => source.includes(m))) continue;
  filesWithCta += 1;
  if (DIKECUALIKAN_SEMENTARA.includes(rel)) continue;
  if (!source.includes('PRO_UI_ENABLED')) ungated.push(rel);
}

describe('tampilan Pro dimatikan sampai ada keputusan sebaliknya', () => {
  it('default MATI - menyalakannya wajib eksplisit lewat env', () => {
    expect(PRO_UI_ENABLED).toBe(false);
  });

  it('pemindainya benar-benar menemukan ajakan Pro untuk diperiksa', () => {
    // Kalau angka ini jatuh ke nol, pemindainya yang rusak - bukan berarti tidak ada bug.
    expect(files.length).toBeGreaterThan(50);
    expect(filesWithCta).toBeGreaterThanOrEqual(3);
  });

  it('setiap ajakan Pro yang dirender digerbang PRO_UI_ENABLED', () => {
    expect(ungated).toEqual([]);
  });

  /** Daftar pengecualian yang menunjuk berkas yang sudah tidak ada akan LULUS tanpa
   * memeriksa apa pun - kegagalan diam yang lebih buruk daripada gerbang merah. */
  it('setiap entri daftar pengecualian masih menunjuk berkas yang nyata', () => {
    const hilang = DIKECUALIKAN_SEMENTARA.filter(
      (rel) => !fs.existsSync(path.join(ROOT, rel)),
    );
    expect(hilang).toEqual([]);
  });
});
