import { describe, it, expect } from 'vitest';
import { calculateScore, type TechnicalInput, type FundamentalInput, type FlowInput } from '../scoring.service';

// Regresi untuk temuan audit logika & algoritma 2026-08-05 (C-7, H-1, H-2, H-14).
// Semua kasus di bawah menguji SATU aturan: data yang tidak ada tidak boleh berubah
// menjadi poin, dan satu kuantitas tidak boleh dinilai dua kali.

const fullTechnical: TechnicalInput = {
  currentPrice: 1000, ma20: 950, ma50: 900, ma200: 800,
  rsi: 60, macdHist: 5, macdLine: 10, macdSignal: 5,
  volToday: 2_000_000, volAvg20: 1_000_000,
};

const fullFundamental: FundamentalInput = {
  per: 12, pbv: 0.9, roe: 22, der: 0.4, currentRatio: 2.5, revenueGrowth: 20,
};

const fullFlow: FlowInput = {
  cmf20: 25, accumulationStatus: 'AKUMULASI', consecutiveBuyDays: 5, consecutiveSellDays: 0, volRatio: 2,
};

const emptyFundamental: FundamentalInput = {
  per: null, pbv: null, roe: null, der: null, currentRatio: null, revenueGrowth: null,
};

const emptyFlow: FlowInput = {
  cmf20: null, accumulationStatus: null, consecutiveBuyDays: 0, consecutiveSellDays: 0, volRatio: null,
};

describe('calculateScore - ketiadaan data tidak menghasilkan poin (temuan C-7)', () => {
  it('RSI null TIDAK diperlakukan sebagai 50 (yang dulu jatuh di pita "zona BUY ideal")', () => {
    const withRsi = calculateScore('X', { ...fullTechnical, rsi: 50 }, fullFundamental, fullFlow);
    const withoutRsi = calculateScore('X', { ...fullTechnical, rsi: null }, fullFundamental, fullFlow);

    expect(withRsi.detail.rsi).toBe(8);      // RSI 50 memang dapat 8 poin penuh
    expect(withoutRsi.detail.rsi).toBeNull(); // RSI tidak ada -> tidak dinilai sama sekali
    expect(withoutRsi.missing.join(' ')).toContain('RSI 14');
    expect(withoutRsi.coverage_pct).toBeLessThan(withRsi.coverage_pct);
  });

  it('MACD null tidak dinilai sebagai bearish (0 poin) maupun netral', () => {
    const result = calculateScore('X', { ...fullTechnical, macdHist: null, macdLine: null, macdSignal: null }, fullFundamental, fullFlow);
    expect(result.detail.macd).toBeNull();
  });

  it('MA200 null (histori < 200 bar) membuat komponen tren tidak dihitung, bukan uptrend gratis (temuan H-2)', () => {
    const result = calculateScore('X', { ...fullTechnical, ma200: null }, fullFundamental, fullFlow);
    expect(result.detail.ma_trend).toBeNull();
    expect(result.missing.join(' ')).toContain('Tren MA');
  });
});

describe('calculateScore - renormalisasi bobot (temuan H-14)', () => {
  it('bank tanpa DER/CR tidak kehilangan skor gara-gara field yang tidak disediakan sumber data', () => {
    const bank = calculateScore('BBCA', fullTechnical, { ...fullFundamental, der: null, currentRatio: null }, fullFlow);
    const lengkap = calculateScore('BBCA', fullTechnical, fullFundamental, fullFlow);

    expect(bank.detail.kesehatan).toBeNull();
    // Nilai semua komponen lain identik & maksimal, jadi skor akhir tidak boleh turun
    // hanya karena satu komponen datanya tidak ada.
    expect(bank.total_score).toBe(lengkap.total_score);
    expect(bank.coverage_pct).toBeLessThan(100);
  });

  it('emiten rugi tanpa PER tetap dinilai dari PBV, bukan dihukum nol', () => {
    const rugi = calculateScore('GOTO', fullTechnical, { ...emptyFundamental, pbv: 0.5 }, fullFlow);
    expect(rugi.detail.valuasi).toBe(5);
    expect(rugi.detail.profitabilitas).toBeNull();
  });

  it('skor akhir tetap berskala 0-100 walau sebagian data hilang', () => {
    const result = calculateScore('X', fullTechnical, emptyFundamental, fullFlow);
    expect(result.total_score).toBeGreaterThan(0);
    expect(result.total_score).toBeLessThanOrEqual(100);
  });
});

