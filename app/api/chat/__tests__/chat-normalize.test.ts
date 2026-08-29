import { describe, expect, it } from 'vitest';
import { getDeterministicSmallTalkResponse, normalizeChatText, sanitizeChatAnswerText } from '../chat-normalize';

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

  it('menghapus blok reasoning <think> dari jawaban provider', () => {
    expect(sanitizeChatAnswerText('<think>cek data dulu</think>Nilai wajar DGWG adalah Rp 448,83.'))
      .toBe('Nilai wajar DGWG adalah Rp 448,83.');
  });

  it('menghapus tag think kosong atau parsial yang bocor saat streaming', () => {
    expect(sanitizeChatAnswerText('<think></think>Jawaban siap')).toBe('Jawaban siap');
    expect(sanitizeChatAnswerText('</think>Jawaban siap')).toBe('Jawaban siap');
    expect(sanitizeChatAnswerText('Jawaban awal\n<think>reasoning belum selesai')).toBe('Jawaban awal\n');
  });
});
