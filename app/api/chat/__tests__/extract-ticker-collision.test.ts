import { describe, expect, it } from 'vitest';
import { extractMentionedTickers, resolveConversationTickers } from '../extract-ticker';

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
 *
 * BUG FIX 2026-09-23: "baca" (Bank Capital Indonesia Tbk.) dan "buka" (Bukalapak.com Tbk.)
 * juga kode IDX yang valid. Follow-up "Buka itu dan baca" setelah user kirim URL PDF
 * salah dibaca sebagai komparasi BUKA vs BACA, padahal user cuma minta buka+baca link.
 * Kedua kata kini masuk stopwords; bentuk kapital penuh (BUKA/BACA) tetap dianggap ticker
 * karena menandakan niat eksplisit menyebut kode emiten.
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

  it('"Buka itu dan baca" (follow-up bukan ticker) -> tidak ada ticker', () => {
    // Insiden 2026-09-23: user kirim URL PDF, follow-up "Buka itu dan baca".
    // "Buka" = Bukalapak (BUKA), "baca" = Bank Capital (BACA) - keduanya kode IDX valid.
    expect(extractMentionedTickers('Buka itu dan baca')).toEqual([]);
  });

  it('bentuk kapital penuh BUKA/BACA tetap terbaca sebagai ticker (niat eksplisit)', () => {
    // Pengguna yang mengetik "BUKA" kapital penuh memang memaksudkan emitennya.
    expect(extractMentionedTickers('BUKA gimana teknikalnya?')).toEqual(['BUKA']);
    expect(extractMentionedTickers('analisis BACA fundamental')).toEqual(['BACA']);
  });

  it('follow-up "buka itu dan baca" dengan history URL -> tidak mewarikan ticker', () => {
    // URL di history, follow-up tidak menyebut emiten → resolved tickers harus nol.
    const result = resolveConversationTickers({
      prompt: 'Buka itu dan baca',
      history: [{ role: 'user', content: 'https://contoh.id/laporan.pdf' }],
    });
    expect(result).toEqual([]);
  });

  it('HTTP 403 pada link -> fetch gagal, bukan ticker palsu', () => {
    // Link di history, follow-up hanya "buka+baca" → tidak ada ticker, sistem
    // harusnya melaporkan kegagalan link, BUKAN komparasi BUKA vs BACA.
    const result = resolveConversationTickers({
      prompt: 'Buka itu dan baca',
      history: [{ role: 'user', content: 'https://dokumen-intern.id/rapat.pdf' }],
    });
    expect(result).toEqual([]);
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
