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
    'Intraday Validation Lab itu apa?',
    'cara pakai TP/CL Validation Lab gimana?',
    'LensRadar Calibration Lab fungsinya apa?',
    'Fundamental Backfill cara pakainya bagaimana?',
    'Financial Integrity & Adoption Gate itu buat apa?',
    'Macro PIT & Valuation Inputs itu apa?',
    'Bank Fundamentals Evidence cara kerjanya gimana?',
    'Ownership Flow Validation Lab itu apa?',
    'Broker Summary fungsinya apa?',
    'Kesehatan Operasional menu apa?',
    'Feedback LensAI gunanya apa?',
  ];

  it.each(productQuestions)('merutekan product-help: %s', (prompt) => {
    expect(classify(prompt).intent).toBe('SAHAMLENS_PRODUCT_HELP');
  });

  it('membedakan fokus Intraday dari calibration T+20', () => {
    const block = getFocusedMenuKnowledge('cara pakai Intraday Validation Lab?');
    expect(block).toContain('Intraday Validation Lab');
    expect(block).toContain('15/30/60 menit');
    expect(block).toContain('terpisah dari T+20');
  });

  it('membedakan Ownership Flow dari broker transaction', () => {
    const block = getFocusedMenuKnowledge('Ownership Flow itu apa?');
    expect(block).toContain('Ownership Flow');
    expect(block).toContain('Bukan broker flow');
    expect(block).toContain('tidak ikut LensScore');
  });

  it('menjelaskan Broker Summary tidak otomatis memengaruhi LensScore', () => {
    const block = getFocusedMenuKnowledge('fungsi Broker Summary apa?');
    expect(block).toContain('Broker Summary');
    expect(block).toContain('belum memengaruhi LensScore');
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

  it('tidak mencampur TP/CL Validation Lab dengan LensTechnical', () => {
    const answer = getDeterministicProductHelpResponse('cara pakai TP/CL Validation Lab?');
    expect(answer).toContain('TP/CL Validation Lab');
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
