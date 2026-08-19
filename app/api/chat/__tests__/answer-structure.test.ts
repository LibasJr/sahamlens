import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pakaiStrukturAnalisis, STRUKTUR_ANALISIS } from '@/modules/ai/chat/build-system-prompt';
import type { ChatIntent } from '@/modules/ai/chat/chat-intent';

/**
 * PRD SEC.23 meminta jawaban analisis LensAI punya rangka tetap: Faktor utama, Risiko,
 * Evidence. Yang dijaga di sini BUKAN keluaran modelnya - itu tidak deterministik dan
 * tidak ada gunanya diuji - melainkan dua keputusan server yang menentukannya:
 *
 *   1. rangka itu dipasang HANYA untuk turn yang jawabannya memang analisis emiten, dan
 *   2. isi instruksinya tidak pernah kehilangan pagar "angka hanya dari Data
 *      Terverifikasi Server".
 *
 * Poin 2 yang paling penting. Menyuruh model menulis bagian "Evidence" berarti menyuruh
 * model menyebut lebih banyak angka. Kalau pagarnya hilang, instruksi ini berubah dari
 * penguat verifikasi menjadi undangan mengarang - persis kelas bug yang melahirkan
 * verify-numbers.ts.
 */

const ANALISIS: ChatIntent[] = [
  'STOCK_GENERAL',
  'FUNDAMENTAL_CURRENT',
  'FUNDAMENTAL_HISTORICAL',
  'TECHNICAL_CURRENT',
  'TECHNICAL_HISTORICAL',
  'VALUATION',
  'BUY_SELL_RECOMMENDATION',
  'COMPARE_STOCKS',
  'MOAT',
  'PRICE_PREDICTION',
];

/** Turn yang jawabannya BUKAN analisis emiten. Memasang rangka tiga bagian di sini akan
 *  membuat sapaan dan pertanyaan fitur tampil sebagai laporan - yang justru dilarang
 *  aturan #3 di prompt yang sama. */
const BUKAN_ANALISIS: ChatIntent[] = [
  'SMALL_TALK',
  'SAHAMLENS_PRODUCT_HELP',
  'SCORING_METHOD',
  'MARKET_GENERAL',
  'CALENDAR',
  'NEWS_SENTIMENT',
  'PORTFOLIO',
  'WATCHLIST',
  'OUT_OF_SCOPE',
  'UNKNOWN',
];

describe('rangka jawaban analisis LensAI', () => {
  it.each(ANALISIS)('%s memakai rangka analisis', (intent) => {
    expect(pakaiStrukturAnalisis(intent, intent)).toBe(true);
  });

  it.each(BUKAN_ANALISIS)('%s TIDAK memakai rangka analisis', (intent) => {
    expect(pakaiStrukturAnalisis(intent, intent)).toBe(false);
  });

  it('FOLLOW_UP mewarisi keputusan dari intent data turn sebelumnya', () => {
    // "terus risikonya gimana?" sesudah pertanyaan teknikal tetap jawaban analisis.
    expect(pakaiStrukturAnalisis('FOLLOW_UP', 'TECHNICAL_CURRENT')).toBe(true);
    // "ok makasih" yang ter-resolve ke obrolan biasa tidak berubah jadi laporan.
    expect(pakaiStrukturAnalisis('FOLLOW_UP', 'SMALL_TALK')).toBe(false);
    // FOLLOW_UP itu sendiri bukan topik - tanpa dataIntent yang analitis, tidak dipasang.
    expect(pakaiStrukturAnalisis('FOLLOW_UP', 'FOLLOW_UP')).toBe(false);
  });

  it('instruksinya menyebut ketiga bagian PRD SEC.23', () => {
    expect(STRUKTUR_ANALISIS).toContain('Faktor utama');
    expect(STRUKTUR_ANALISIS).toContain('Risiko');
    expect(STRUKTUR_ANALISIS).toContain('Evidence');
  });

  it('bagian Evidence tetap dipagari ke Data Terverifikasi Server', () => {
    expect(STRUKTUR_ANALISIS).toContain('Data Terverifikasi Server');
    // Bagian yang datanya kosong harus dinyatakan kosong, bukan dilewati diam-diam -
    // judul yang hilang membuat pengguna mengira bagian itu memang tidak relevan.
    expect(STRUKTUR_ANALISIS).toMatch(/belum tersedia/);
  });

  it('simpulan tetap diminta lebih dulu (aturan #12 tidak dibatalkan)', () => {
    expect(STRUKTUR_ANALISIS).toMatch(/Simpulan lebih dulu/);
  });

  it('dipasang lewat routing block, bukan ditempel ke setiap prompt', () => {
    // Kalau instruksinya pindah ke badan buildSystemPrompt, ia akan ikut terkirim pada
    // sapaan dan pertanyaan fitur juga - persis yang dihindari test di atas.
    const service = fs.readFileSync(
      path.resolve(__dirname, '../../../../modules/ai/chat/chat-answer.service.ts'),
      'utf8',
    );
    expect(service).toContain('pakaiStrukturAnalisis(classification.intent, classification.dataIntent)');
    expect(service).toContain('STRUKTUR_ANALISIS');
  });
});
