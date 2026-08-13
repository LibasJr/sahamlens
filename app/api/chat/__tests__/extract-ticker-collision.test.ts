import { describe, expect, it } from 'vitest';
import { extractMentionedTickers } from '../extract-ticker';

/**
 * Kata Indonesia 4 huruf yang bentrok dengan kode emiten IDX.
 *
 * Ditemukan evaluasi jawaban end-to-end 2026-08-13, bukan dari kode: pertanyaan
 * "harga emas hari ini berapa?" dijawab sebagai analisis emiten EMAS, dan "saham Tesla
 * lagi naik gak?" sebagai analisis emiten NAIK. Dari 1.283 emiten, kata sehari-hari yang
 * bentrok termasuk BELI, NAIK, BAIK, AMAN, UANG, SATU, POLA, GUNA, EMAS, IKAN.
 *
 * Dampaknya lebih dalam daripada salah jawab: begitu router mengira ada emiten, gerbang
 * "pertanyaan tingkat pasar" ikut mati - termasuk penolakan jujur untuk aset di luar
 * cakupan SahamLens.
 */
describe('kata umum tidak boleh dibaca sebagai kode emiten', () => {
  it.each([
    'harga emas hari ini berapa?',
    'saham Tesla lagi naik gak?',
    'saya mau beli saham apa?',
    'yang aman buat pemula apa?',
    'polanya gimana?',
    'uang saya cukup gak buat 1 lot?',
  ])('%s -> tidak ada ticker', (prompt) => {
    expect(extractMentionedTickers(prompt)).toEqual([]);
  });
});

describe('kode emiten yang sungguhan tetap terbaca', () => {
  it('huruf besar - bentuk paling umum', () => {
    expect(extractMentionedTickers('BBCA gimana?')).toEqual(['BBCA']);
  });

  it('huruf kecil tetap jalan selama bukan kata umum', () => {
    // "bbca gimana" harus tetap bekerja - pengguna tidak selalu menekan shift.
    expect(extractMentionedTickers('bbca gimana?')).toEqual(['BBCA']);
  });

  it('KAPITAL menang atas daftar kata umum', () => {
    // Yang mengetik "EMAS" memang memaksudkan emitennya, bukan logam mulia.
    expect(extractMentionedTickers('EMAS gimana teknikalnya?')).toEqual(['EMAS']);
  });

  it('beberapa emiten sekaligus, urut kemunculan', () => {
    expect(extractMentionedTickers('BBRI dibanding BMRI gimana?')).toEqual(['BBRI', 'BMRI']);
  });

  it('kata umum tidak menghalangi emiten di kalimat yang sama', () => {
    expect(extractMentionedTickers('mau beli BBCA, bagus gak?')).toEqual(['BBCA']);
  });
});
