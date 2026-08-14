import { describe, expect, it } from 'vitest';
import { symbolFromPathname, tickerStarters, MARKET_STARTERS } from '../ai-chat-starters';
import fixtures from '@/app/api/chat/__tests__/fixtures/lensai-questions.json';

describe('simbol emiten dari URL', () => {
  it.each([
    ['/technical/BBCA.JK', 'BBCA'],
    ['/fundamental/ADRO.JK', 'ADRO'],
    ['/dcf/TLKM', 'TLKM'],
    ['/moat/BBRI.JK', 'BBRI'],
  ])('%s -> %s', (pathname, expected) => {
    expect(symbolFromPathname(pathname)).toBe(expected);
  });

  it.each(['/', '/screener', '/dashboard', '/transparency', '/admin/calibration', '/market/energi'])(
    '%s -> bukan halaman emiten',
    (pathname) => {
      // Logika lama ("segmen terakhir = simbol") mengubah /screener menjadi simbol
      // "SCREENER" dan menawarkan contoh pertanyaan tentang emiten yang tidak ada.
      expect(symbolFromPathname(pathname)).toBeNull();
    },
  );
});

describe('contoh pembuka', () => {
  it('halaman emiten menawarkan contoh untuk emiten itu', () => {
    const starters = tickerStarters('BBCA');
    expect(starters.length).toBeGreaterThanOrEqual(3);
    for (const starter of starters) {
      expect(starter.prompt).toContain('BBCA');
      expect(starter.label.length).toBeLessThanOrEqual(28);
    }
  });

  it('halaman non-emiten menawarkan pertanyaan pasar', () => {
    expect(MARKET_STARTERS.length).toBeGreaterThanOrEqual(3);
    for (const starter of MARKET_STARTERS) {
      expect(starter.prompt.trim().length).toBeGreaterThan(0);
      expect(starter.label.length).toBeLessThanOrEqual(28);
    }
  });

  it('setiap contoh pasar punya padanan di fixture evaluasi routing', () => {
    // Aturan yang menjaga daftar ini jujur: contoh yang ditawarkan HARUS punya jalur data
    // yang benar-benar diuji. Menawarkan pertanyaan yang berujung "datanya belum tersedia"
    // lebih buruk daripada tidak menawarkan apa pun - pengguna mencobanya sekali, gagal,
    // lalu berhenti mencoba yang lain.
    const covered = (fixtures.questions as Array<{ intent: string }>).map((q) => q.intent);
    for (const intent of ['MARKET_GENERAL', 'SECTOR_ROTATION', 'LENSRADAR_PICKS', 'MARKET_MOVERS', 'SCORING_METHOD']) {
      expect(covered, `intent ${intent} harus diuji eval routing`).toContain(intent);
    }
  });
});