describe('calculateScore - gerbang kelengkapan data', () => {
  it('kategori jadi DATA TIDAK CUKUP kalau cakupan data terlalu tipis', () => {
    const technicalKosong: TechnicalInput = {
      currentPrice: 1000, ma20: null, ma50: null, ma200: null,
      rsi: null, macdHist: null, macdLine: null, macdSignal: null,
      volToday: null, volAvg20: null,
    };
    const result = calculateScore('X', technicalKosong, { ...emptyFundamental, pbv: 0.5 }, emptyFlow);
    expect(result.kategori).toBe('DATA TIDAK CUKUP');
  });

  it('data lengkap dan kuat menghasilkan STRONG BUY', () => {
    const result = calculateScore('X', fullTechnical, fullFundamental, fullFlow);
    expect(result.coverage_pct).toBe(100);
    expect(result.kategori).toBe('STRONG BUY');
  });
});

// P0-2 (blueprint quant V2 §2): coverage_pct dulu MELEBIH-LEBIHKAN kelengkapan data.
// scoreValuasi/scoreProfitabilitas/scoreKesehatan mengecilkan `max`-nya sendiri saat satu
// sub-metrik hilang, dan combine() menghitung penyebutnya dari field yang sama - jadi
// pembilang & penyebut menyusut bersamaan dan rasionya tetap 1.0. Emiten rugi (PER null)
// dilaporkan coverage 100% padahal separuh blok valuasi hilang.
//
// Nilai harapan di bawah adalah aritmetika bobot langsung, bukan angka yang dicocokkan
// ke implementasi: bobot dideklarasikan Technical 40 (MA 15 + RSI 8 + MACD 7 + Volume 10),
// Fundamental 30 (Valuasi 10 = PER 5 + PBV 5, Profitabilitas 10 = ROE 5 + Growth 5,
// Kesehatan 10 = DER 5 + CR 5), Flow 30 (Tekanan 20 + Persistensi 10).
describe('calculateScore - coverage_pct = bobot tersedia / bobot dideklarasikan (P0-2)', () => {
  it('seluruh sub-faktor ada => 100', () => {
    const r = calculateScore('X', fullTechnical, fullFundamental, fullFlow);
    expect(r.coverage_pct).toBe(100);
  });

  it('PER hilang (5 dari 100 bobot) => 95, BUKAN 100 seperti sebelum perbaikan', () => {
    const r = calculateScore('X', fullTechnical, { ...fullFundamental, per: null }, fullFlow);
    expect(r.coverage_pct).toBe(95);
  });

  it('PBV hilang => 95 juga (sub-bobot valuasi simetris 5/5)', () => {
    const r = calculateScore('X', fullTechnical, { ...fullFundamental, pbv: null }, fullFlow);
    expect(r.coverage_pct).toBe(95);
  });

  it('seluruh blok Valuasi hilang (PER & PBV null) => 90', () => {
    const r = calculateScore('X', fullTechnical, { ...fullFundamental, per: null, pbv: null }, fullFlow);
    expect(r.coverage_pct).toBe(90);
  });

  it('PER + ROE + DER hilang (3 x 5 bobot) => 85', () => {
    const r = calculateScore('X', fullTechnical, { ...fullFundamental, per: null, roe: null, der: null }, fullFlow);
    expect(r.coverage_pct).toBe(85);
  });

  it('seluruh Fundamental hilang => 70', () => {
    const r = calculateScore('X', fullTechnical, emptyFundamental, fullFlow);
    expect(r.coverage_pct).toBe(70);
  });

  it('seluruh Flow hilang => 70', () => {
    const r = calculateScore('X', fullTechnical, fullFundamental, emptyFlow);
    expect(r.coverage_pct).toBe(70);
  });

  it('hanya Teknikal => 40 dan kategori DATA TIDAK CUKUP', () => {
    const r = calculateScore('X', fullTechnical, emptyFundamental, emptyFlow);
    expect(r.coverage_pct).toBe(40);
    expect(r.kategori).toBe('DATA TIDAK CUKUP');
  });

  it('RSI hilang (8 bobot) => 92', () => {
    const r = calculateScore('X', { ...fullTechnical, rsi: null }, fullFundamental, fullFlow);
    expect(r.coverage_pct).toBe(92);
  });

  it('Persistensi arus dana hilang (10 bobot) => 90', () => {
    const r = calculateScore('X', fullTechnical, fullFundamental, { ...fullFlow, accumulationStatus: null });
    expect(r.coverage_pct).toBe(90);
  });

  it('sub-faktor hilang TIDAK diperlakukan sebagai nol maupun nilai netral', () => {
    // Emiten rugi (PER null) dengan PBV bagus tetap mendapat skor valuasi PENUH dari
    // sub-faktor yang ADA - yang berubah cuma coverage-nya, bukan hukuman skor.
    const rugi = calculateScore('X', fullTechnical, { ...fullFundamental, per: null, pbv: 0.5 }, fullFlow);
    const lengkap = calculateScore('X', fullTechnical, { ...fullFundamental, pbv: 0.5 }, fullFlow);
    expect(rugi.detail.valuasi).toBe(5);          // 5 dari 5 bobot yang tersedia
    expect(lengkap.detail.valuasi).toBe(9);       // PER 4 + PBV 5 dari 10
    expect(rugi.coverage_pct).toBeLessThan(lengkap.coverage_pct);
  });

  it('coverage tidak pernah melebihi 100 untuk kombinasi apa pun', () => {
    const kombinasi: FundamentalInput[] = [
      fullFundamental,
      { ...fullFundamental, per: null },
      { ...fullFundamental, pbv: null },
      { ...fullFundamental, roe: null },
      { ...fullFundamental, revenueGrowth: null },
      { ...fullFundamental, der: null },
      { ...fullFundamental, currentRatio: null },
      { ...fullFundamental, per: null, roe: null, der: null },
      emptyFundamental,
    ];
    for (const f of kombinasi) {
      const r = calculateScore('X', fullTechnical, f, fullFlow);
      expect(r.coverage_pct).toBeGreaterThan(0);
      expect(r.coverage_pct).toBeLessThanOrEqual(100);
      expect(r.total_score).toBeGreaterThanOrEqual(0);
      expect(r.total_score).toBeLessThanOrEqual(100);
    }
  });
});

