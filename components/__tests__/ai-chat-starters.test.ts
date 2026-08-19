import { describe, expect, it } from 'vitest';
import { symbolFromPathname, tickerStarters, MARKET_STARTERS } from '../ai-chat-starters';
import fixtures from '@/app/api/chat/__tests__/fixtures/lensai-questions.json';
import { classifyChatIntent } from '@/modules/ai/chat/chat-intent';

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

  /**
   * Gerbang yang sebenarnya menjaga janji berkas starter: "setiap contoh HARUS punya
   * jalur data nyata". Pemeriksaan fixture di bawah hanya memastikan INTENT-nya diuji;
   * ia tidak pernah melihat kalimat yang benar-benar dikirim tombolnya. Jadi contoh
   * yang ditulis ulang - persis yang terjadi saat label diubah menjadi pertanyaan -
   * bisa berhenti terklasifikasi tanpa satu pun test memerah.
   *
   * Di sini prompt aslinya dijalankan lewat classifier produksi. UNKNOWN dan
   * OUT_OF_SCOPE berarti tombolnya akan menjawab "belum bisa saya bantu" - kegagalan
   * yang paling mahal, karena pengguna mencobanya pada percobaan pertamanya.
   */
  const INTENT_TANPA_DATA = ['UNKNOWN', 'OUT_OF_SCOPE', 'SMALL_TALK'];

  it('setiap contoh emiten benar-benar terklasifikasi ke intent berdata', () => {
    for (const starter of tickerStarters('BBCA')) {
      const { intent } = classifyChatIntent({ prompt: starter.prompt, tickerCount: 1, hasHistory: false, history: [] });
      expect(INTENT_TANPA_DATA, `"${starter.prompt}" -> ${intent}`).not.toContain(intent);
    }
  });

  it('setiap contoh pasar benar-benar terklasifikasi ke intent berdata', () => {
    for (const starter of MARKET_STARTERS) {
      const { intent } = classifyChatIntent({ prompt: starter.prompt, tickerCount: 0, hasHistory: false, history: [] });
      expect(INTENT_TANPA_DATA, `"${starter.prompt}" -> ${intent}`).not.toContain(intent);
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
