import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Audit rute navigasi dijalankan sebagai gerbang CI, bukan sebagai tes - jadi yang
 * dijaga di sini ada dua hal yang sama pentingnya:
 *
 * 1. PEMASANGANNYA. Skrip audit yang benar tapi tidak tersambung ke verify:prod MAUPUN
 *    ci.yml gagal secara senyap: ia tetap hijau saat dijalankan tangan dan tidak pernah
 *    menghentikan apa pun. Ini bukan kekhawatiran teoretis - sampai 13 September 2026
 *    `audit:menus` memang ada di verify:prod tapi TIDAK ada di daftar audit ci.yml,
 *    jadi selama berbulan-bulan ia hanya berjalan kalau ada yang mengetiknya sendiri.
 *
 * 2. KEMAMPUANNYA MEMERAHKAN. Gerbang yang tidak bisa gagal lebih buruk daripada tidak
 *    ada gerbang, karena ia memberi rasa aman. Kasus di bawah merusak target link pada
 *    salinan repo sementara lalu menuntut audit keluar dengan kode 1 - termasuk untuk
 *    `path:` di Sidebar, yang versi pertama pemindai ini lewatkan sepenuhnya.
 */

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'audit-navigation-routes.mjs');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const CI = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

/** Jalankan audit di cwd tertentu, kembalikan kode keluar dan keluarannya. */
function runAudit(cwd: string): { code: number; out: string } {
  try {
    const out = execFileSync('node', [SCRIPT], { cwd, encoding: 'utf8' });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/**
 * Salin hanya yang dibutuhkan audit (app/, components/) ke direktori sementara.
 * Lebih cepat dan lebih aman daripada menyunting repo sungguhan lalu memulihkannya -
 * kalau test gagal di tengah, repo kerja tidak ikut tertinggal dalam keadaan rusak.
 */
function makeFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'navaudit-'));
  for (const sub of ['app', 'components']) {
    fs.cpSync(path.join(ROOT, sub), path.join(dir, sub), { recursive: true });
  }
  return dir;
}

function patchFile(dir: string, rel: string, from: string, to: string): void {
  const target = path.join(dir, rel);
  const src = fs.readFileSync(target, 'utf8');
  expect(src).toContain(from);
  fs.writeFileSync(target, src.replace(from, to));
}

describe('audit rute navigasi: pemasangan', () => {
  it('punya entri skrip npm', () => {
    expect(pkg.scripts?.['audit:menus']).toBe('node scripts/audit-navigation-routes.mjs');
  });

  it('ikut di verify:prod', () => {
    expect(pkg.scripts?.['verify:prod']).toContain('npm run audit:menus');
  });

  it('ikut di gerbang CI', () => {
    // Tanpa baris ini gerbang hanya berjalan pada verify:prod manual, dan PR yang
    // memutus link navigasi lolos dengan seluruh check hijau.
    expect(CI).toContain('npm run audit:menus');
  });
});

