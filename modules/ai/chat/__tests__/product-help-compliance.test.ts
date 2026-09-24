import { describe, expect, it } from 'vitest';
import { getDeterministicProductHelpResponse } from '../product-help';

describe('product-help: pertanyaan kepatuhan (insiden "SahamLens apa legal?" 2026-09-23)', () => {
  it('pertanyaan legal dijawab langsung dengan jawaban kepatuhan, bukan daftar fitur', () => {
    const answer = getDeterministicProductHelpResponse('SahamLens apa legal?');
    expect(answer).not.toBeNull();
    expect(answer).toContain('alat riset pribadi');
    expect(answer).not.toContain('Fitur pengguna');
    expect(answer).not.toContain('LensMarket');
  });

  it('variasi pertanyaan kepatuhan juga tertangkap', () => {
    for (const q of ['aplikasi ini resmi gak?', 'SahamLens bohong atau bukan?', 'lensai amankah buat dipakai?']) {
      const answer = getDeterministicProductHelpResponse(q);
      expect(answer).toContain('Bukan sekuritas/broker');
    }
  });

  it('pertanyaan produk yang tidak cocok fitur manapun mengembalikan null (teruskan ke model)', () => {
    expect(getDeterministicProductHelpResponse('SahamLens bisa dipakai berapa perangkat?')).toBeNull();
  });

  it('pertanyaan daftar fitur tetap dijawab deterministik', () => {
    const answer = getDeterministicProductHelpResponse('SahamLens bisa apa saja?');
    expect(answer).toContain('Fitur pengguna');
  });

  it('pertanyaan fitur spesifik tetap dijawab deterministik', () => {
    const answer = getDeterministicProductHelpResponse('LensRadar itu apa?');
    expect(answer).toContain('**LensRadar**');
  });

  it('pertanyaan data pasar yang mengandung "apa saja" atau "riset" mengembalikan null agar diteruskan ke data router', () => {
    expect(getDeterministicProductHelpResponse('Cek jadwal Rups dan corporate action untuk Minggu depan apa saja')).toBeNull();
    expect(getDeterministicProductHelpResponse('saham apa saja yang bagus hari ini')).toBeNull();
    expect(getDeterministicProductHelpResponse('ada dividen apa saja minggu ini')).toBeNull();
    expect(getDeterministicProductHelpResponse('Saya mau riset BBCA')).toBeNull();
    expect(getDeterministicProductHelpResponse('analisis lengkap BBCA')).toBeNull();
  });
});
