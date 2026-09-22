import { describe, expect, it } from 'vitest';
import { sanitizeChatAnswerText, stripToolCallSyntax } from '../chat-normalize';

describe('stripToolCallSyntax (laporan operator 2026-09-22: jawaban bocor sintaks tool-call)', () => {
  it('membuang blok <tool_call> utuh dan menyimpan jawaban di sekelilingnya', () => {
    const input =
      'Berikut pilihan LensRadar hari ini:\n\n<tool_call>\n{"name": "get_lens_radar_picks", "arguments": {"limit": 5}}\n</tool_call>\n\nTINS memimpin dengan LensScore 87.';
    expect(stripToolCallSyntax(input)).toBe(
      'Berikut pilihan LensRadar hari ini:\n\n\n\nTINS memimpin dengan LensScore 87.',
    );
  });

  it('membuang blok <function_call> yang tag penutupnya terpotong (stream putus)', () => {
    const input = 'Analisis TINS:\n<function_call>\n{"name": "get_technicals", "arguments": {"ticker": "TINS"';
    expect(stripToolCallSyntax(input)).toBe('Analisis TINS:\n');
  });

  it('membuang fenced code block berisi payload tool-call JSON', () => {
    const input =
      'Ringkasnya:\n\n```json\n{"name": "get_lens_radar_picks", "arguments": {"bucket": "daily"}}\n```\n\nAUTO menyusul di skor 80.';
    expect(stripToolCallSyntax(input)).not.toContain('"arguments"');
    expect(stripToolCallSyntax(input)).toContain('AUTO menyusul di skor 80.');
  });

  it('membiarkan fenced code block biasa (bukan tool-call) tetap tampil', () => {
    const input = 'Rumusnya:\n```text\nPER = Harga / EPS\n```';
    expect(stripToolCallSyntax(input)).toBe(input);
  });

  it('membuang token spesial <|...|>', () => {
    expect(stripToolCallSyntax('Jawaban <|im_end|> bersih')).toBe('Jawaban  bersih');
  });

  it('membuang tag yatim tanpa blok utuh', () => {
    expect(stripToolCallSyntax('Teks </tool_call> biasa')).toBe('Teks  biasa');
  });
});

describe('sanitizeChatAnswerText vs kebocoran tool-call', () => {
  it('jawaban murni tool-call diganti fallback, bukan string kosong', () => {
    const output = sanitizeChatAnswerText('<tool_call>\n{"name": "x", "arguments": {}}\n</tool_call>');
    expect(output.trim()).not.toBe('');
    expect(output).not.toContain('tool_call');
  });

  it('jawaban dengan <think> tetap dibersihkan seperti sebelumnya', () => {
    expect(sanitizeChatAnswerText('<think>cek data dulu</think>Jawaban siap')).toBe('Jawaban siap');
  });

  it('angka di dalam payload tool-call yang dibuang tidak dihitung ulang sebagai teks jawaban', () => {
    const output = sanitizeChatAnswerText(
      'LensScore 87.\n<tool_call>\n{"name": "f", "arguments": {"harga": 99999}}\n</tool_call>',
    );
    expect(output).toContain('LensScore 87.');
    expect(output).not.toContain('99999');
  });
});
