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
