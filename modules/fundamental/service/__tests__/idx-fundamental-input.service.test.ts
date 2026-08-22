import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateScore } from '../../../technical';
import { LENS_SCORE_WEIGHTS } from '../../../../shared/constants/lens-score-weights';
import closes from './fixtures/idx-close-2026-08-21.json';
import { readIdxFinancialReport } from '../idx-xbrl.service';
import { buildIdxFundamentalInput } from '../idx-fundamental-input.service';

/**
 * Perakitan FundamentalInput dari laporan resmi BEI, di atas fixture TW1 2026 yang
 * tidak diubah nilainya.
 *
 * Yang diuji di sini BUKAN cuma "angkanya benar", tapi bahwa yang TIDAK bisa dihitung
 * benar-benar keluar sebagai null - karena itulah kelas bug yang paling mahal di jalur
 * ini: angka salah yang terlihat wajar akan disekor tanpa ada yang curiga.
 *
 * TIDAK ADA ANGKA KARANGAN DI BERKAS INI. Angka laporan datang dari fixture XBRL resmi;
 * harga datang dari fixtures/idx-close-2026-08-21.json, salinan penutupan resmi
 * IDX_OFFICIAL_API. Input teknikal di test integrasi diisi null - bukan indikator
 * buatan - karena data teknikal memang bukan isi laporan keuangan, dan menuliskan
 * angka RSI/MA yang tidak berasal dari mana pun akan menjadikan test ini bohong.
 */
const AALI_CLOSE = closes.penutupan.AALI.close;
const TLKM_CLOSE = closes.penutupan.TLKM.close;
const opts = { dataDir: path.join(__dirname, 'fixtures') };
const report = (t: string) => readIdxFinancialReport(t, 2026, 'TW1', opts)!;

function noteFor(notes: { field: string; available: boolean; reason: string }[], field: string) {
  return notes.find((n) => n.field === field)!;
}

describe('buildIdxFundamentalInput - field yang bisa dihitung dari satu laporan', () => {
  it('AALI: DER, current ratio, dan revenue growth terisi dari angka resmi', () => {
    const { input, notes } = buildIdxFundamentalInput(report('AALI'));

    expect(input.der).toBeCloseTo(3_359_838_000_000 / 24_533_517_000_000, 6);
    expect(input.currentRatio).toBeCloseTo(9_770_714_000_000 / 2_442_686_000_000, 6);
    expect(input.revenueGrowth).toBeCloseTo(6.80, 1);
    expect(noteFor(notes, 'revenueGrowth').available).toBe(true);
  });

  it('AALI: PBV terisi begitu harga dipasok, dan memakai ekuitas INDUK', () => {
    const { input } = buildIdxFundamentalInput(report('AALI'), { price: AALI_CLOSE });
    const shares = 373_407_000_000 / 194.01;
    expect(input.pbv).toBeCloseTo(AALI_CLOSE / (23_917_380_000_000 / shares), 4);
    expect(input.marketCap).toBeCloseTo(AALI_CLOSE * shares, -6);
  });

  it('tanpa harga: PBV null dengan alasan yang menyebut harga, bukan menyalahkan laporan', () => {
    const { input, notes } = buildIdxFundamentalInput(report('AALI'));
    expect(input.pbv).toBeNull();
    expect(noteFor(notes, 'pbv').reason).toContain('Harga pasar tidak dipasok');
  });

  it('revenue growth membandingkan periode SEBANDING, bukan kuartal lawan setahun', () => {
    const r = report('TLKM');
    const { input } = buildIdxFundamentalInput(r);
    // PriorYearDuration fixture = 2025-01-01..2025-03-31, sebanding dengan TW1 2026.
    expect(input.revenueGrowth).toBeCloseTo(((37_189 - 36_639) / 36_639) * 100, 2);
  });
});

