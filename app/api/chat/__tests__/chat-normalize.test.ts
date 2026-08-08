import { describe, expect, it } from 'vitest';
import { getDeterministicSmallTalkResponse, normalizeChatText } from '../chat-normalize';

describe('LensAI safe normalization', () => {
  it.each([
    ['halo', 'halo'],
    ['haloo', 'halo'],
    ['hallooo', 'halo'],
    ['hai', 'hai'],
    ['haiii', 'hai'],
    ['makasihhh', 'makasih'],
  ])('menormalisasi typo sosial %s -> %s', (input, expected) => {
    expect(normalizeChatText(input)).toBe(expected);
    expect(getDeterministicSmallTalkResponse(normalizeChatText(input))).toBeTruthy();
  });

  it('tidak mengubah token ticker/angka/tanggal untuk extraction karena normalisasi hanya dipakai klasifikasi', () => {
    const original = 'RSI BBCA per 2025-04-30 = 70?';
    expect(normalizeChatText(original)).toContain('bbca');
    expect(normalizeChatText(original)).toContain('2025-04-30');
    expect(normalizeChatText(original)).toContain('70');
  });

  it('sapaan yang sekaligus bertanya saham tidak masuk deterministic greeting', () => {
    expect(getDeterministicSmallTalkResponse(normalizeChatText('haloo ADRO bagus gak?'))).toBeNull();
  });
});
