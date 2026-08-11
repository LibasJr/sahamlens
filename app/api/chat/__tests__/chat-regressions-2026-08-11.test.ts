import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Regresi dari 4 keluhan nyata di screenshot pengguna (2026-08-11). Tiap blok di bawah
// menguji AKAR MASALAH yang berbeda - keempatnya kebetulan muncul di satu percakapan yang
// sama, tapi tidak ada satu pun yang menyebabkan yang lain.

vi.mock('@/modules/technical', async () => {
  const actual = await vi.importActual<any>('@/modules/technical');
  return { ...actual, fetchYahooHistory: vi.fn() };
});
vi.mock('@/modules/news', () => ({
  getMarketNews: vi.fn(),
  getStockNews: vi.fn(),
}));

import { resolveChatDate, todayJakartaKey } from '../chat-date';
import { classifyChatIntent } from '../chat-intent';
import { buildChatVerifiedData } from '../chat-data-router';
import { buildSystemPrompt } from '../build-system-prompt';
import { fetchYahooHistory } from '@/modules/technical';
import { getMarketNews } from '@/modules/news';

const CURRENT_DATE = { mode: 'CURRENT', requestedAsOf: null, invalidDate: null, incompleteDate: null, source: 'none' } as const;

function makeChart(currentPrice: number, previousClose: number | null) {
  return {
    // 30 bar datar - cukup untuk calculateRsi tidak melempar, nilainya tidak diuji di sini.
    history: Array.from({ length: 30 }, (_, i) => ({
      Date: `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      Open: 6300, High: 6320, Low: 6280, Close: 6300, Volume: 1000,
    })),
    currentPrice,
    regularMarketTime: null,
    previousClose,
  };
}

describe('akar masalah 1: persentase IHSG dikarang model', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mengirim perubahan poin & persen dari previousClose, bukan cuma level', async () => {
    // 6268.71 vs previousClose 6365.44 = -1.52%, angka yang dilihat pengguna di header.
    vi.mocked(fetchYahooHistory).mockResolvedValue(makeChart(6268.71, 6365.44) as any);

    const result = await buildChatVerifiedData({
      intent: 'MARKET_GENERAL', compareScope: 'GENERAL', requestedMetrics: [],
      tickers: [], date: CURRENT_DATE, prompt: 'gimana IHSG hari ini',
    });

    expect(result.verifiedBlock).toContain('-1.52%');
    expect(result.verifiedBlock).toContain('Penutupan sebelumnya: 6365.44');
    expect(result.verifiedBlock).toContain('Arah: TURUN');
  });

  it('menyatakan perubahan tidak tersedia (bukan diam) saat previousClose kosong', async () => {
    vi.mocked(fetchYahooHistory).mockResolvedValue(makeChart(6268.71, null) as any);

    const result = await buildChatVerifiedData({
      intent: 'MARKET_GENERAL', compareScope: 'GENERAL', requestedMetrics: [],
      tickers: [], date: CURRENT_DATE, prompt: 'gimana IHSG',
    });

    expect(result.verifiedBlock).toContain('Perubahan: tidak tersedia');
    expect(result.verifiedBlock).toContain('JANGAN mengarang');
  });
});

describe('akar masalah 2: tanggal hari ini dibaca sebagai query point-in-time masa lalu', () => {
  it('"Hari ini 11 Agustus 2026" (= hari ini) tetap CURRENT, tidak menuntut kode emiten', () => {
    const today = todayJakartaKey();
    const [year, month, day] = today.split('-').map(Number);
    const MONTHS = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];

    const resolved = resolveChatDate(`Hari ini ${day} ${MONTHS[month - 1]} ${year}`);

    expect(resolved.mode).toBe('CURRENT');
    expect(resolved.requestedAsOf).toBeNull();
  });

  it('tanggal masa lalu TETAP historical - perbaikan di atas tidak boleh melebar', () => {
    const resolved = resolveChatDate('gimana fundamental BBCA per 30 April 2025');

    expect(resolved.mode).toBe('HISTORICAL');
    expect(resolved.requestedAsOf).toBe('2025-04-30');
  });
});

describe('akar masalah 3: konteks follow-up soal IHSG terputus', () => {
  it('follow-up mewarisi MARKET_GENERAL dari turn IHSG sebelumnya', () => {
    const classification = classifyChatIntent({
      prompt: 'kok bisa gitu',
      date: CURRENT_DATE,
      tickerCount: 0,
      hasHistory: true,
      history: [{ role: 'user', content: 'Gimana IHSG hari ini' }],
    });

    expect(classification.intent).toBe('FOLLOW_UP');
    expect(classification.dataIntent).toBe('MARKET_GENERAL');
  });
});

describe('akar masalah 4: pertanyaan sentimen tidak punya jalur data', () => {
  beforeEach(() => vi.clearAllMocks());

  it('"ada sentimen apa kok skrg turun" masuk NEWS_SENTIMENT, bukan UNKNOWN', () => {
    const classification = classifyChatIntent({
      prompt: 'ada sentimen apa kok skrg turun',
      date: CURRENT_DATE,
      tickerCount: 0,
      hasHistory: true,
      history: [],
    });

    expect(classification.intent).toBe('NEWS_SENTIMENT');
  });

  it('berita pasar dijawab tanpa menuntut kode emiten', async () => {
    vi.mocked(getMarketNews).mockResolvedValue({
      items: [
        { title: 'Rupiah melemah ke level terendah', link: '', source: 'CNBC', pubDate: '2026-08-11T02:00:00.000Z', sentiment: 'NEGATIF', reason: '', intelligence: {} },
        { title: 'Bank sentral tahan suku bunga', link: '', source: 'Kontan', pubDate: '2026-08-11T01:00:00.000Z', sentiment: 'NETRAL', reason: '', intelligence: {} },
      ],
      sentimentSource: 'council-ai', intelligenceSource: 'council-ai', intelligenceBasis: 'headline-only',
    } as any);

    const result = await buildChatVerifiedData({
      intent: 'NEWS_SENTIMENT', compareScope: 'GENERAL', requestedMetrics: [],
      tickers: [], date: CURRENT_DATE, prompt: 'ada sentimen apa kok skrg turun',
    });

    expect(result.directResponse).toBeNull();
    expect(result.dataError).toBeNull();
    expect(result.verifiedBlock).toContain('Rupiah melemah');
    expect(result.verifiedBlock).toContain('0 positif, 1 netral, 1 negatif');
    // Batas kausalitas wajib ikut - sentimen judul bukan bukti penyebab pergerakan.
    expect(result.verifiedBlock).toContain('BUKAN');
  });

  it('pertanyaan pasar yang menanyakan SEBAB ikut menarik berita', async () => {
    vi.mocked(fetchYahooHistory).mockResolvedValue(makeChart(6268.71, 6365.44) as any);
    vi.mocked(getMarketNews).mockResolvedValue({
      items: [{ title: 'Aksi jual asing berlanjut', link: '', source: 'IDX', pubDate: '2026-08-11T03:00:00.000Z', sentiment: 'NEGATIF', reason: '', intelligence: {} }],
      sentimentSource: 'keyword-fallback', intelligenceSource: 'rule-fallback', intelligenceBasis: 'headline-only',
    } as any);

    const result = await buildChatVerifiedData({
      intent: 'MARKET_GENERAL', compareScope: 'GENERAL', requestedMetrics: [],
      tickers: [], date: CURRENT_DATE, prompt: 'IHSG kenapa turun',
    });

    expect(getMarketNews).toHaveBeenCalled();
    expect(result.verifiedBlock).toContain('Aksi jual asing berlanjut');
  });

  it('pertanyaan pasar biasa TIDAK menarik berita (hemat ~10 fetch RSS + 1 panggilan AI)', async () => {
    vi.mocked(fetchYahooHistory).mockResolvedValue(makeChart(6268.71, 6365.44) as any);

    await buildChatVerifiedData({
      intent: 'MARKET_GENERAL', compareScope: 'GENERAL', requestedMetrics: [],
      tickers: [], date: CURRENT_DATE, prompt: 'IHSG berapa sekarang',
    });

    expect(getMarketNews).not.toHaveBeenCalled();
  });
});

describe('bonus: sapaan waktu salah ("Selamat pagi" pukul 16.22)', () => {
  afterEach(() => vi.useRealTimers());

  it('menyuntikkan sapaan yang benar untuk jam sore Jakarta', () => {
    // 09:22 UTC = 16:22 WIB
    vi.useFakeTimers().setSystemTime(new Date('2026-08-11T09:22:00.000Z'));

    const prompt = buildSystemPrompt('', false);

    expect(prompt).toContain('Selamat sore');
    expect(prompt).not.toContain('yang BENAR untuk jam ini: "Selamat pagi"');
  });

  it('menyuntikkan sapaan pagi untuk jam pagi Jakarta', () => {
    // 01:00 UTC = 08:00 WIB
    vi.useFakeTimers().setSystemTime(new Date('2026-08-11T01:00:00.000Z'));

    expect(buildSystemPrompt('', false)).toContain('yang BENAR untuk jam ini: "Selamat pagi"');
  });
});
