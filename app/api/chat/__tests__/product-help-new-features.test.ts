import { describe, expect, it } from 'vitest';
import { classifyChatIntent } from '../chat-intent';
import { resolveChatDate } from '../chat-date';
import { getFocusedMenuKnowledge } from '../menu-focus-knowledge';
import { getDeterministicProductHelpResponse } from '@/modules/ai/chat/product-help';

const classify = (prompt: string) => classifyChatIntent({
  prompt,
  date: resolveChatDate(prompt, []),
  tickerCount: 0,
  hasHistory: false,
  history: [],
});

describe('LensAI product help - fitur baru SahamLens', () => {
  const productQuestions = [
    'Uji Intraday itu apa?',
    'cara pakai Uji Target & Cut Loss gimana?',
    'Uji Akurasi LensRadar fungsinya apa?',
    'Impor Histori Fundamental cara pakainya bagaimana?',
    'Pemeriksaan Data Keuangan itu buat apa?',
    'Bukti Data Makro itu apa?',
    'Bukti Fundamental Bank cara kerjanya gimana?',
    'Uji Arus Kepemilikan itu apa?',
    'Broker Summary fungsinya apa?',
    'Kesehatan Operasional menu apa?',
    'Masukan LensAI gunanya apa?',
    'Daily Picks itu apa?',
    'Transparansi model itu buat apa?',
    'Decision Lab cara pakainya bagaimana?',
    'Infographic Studio gunanya apa?',
    'Coverage dan provenance maksudnya apa di SahamLens?',
  ];

  it.each(productQuestions)('merutekan product-help: %s', (prompt) => {
    expect(classify(prompt).intent).toBe('SAHAMLENS_PRODUCT_HELP');
  });

  it('membedakan fokus Intraday dari calibration T+20', () => {
    const block = getFocusedMenuKnowledge('cara pakai Uji Intraday?');
    expect(block).toContain('Uji Intraday');
    expect(block).toContain('15/30/60 menit');
    expect(block).toContain('terpisah dari T+20');
  });

  it('membedakan Ownership Flow dari broker transaction', () => {
    const block = getFocusedMenuKnowledge('Arus Kepemilikan itu apa?');
    expect(block).toContain('Arus Kepemilikan');
    expect(block).toContain('Bukan broker flow');
    expect(block).toContain('tidak ikut LensScore');
  });

  it('menjelaskan Broker Summary tidak otomatis memengaruhi LensScore', () => {
    const block = getFocusedMenuKnowledge('fungsi Broker Summary apa?');
    expect(block).toContain('Broker Summary');
    expect(block).toContain('belum memengaruhi LensScore');
  });

  it('menjelaskan transparansi publik tanpa mengarahkannya ke panel internal saja', () => {
    const answer = getDeterministicProductHelpResponse('Transparansi model itu buat apa?');
    expect(answer).toContain('Transparansi');
    expect(answer).toContain('aman dibuka publik');
    expect(answer).toContain('detail raw sample tetap ada di admin');
  });

  it('menjelaskan Daily Picks sebagai bagian dari LensRadar yang research-only', () => {
    const answer = getDeterministicProductHelpResponse('Daily Picks itu apa?');
    expect(answer).toContain('LensRadar');
    expect(answer).toContain('peluang harian');
    expect(answer).toContain('research-only');
  });

  it('menjelaskan Decision Lab sebagai paper-only dan bukan order nyata', () => {
    const answer = getDeterministicProductHelpResponse('Decision Lab cara pakainya bagaimana?');
    expect(answer).toContain('Simulasi Keputusan AI');
    expect(answer).toContain('paper-only');
    expect(answer).toContain('tidak mengeksekusi order nyata');
  });

  it.each([
    'jelaskan semua fitur yang ada',
    'fiturnya apa saja?',
    'LensAI bisa apa?',
  ])('merutekan permintaan katalog fitur tanpa bergantung provider: %s', (prompt) => {
    expect(classify(prompt).intent).toBe('SAHAMLENS_PRODUCT_HELP');
    const answer = getDeterministicProductHelpResponse(prompt);
    expect(answer).toContain('Fitur pengguna');
    expect(answer).toContain('LensTechnical');
    expect(answer).toContain('LensScanner');
    expect(answer).toContain('Lab riset dan admin');
  });

  it('memberi jawaban operasional fitur walau provider AI tidak dipakai', () => {
    const answer = getDeterministicProductHelpResponse('cara pakai LensScanner?');
    expect(answer).toContain('LensScanner');
    expect(answer).toContain('Cara pakai');
    expect(answer).toContain('Hasil yang dibaca');
    expect(answer).toContain('Batasan');
  });

  it('tidak mencampur Uji Target & Cut Loss dengan LensTechnical', () => {
    const answer = getDeterministicProductHelpResponse('cara pakai Uji Target & Cut Loss?');
    expect(answer).toContain('Uji Target & Cut Loss');
    expect(answer).toContain('expectancy');
    expect(answer).not.toContain('LensTechnical');
  });

  it.each([
    'Maksud nya menentukan TP/CL',
    'Kalau menentukan tp cl',
    'cara nentuin take profit dan cut loss',
  ])('menjawab metodologi TP/CL tanpa meminta ticker: %s', (prompt) => {
    expect(classify(prompt).intent).toBe('SAHAMLENS_PRODUCT_HELP');
    const answer = getDeterministicProductHelpResponse(prompt);
    expect(answer).toContain('Penentuan TP/CL');
    expect(answer).toContain('Wilder ATR');
    expect(answer).toContain('tidak perlu ticker');
  });
});