describe('calculateScore - LensScore v1 tetap bekerja (backward compatibility)', () => {
  it('bentuk hasil v1 tidak berubah - seluruh field lama masih ada', () => {
    const r = calculateScore('BBCA', fullTechnical, fullFundamental, fullFlow);
    expect(Object.keys(r).sort()).toEqual([
      'alasan_3_poin', 'coverage_pct', 'detail', 'flow_score', 'fundamental_score',
      'harga', 'kategori', 'missing', 'risk', 'simbol', 'technical_score', 'total_score',
    ]);
    expect(r.simbol).toBe('BBCA');
    expect(r.harga).toBe(1000);
    expect(r.total_score).toBeGreaterThan(0);
    expect(r.total_score).toBeLessThanOrEqual(100);
    expect(['STRONG BUY', 'BUY', 'HOLD', 'SELL', 'DATA TIDAK CUKUP']).toContain(r.kategori);
    expect(r.alasan_3_poin).toHaveLength(3);
  });

  it('input rusak (NaN / undefined) tidak melempar dan tidak jadi angka finansial palsu', () => {
    const rusak = calculateScore(
      'X',
      { ...fullTechnical, rsi: NaN, ma200: undefined as unknown as number | null },
      { ...fullFundamental, per: NaN },
      fullFlow
    );
    expect(Number.isFinite(rusak.total_score)).toBe(true);
    expect(rusak.total_score).toBeGreaterThanOrEqual(0);
    expect(rusak.total_score).toBeLessThanOrEqual(100);
    // ma200 undefined diperlakukan sama dengan null (== null), komponen tren dikeluarkan.
    expect(rusak.detail.ma_trend).toBeNull();
  });
});

describe('calculateScore - arus dana dinilai sekali (temuan H-1)', () => {
  it('kelompok Flow maksimal 30 poin dan berasal dari CMF + persistensinya', () => {
    const result = calculateScore('X', fullTechnical, fullFundamental, fullFlow);
    expect(result.flow_score).toBeLessThanOrEqual(30);
    expect(result.detail.flow_tekanan).toBe(20);
    expect(result.detail.flow_persistensi).toBe(10);
  });

  it('volRatio tinggi TIDAK menambah poin arus dana (sudah dinilai di komponen Volume)', () => {
    const volRendah = calculateScore('X', fullTechnical, fullFundamental, { ...fullFlow, volRatio: 0.2 });
    const volTinggi = calculateScore('X', fullTechnical, fullFundamental, { ...fullFlow, volRatio: 5 });
    expect(volRendah.flow_score).toBe(volTinggi.flow_score);
  });

  it('cmf20 null membuat seluruh kelompok arus dana tidak dihitung', () => {
    const result = calculateScore('X', fullTechnical, fullFundamental, emptyFlow);
    expect(result.detail.flow_tekanan).toBeNull();
    expect(result.detail.flow_persistensi).toBeNull();
    expect(result.flow_score).toBe(0);
  });
});
