import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { perspectiveTabsFor, stockCodeFor } from '../StockPerspectiveNav';

/**
 * "Technical, Fundamental, Flow, dan Valuation terasa seperti satu produk" adalah salah
 * satu syarat selesai redesign v2. Yang mewujudkannya cuma satu hal: setiap halaman
 * emiten benar-benar merender navigasinya. Kalau satu halaman lupa, pengguna kembali
 * merasa berpindah aplikasi di situ - dan tidak ada test lain yang akan menyadarinya.
 */

const ROOT = path.resolve(__dirname, '../..');

/** Halaman/komponen yang WAJIB menyalakan navigasi lintas-sudut-pandang. */
const PERMUKAAN_EMITEN = [
  'app/technical/[symbol]/ClientHeader.tsx',
  'app/fundamental/page.tsx',
  'app/dashboard/page.tsx',
  'components/dashboard/DashboardLoadStates.tsx',
  // Satu shell ini melayani /dcf, /moat, /earnings, /dividend, dan /pattern sekaligus.
  'components/TickerAnalysisShell.tsx',
];

/** Halaman yang mengirim kode saham ke Header sebagai konteks PENCARIAN, bukan sebagai
 *  emiten yang sedang dianalisis. Menyalakan navigasi di sini akan menjanjikan hubungan
 *  antar halaman yang sebenarnya tidak ada. */
const BUKAN_PERMUKAAN_EMITEN = [
  'app/screener/page.tsx',
  'app/macro/page.tsx',
  'app/ownership-flow/page.tsx',
];

function baca(file: string): string {
  const full = path.join(ROOT, file);
  expect(fs.existsSync(full), `${file} hilang - pindahkan gerbangnya, jangan biarkan lulus tanpa memeriksa`).toBe(true);
  return fs.readFileSync(full, 'utf8');
}

describe('navigasi lintas-sudut-pandang emiten', () => {
  it.each(PERMUKAAN_EMITEN)('%s menyalakan stockNav', (file) => {
    expect(baca(file)).toContain('stockNav');
  });

  it.each(BUKAN_PERMUKAAN_EMITEN)('%s TIDAK menyalakannya', (file) => {
    expect(baca(file)).not.toContain('stockNav');
  });

  it('/dashboard tetap punya jalur bernama ke halaman analisis emiten', () => {
    // Begitu tab "Technical" menjadi tab AKTIF di /dashboard, ia berhenti menjadi jalan
    // keluar ke /technical/[symbol] - jalur itu harus ada di tempat lain, dinamai apa
    // adanya. Tanpa gerbang ini, menghapus kartunya tidak akan menggagalkan apa pun dan
    // /dashboard diam-diam menjadi halaman buntu.
    expect(baca('components/dashboard/DashboardFooterActions.tsx')).toContain('/technical/${stockCode}.JK');
  });

  it('Header hanya merendernya saat diminta eksplisit', () => {
    const header = baca('components/Header.tsx');
    expect(header).toContain('stockNav = false');
    expect(header).toContain('<StockPerspectiveNav');
  });
});

describe('kode emiten untuk navigasi', () => {
  it.each([
    ['BBCA', 'BBCA'],
    ['BBCA.JK', 'BBCA'],
    ['bbca.jk', 'BBCA'],
    ['  TLKM  ', 'TLKM'],
  ])('%s -> %s', (input, expected) => {
    expect(stockCodeFor(input)).toBe(expected);
  });

  it.each(['IHSG', 'LQ45', 'JKSE', '^JKSE', '', 'ANTM.JK.JK', 'TOOLONG', 'ABC'])(
    '%s bukan emiten - navigasinya tidak boleh muncul',
    (input) => {
      // Indeks tidak punya fundamental perusahaan, DCF, maupun catatan Net Foreign
      // Buy/Sell di Bursa. Menawarkan tabnya akan menuntun ke halaman yang pasti kosong.
      expect(stockCodeFor(input)).toBeNull();
    },
  );

  it('null/undefined aman', () => {
    expect(stockCodeFor(null)).toBeNull();
    expect(stockCodeFor(undefined)).toBeNull();
  });
});

