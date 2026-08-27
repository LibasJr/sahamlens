import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { perspectiveTabsFor, stockCodeFor } from '../StockPerspectiveNav';

const ROOT = path.resolve(__dirname, '../..');

const PERMUKAAN_EMITEN = [
  'app/technical/[symbol]/ClientHeader.tsx',
  'app/fundamental/page.tsx',
  'app/dashboard/page.tsx',
  'components/dashboard/DashboardLoadStates.tsx',
  'components/TickerAnalysisShell.tsx',
];

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

describe('navigasi emiten', () => {
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

  it('bar konteks hanya memuat Technical dan Fundamental', () => {
    for (const pathname of ['/technical/BBCA.JK', '/dashboard', '/fundamental', '/dcf']) {
      expect(perspectiveTabsFor('BBCA', pathname).map((tab) => tab.id)).toEqual([
        'technical',
        'fundamental',
      ]);
    }
  });

  it('Flow, Valuation, dan Summary tidak muncul sebagai tab', () => {
    const ids = perspectiveTabsFor('BBCA', '/dashboard').map((tab) => tab.id);
    expect(ids).not.toContain('flow');
    expect(ids).not.toContain('valuation');
    expect(ids).not.toContain('summary');
  });

  it('tab aktif mengikuti Technical/Fundamental saja', () => {
    const aktifDi = (pathname: string) =>
      perspectiveTabsFor('BBCA', pathname).find((tab) => tab.active)?.id ?? null;

    expect(aktifDi('/technical/BBCA.JK')).toBe('technical');
    expect(aktifDi('/dashboard')).toBe('technical');
    expect(aktifDi('/fundamental')).toBe('fundamental');
    expect(aktifDi('/dcf')).toBeNull();
  });

  it('tab aktif tidak memindahkan pengguna ke halaman lain', () => {
    for (const pathname of ['/technical/BBCA.JK', '/dashboard', '/fundamental']) {
      const aktif = perspectiveTabsFor('BBCA', pathname).find((tab) => tab.active);
      expect(aktif, `tidak ada tab aktif di ${pathname}`).toBeDefined();
      expect(aktif!.href.split(/[?#]/)[0]).toBe(
        pathname.startsWith('/technical') ? '/technical/BBCA.JK' : pathname,
      );
    }
  });

  it('membawa kode emiten yang sedang dilihat', () => {
    const href = (id: string, pathname: string) =>
      perspectiveTabsFor('TLKM', pathname).find((tab) => tab.id === id)?.href;

    expect(href('technical', '/dashboard')).toBe('/dashboard?symbol=TLKM.JK');
    expect(href('technical', '/fundamental')).toBe('/technical/TLKM.JK');
    expect(href('fundamental', '/dashboard')).toBe('/fundamental?symbol=TLKM.JK');
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
      expect(stockCodeFor(input)).toBeNull();
    },
  );

  it('null/undefined aman', () => {
    expect(stockCodeFor(null)).toBeNull();
    expect(stockCodeFor(undefined)).toBeNull();
  });
});
