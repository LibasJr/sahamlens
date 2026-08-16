import { describe, expect, it } from 'vitest';
import { classifyChatIntent } from '../chat-intent';
import { resolveChatDate } from '../chat-date';

// Pemisahan OWNERSHIP_FLOW dari FLOW_BROKER adalah inti test ini.
//
// FLOW_TERMS memuat "asing" dan "foreign". Tanpa urutan pemeriksaan yang benar,
// "kepemilikan asing BBRI berapa?" tertangkap FLOW_BROKER, dan LensAI
// menjawabnya dengan proksi arus dana dari OHLCV - angka yang sama sekali bukan
// yang ditanyakan, disajikan seolah itu jawabannya.

function classify(prompt: string, tickerCount = 1) {
  return classifyChatIntent({
    prompt,
    date: resolveChatDate(prompt, []),
    tickerCount,
    hasHistory: false,
    history: [],
  });
}

describe('routing pertanyaan kepemilikan', () => {
  it.each([
    'bagaimana ownership flow BBRI?',
    'kepemilikan asing BBRI berapa?',
    'berapa porsi asing di TLKM?',
    'komposisi kepemilikan BBCA gimana?',
    'foreign ownership ASII berapa persen?',
    'persentase lokal BMRI berapa?',
  ])('%j -> OWNERSHIP_FLOW', (prompt) => {
    expect(classify(prompt).intent).toBe('OWNERSHIP_FLOW');
  });
});

describe('pertanyaan broker/bandarmologi TIDAK ikut terseret', () => {
  it.each([
    'lagi diakumulasi bandar gak?',
    'broker mana yang net buy?',
    'gimana bandarmologi BBRI?',
  ])('%j -> FLOW_BROKER', (prompt) => {
    expect(classify(prompt).intent).toBe('FLOW_BROKER');
  });
});