/**
 * UTANG 5, catatan redesign v2: `/dashboard` merender navigasi sudut pandang tetapi TIDAK
 * ADA SATU PUN tab yang menyala - empat tab mati sekaligus terbaca seperti navigasi rusak,
 * bukan seperti "kamu sedang di suatu tempat".
 *
 * Yang membuatnya membingungkan bukan sekadar tab mati: sidebar menamai `/dashboard`
 * "LensTechnical" (components/Sidebar.tsx), yaitu NAMA YANG SAMA dengan tab pertama.
 * Halaman bernama Technical dengan tab Technical yang mati.
 *
 * Menyalakannya saja tidak cukup - itu masalah yang dicatat aslinya: tab aktif yang
 * ketika diklik memindahkan pengguna ke halaman LAIN (`/technical/[symbol]`) adalah
 * kontradiksi. Jadi yang dijaga di sini adalah dua-duanya sekaligus.
 */
describe('tab aktif navigasi sudut pandang', () => {
  it('menyala mengikuti halaman yang sedang dibuka', () => {
    const aktifDi = (pathname: string) =>
      perspectiveTabsFor('BBCA', pathname).find((tab) => tab.active)?.id ?? null;

    expect(aktifDi('/technical/BBCA.JK')).toBe('technical');
    expect(aktifDi('/dashboard')).toBe('technical');
    expect(aktifDi('/fundamental')).toBe('fundamental');
    expect(aktifDi('/dcf')).toBe('valuation');
  });

  it('tidak pernah menyalakan lebih dari satu tab', () => {
    const halaman = ['/technical/BBCA.JK', '/dashboard', '/fundamental', '/dcf', '/moat', '/earnings', '/dividend', '/pattern'];
    for (const pathname of halaman) {
      const aktif = perspectiveTabsFor('BBCA', pathname).filter((tab) => tab.active);
      expect(aktif.length, `${pathname} menyalakan ${aktif.length} tab`).toBeLessThanOrEqual(1);
    }
  });

  it('alat emiten tetap tanpa tab aktif - mereka bukan sudut pandang', () => {
    // /moat, /earnings, /dividend, dan /pattern memakai shell yang sama dan ikut
    // merender navigasi ini, tapi mereka Tools (sidebar), bukan salah satu dari empat
    // sudut pandang. Nol tab menyala di sana JUJUR: "kamu sedang di alat, ini empat
    // sudut pandang emiten yang bisa dibuka". `/dashboard` berbeda justru karena
    // namanya sendiri adalah "LensTechnical".
    for (const pathname of ['/moat', '/earnings', '/dividend', '/pattern']) {
      expect(perspectiveTabsFor('BBCA', pathname).some((tab) => tab.active)).toBe(false);
    }
  });

  it('tab yang aktif tidak memindahkan pengguna ke halaman lain', () => {
    // Inti utang 5. Kalau suatu saat `/dashboard` menyalakan tab yang href-nya
    // `/technical/...`, gerbang ini merah - dan memang harus.
    for (const pathname of ['/technical/BBCA.JK', '/dashboard', '/fundamental', '/dcf']) {
      const aktif = perspectiveTabsFor('BBCA', pathname).find((tab) => tab.active);
      expect(aktif, `tidak ada tab aktif di ${pathname}`).toBeDefined();
      expect(aktif!.href.split(/[?#]/)[0], `tab aktif di ${pathname} membawa ke halaman lain`).toBe(
        pathname.startsWith('/technical') ? '/technical/BBCA.JK' : pathname,
      );
    }
  });

  it('membawa kode emiten yang sedang dilihat ke halaman tujuan', () => {
    const href = (id: string, pathname: string) =>
      perspectiveTabsFor('TLKM', pathname).find((tab) => tab.id === id)?.href;

    expect(href('technical', '/dashboard')).toBe('/dashboard?symbol=TLKM.JK');
    expect(href('technical', '/fundamental')).toBe('/technical/TLKM.JK');
    expect(href('fundamental', '/dashboard')).toBe('/fundamental?symbol=TLKM.JK');
    expect(href('valuation', '/dashboard')).toBe('/dcf?symbol=TLKM.JK');
  });

  it('Flow tetap jangkar di halaman technical, bukan rute tersendiri', () => {
    // `/ownership-flow` BUKAN padanannya - halaman itu komposisi kepemilikan KSEI
    // se-universe, bukan arus dana emiten ini.
    for (const pathname of ['/technical/BBCA.JK', '/dashboard', '/fundamental']) {
      const flow = perspectiveTabsFor('BBCA', pathname).find((tab) => tab.id === 'flow')!;
      expect(flow.href).toBe('/technical/BBCA.JK#lens-flow');
      expect(flow.active).toBe(false);
    }
  });

  it('bukan emiten berarti tidak ada tab sama sekali', () => {
    expect(perspectiveTabsFor(null, '/technical/IHSG')).toEqual([]);
    expect(perspectiveTabsFor('IHSG', '/technical/IHSG')).toEqual([]);
  });
});
