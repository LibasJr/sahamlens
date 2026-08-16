import { describe, expect, it } from 'vitest';
import { classifyChatIntent } from '../chat-intent';
import { resolveChatDate } from '../chat-date';
import { getFocusedMenuKnowledge } from '../menu-focus-knowledge';

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
});
