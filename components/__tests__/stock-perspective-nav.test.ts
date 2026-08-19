import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stockCodeFor } from '../StockPerspectiveNav';

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