// Batas 60 detik, bukan 5 detik bawaan: setiap kasus menyalin app/ + components/ lalu
// menjalankan proses node terpisah. Sendirian selesai beberapa detik, tapi saat suite
// penuh berjalan paralel ia lewat batas bawaan dan gagal sebagai "timeout" - kegagalan
// yang tidak ada hubungannya dengan navigasi dan menyesatkan siapa pun yang membacanya.
describe('audit rute navigasi: perilaku', () => {
  it('hijau pada kode saat ini', () => {
    const { code, out } = runAudit(ROOT);
    expect(out).toContain('PASS');
    expect(code).toBe(0);
  }, 60_000);

  it('memeriksa kedua lapis dengan jumlah yang masuk akal', () => {
    // Angka-angka ini penjaga pemindai, bukan target. Kalau salah satu jatuh drastis,
    // yang rusak adalah pemindainya - bukan berarti tidak ada link putus.
    const { out } = runAudit(ROOT);
    const primary = Number(/Lapis 1 \(navigasi utama\): (\d+) link/.exec(out)?.[1] ?? 0);
    const wide = Number(/Lapis 2 \(app\/ \+ components\/\): (\d+) target/.exec(out)?.[1] ?? 0);
    expect(primary).toBeGreaterThan(20);
    expect(wide).toBeGreaterThan(80);
    // Lapis 2 wajib lebih luas daripada lapis 1, kalau tidak ia tidak menambah apa pun.
    expect(wide).toBeGreaterThan(primary);
  }, 60_000);

  it('MERAH saat path: di Sidebar menunjuk rute yang tidak ada', () => {
    // Sidebar tidak memakai href sama sekali - ia mendeklarasikan path: di struktur data.
    // Versi pertama pemindai ini hanya mencari href= dan tetap hijau pada kasus ini.
    const dir = makeFixture();
    try {
      patchFile(dir, 'components/Sidebar.tsx', "path: '/market-pulse'", "path: '/market'");
      const { code, out } = runAudit(dir);
      expect(code).toBe(1);
      expect(out).toContain('/market');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('MERAH saat href di komponen biasa menunjuk rute yang tidak ada', () => {
    // Lapis yang ditambahkan 13 September 2026: CTA kartu, tautan footer, tombol
    // "Lihat semua" - sebelumnya tidak dijaga apa pun.
    const dir = makeFixture();
    try {
      patchFile(
        dir,
        'components/dashboard/DashboardFeatureGrid.tsx',
        'href="/screener"',
        'href="/screener-tidak-ada"',
      );
      const { code, out } = runAudit(dir);
      expect(code).toBe(1);
      expect(out).toContain('/screener-tidak-ada');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('TIDAK menuduh contoh href yang hanya ada di komentar', () => {
    // CLAUDE.md §2: berkas di repo ini menjelaskan dirinya dengan menulis contoh kode
    // di komentar. Satu tuduhan palsu membuat gerbangnya diabaikan dalam seminggu.
    const dir = makeFixture();
    try {
      const target = path.join(dir, 'components/MobileNav.tsx');
      fs.writeFileSync(
        target,
        `// contoh dokumentasi: <Link href="/rute-yang-tidak-ada" />\n` +
          `/* juga di blok: path: '/rute-blok-tidak-ada' */\n` +
          fs.readFileSync(target, 'utf8'),
      );
      const { code } = runAudit(dir);
      expect(code).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('MERAH kalau pemindainya sendiri berhenti menemukan apa pun', () => {
    // Penjaga jumlah (CLAUDE.md §2). Pemindai yang lulus tanpa memeriksa apa pun jauh
    // lebih berbahaya daripada pemindai yang merah.
    const dir = makeFixture();
    try {
      fs.rmSync(path.join(dir, 'components'), { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, 'components'));
      const { code, out } = runAudit(dir);
      expect(code).toBe(1);
      expect(out).toContain('pemindai rusak');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('menerima segmen rute dinamis, bukan menuduhnya putus', () => {
    // /technical/BBCA.JK ditangani app/technical/[symbol]/page.tsx. Pemindai yang
    // membandingkan string mentah akan menandai setiap tautan emiten sebagai pelanggar.
    const nav = fs.readFileSync(path.join(ROOT, 'components', 'MobileNav.tsx'), 'utf8');
    expect(nav).toContain('/technical/BBCA.JK');
    expect(fs.existsSync(path.join(ROOT, 'app', 'technical', '[symbol]', 'page.tsx'))).toBe(true);
    expect(runAudit(ROOT).code).toBe(0);
  }, 60_000);

  it('menuntut pembuangan komentar dan normalisasi pemisah path di sumbernya', () => {
    // Dua jebakan CLAUDE.md §2 yang tidak terlihat dari keluaran audit saat hijau:
    // tanpa stripComments gerbangnya menuduh prosa, dan tanpa normalisasi path ia
    // menandai SETIAP berkas di Windows sehingga tidak memeriksa apa pun.
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toContain('stripComments');
    expect(src).toContain('path.sep');
  });
});