describe('buildIdxFundamentalInput - yang TIDAK boleh diisi', () => {
  it('ROE dan PER selalu null, dengan alasan yang menyebut TTM', () => {
    const { input, notes } = buildIdxFundamentalInput(report('AALI'), { price: AALI_CLOSE });
    expect(input.roe).toBeNull();
    expect(input.per).toBeNull();
    for (const field of ['roe', 'per']) {
      const n = noteFor(notes, field);
      expect(n.available).toBe(false);
      expect(n.reason).toContain('dua belas bulan');
    }
  });

  /**
   * Penjaga anti-regresi yang paling penting di berkas ini. Kalau suatu saat ada yang
   * "memperbaiki" ROE dengan mengalikan laba kuartalan empat, test ini yang menangkapnya:
   * ROE AALI dari laba TW1 saja 1,56% dan versi x4-nya 6,24% - dua-duanya angka yang
   * TIDAK boleh muncul di keluaran.
   */
  it('ROE tidak diisi diam-diam lewat penyetahunan x4', () => {
    const { input } = buildIdxFundamentalInput(report('AALI'));
    const quarterly = (373_407_000_000 / 23_917_380_000_000) * 100;
    expect(quarterly).toBeCloseTo(1.56, 1);
    expect(input.roe).not.toBeCloseTo(quarterly, 1);
    expect(input.roe).not.toBeCloseTo(quarterly * 4, 1);
    expect(input.roe).toBeNull();
  });

  it('BBCA (bank): current ratio null, dan alasannya menyebut likuiditas - bukan diganti total', () => {
    const { input, notes } = buildIdxFundamentalInput(report('BBCA'));
    expect(input.currentRatio).toBeNull();
    expect(noteFor(notes, 'currentRatio').reason).toContain('likuiditas');
    // Penjaga eksplisit: jangan pernah jatuh ke total aset/liabilitas.
    expect(input.currentRatio).not.toBeCloseTo(1_640_830_566_000_000 / 1_370_360_247_000_000, 3);
  });

  it('BBCA: dana syirkah temporer TIDAK diselundupkan ke pembilang DER', () => {
    const { input } = buildIdxFundamentalInput(report('BBCA'));
    // Ekuitas TOTAL (259.358.793 jt), bukan ekuitas induk - DER menilai seluruh
    // struktur modal emiten, termasuk kepentingan nonpengendali.
    const asReported = 1_370_360_247_000_000 / 259_358_793_000_000;
    expect(input.der).toBeCloseTo(asReported, 6);
  });

  it('TLKM: EPS rusak -> lembar saham gagal -> PBV null, bukan PBV dari angka rusak', () => {
    const { input, notes, shareCount } = buildIdxFundamentalInput(report('TLKM'), { price: TLKM_CLOSE });
    expect(shareCount.shares).toBeNull();
    expect(input.pbv).toBeNull();
    expect(input.marketCap).toBeNull();
    expect(noteFor(notes, 'pbv').reason).toContain('Jumlah lembar saham tidak terselesaikan');
  });

  it('TLKM dengan cadangan luar: PBV terisi lagi, dan sumbernya tercatat', () => {
    const { input, notes } = buildIdxFundamentalInput(report('TLKM'), {
      price: TLKM_CLOSE,
      externalShares: 99_062_216_600,
      externalLabel: 'Yahoo sharesOutstanding',
    });
    expect(input.pbv).toBeCloseTo(TLKM_CLOSE / (134_492_000_000_000 / 99_062_216_600), 4);
    expect(noteFor(notes, 'pbv').reason).toContain('EXTERNAL_FALLBACK');
  });
});

describe('hasil rakitan benar-benar diterima calculateScore', () => {
  /**
   * Gerbang integrasi. Merakit bentuk yang benar tidak ada gunanya kalau LensScore
   * menolaknya atau diam-diam menghitungnya sebagai nol - dan kehilangan dua field harus
   * TERLIHAT sebagai coverage yang turun, bukan sebagai skor fundamental yang rendah.
   */
  it('skor terbentuk, dan kehilangan ROE/PER muncul sebagai coverage - bukan skor buruk', () => {
    const { input } = buildIdxFundamentalInput(report('AALI'), { price: AALI_CLOSE });

    // Seluruh input teknikal null KECUALI harga penutupan resmi. Data teknikal bukan isi
    // laporan keuangan, jadi menuliskan RSI/MA di sini berarti mengarang. Null adalah
    // pernyataan yang benar, dan calculateScore memang menanganinya dengan mengeluarkan
    // bobotnya dari availableMax.
    const result = calculateScore(
      'AALI',
      {
        currentPrice: AALI_CLOSE,
        ma20: null, ma50: null, ma200: null,
        rsi: null, macdHist: null, macdLine: null, macdSignal: null,
        volToday: null, volAvg20: null,
      },
      input,
      { cmf20: null, accumulationStatus: null, consecutiveBuyDays: 0, consecutiveSellDays: 0, volRatio: null },
    );

    expect(result.fundamental_score).toBeGreaterThan(0);
    // Bobot yang DIDEKLARASIKAN tetap penuh; yang menyusut hanya yang punya data. Itulah
    // yang membuat hilangnya ROE/PER terbaca sebagai coverage turun, bukan skor buruk.
    expect(result.available_max.fundamental).toBeLessThan(LENS_SCORE_WEIGHTS.fundamental);
    expect(result.coverage_pct).toBeLessThan(100);
  });
});
