import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../route';

// BUG FIX (2026-08-05, laporan user): tanya soal saham spesifik sambil context halaman
// masih bilang "sedang melihat INDEKS IHSG" bikin jawaban nyasar bahas IHSG, karena rule
// #10 di prompt bilang "kalau Data Referensi menandai topik sebagai indeks, jawab dari
// sudut pandang pasar keseluruhan" - framing context yang basi tetap memicu rule itu.
const indexContext = 'Pengguna saat ini sedang melihat INDEKS IHSG (BUKAN saham/emiten individual...).';

describe('buildSystemPrompt', () => {
  it('tanpa mentionedTicker: tidak ada catatan override (perilaku lama tidak berubah)', () => {
    const prompt = buildSystemPrompt(indexContext, false, '', null);
    expect(prompt).not.toContain('PENTING - Topik Pertanyaan Ini');
  });

  it('dengan mentionedTicker: catatan override menyebut ticker itu secara eksplisit', () => {
    const prompt = buildSystemPrompt(indexContext, false, '', 'BJBR');
    expect(prompt).toContain('PENTING - Topik Pertanyaan Ini');
    expect(prompt).toContain('kode saham "BJBR"');
    expect(prompt).toContain('Topik SEKARANG adalah saham BJBR');
  });

  it('catatan override ditulis SEBELUM blok Data Referensi (prioritas instruksi)', () => {
    const prompt = buildSystemPrompt(indexContext, false, '', 'BJBR');
    const overrideIdx = prompt.indexOf('PENTING - Topik Pertanyaan Ini');
    const dataRefIdx = prompt.indexOf('## Data Referensi');
    expect(overrideIdx).toBeGreaterThan(-1);
    expect(overrideIdx).toBeLessThan(dataRefIdx);
  });

  it('override tetap menyertakan instruksi eksplisit mengabaikan framing indeks yang bertentangan', () => {
    const prompt = buildSystemPrompt(indexContext, false, '', 'BJBR');
    expect(prompt).toContain('ABAIKAN framing itu');
    expect(prompt).toContain('JANGAN bahas IHSG atau saham lain kecuali pengguna memang menanyakannya');
  });

  it('MODEL_UNVALIDATED melarang LensAI mengubah sinyal BUY/SELL menjadi rekomendasi actionable', () => {
    const prompt = buildSystemPrompt('Konsensus: BUY', false, '', 'DGWG');
    expect(prompt).toContain('LensScore validated: TIDAK');
    expect(prompt).toContain('Recommendation actionable: DINONAKTIFKAN');
    expect(prompt).toContain('Sinyal model: BUY');
    expect(prompt).toContain('BUKAN rekomendasi transaksi');
  });

});
