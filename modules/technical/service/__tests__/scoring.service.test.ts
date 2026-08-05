import { describe, it, expect } from 'vitest';
import { calculateScore, type TechnicalInput, type FundamentalInput, type FlowInput } from '../scoring.service';

// Regresi untuk temuan audit logika & algoritma 2026-08-05 (C-7, H-1, H-2, H-14).
// Semua kasus di bawah menguji SATU aturan: data yang tidak ada tidak boleh berubah
// menjadi poin, dan satu kuantitas tidak boleh dinilai dua kali.

const fullTechnical: TechnicalInput = {
  currentPrice: 1000, ma20: 950, ma50: 900, ma200: 800,
  rsi: 60, macdHist: 5, macdLine: 10, macdSignal: 5,
  volToday: 2_000_000, volAvg20: 1_000_000,
  // Arah harga WAJIB dipasok untuk mendapat nilai volume penuh (P1-8): volume 2x
  // rata-rata saat harga TURUN adalah distribusi, bukan akumulasi.
  changePct: 2.5,
};

const fullFundamental: FundamentalInput = {
  per: 12, pbv: 0.9, roe: 22, der: 0.4, currentRatio: 2.5, revenueGrowth: 20,
};

const fullFlow: FlowInput = {
  cmf20: 25, accumulationStatus: 'AKUMULASI', consecutiveBuyDays: 5, consecutiveSellDays: 0, volRatio: 2,
  // Persistensi diukur dari proporsi jendela 20 hari, bukan panjang streak (P1-9).
  mfmPositiveRatio20: 0.7,
};

const emptyFundamental: FundamentalInput = {
  per: null, pbv: null, roe: null, der: null, currentRatio: null, revenueGrowth: null,
};

const emptyFlow: FlowInput = {
  cmf20: null, accumulationStatus: null, consecutiveBuyDays: 0, consecutiveSellDays: 0, volRatio: null,
};

/** Sektor keuangan - DER & Current Ratio TIDAK BERLAKU (P1-11). */
const bankSector = { yahooSector: 'Financial Services', yahooIndustry: 'Banks - Regional' };

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

  it('emiten rugi tanpa PER tetap dinilai dari PBV selama ROE tersedia, bukan dihukum nol', () => {
    // PBV hanya bisa dinilai kalau PBV WAJAR bisa dihitung, dan itu butuh ROE
    // (PBV* = (ROE - g)/(r - g), lihat fair-multiples.service.ts). Jadi fixture di sini
    // memasok ROE - tanpa ROE, PBV memang tidak bisa dinilai dengan cara apa pun yang
    // benar, dan mengakuinya lebih jujur daripada memakai ambang absolut lama.
    const rugi = calculateScore('GOTO', fullTechnical, { ...emptyFundamental, pbv: 0.5, roe: 18 }, fullFlow);
    expect(rugi.detail.valuasi).toBe(5);
    expect(rugi.detail.profitabilitas).not.toBeNull();
  });

  it('ROE tidak tersedia -> PBV TIDAK dinilai dengan ambang absolut, komponen valuasi dikeluarkan', () => {
    // Ini inti temuan P1-10: "PBV < 1 = murah" salah karena PBV wajar adalah fungsi ROE.
    // Tanpa ROE, jawaban yang benar adalah "tidak bisa dinilai", bukan "murah".
    const r = calculateScore('X', fullTechnical, { ...emptyFundamental, pbv: 0.5 }, fullFlow);
    expect(r.detail.valuasi).toBeNull();
    expect(r.missing.join(' ')).toContain('Valuasi');
  });

  it('skor akhir tetap berskala 0-100 walau sebagian data hilang', () => {
    const result = calculateScore('X', fullTechnical, emptyFundamental, fullFlow);
    expect(result.total_score).toBeGreaterThan(0);
    expect(result.total_score).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// Regresi review kuantitatif 2026-08-05 (P1-7, P1-8, P1-9, P1-10, P1-11, P1-12)
// ============================================================================

describe('P1-11 - DER & Current Ratio tidak berlaku untuk sektor keuangan', () => {
  it('bank dengan DER 6x TIDAK dinilai "berisiko tinggi" - komponennya dikeluarkan', () => {
    const bank = calculateScore('BBRI', fullTechnical, {
      ...fullFundamental, der: 6.0, currentRatio: 0.9, sector: bankSector,
    }, fullFlow);
    expect(bank.detail.kesehatan).toBeNull();
    expect(bank.not_applicable.join(' ')).toContain('TIDAK BERLAKU');
  });

  it('bank TIDAK dihukum coverage_pct karena DER/CR tidak berlaku untuknya', () => {
    // Ini pembeda NOT_APPLICABLE vs NA: "tidak berlaku" bukan "data hilang".
    const bank = calculateScore('BBRI', fullTechnical, {
      ...fullFundamental, der: 6.0, currentRatio: 0.9, sector: bankSector,
    }, fullFlow);
    const nonBank = calculateScore('X', fullTechnical, fullFundamental, fullFlow);
    expect(bank.coverage_pct).toBe(nonBank.coverage_pct);
    expect(bank.coverage_pct).toBe(100);
  });

  it('bank yang datanya HILANG tidak lagi dinilai lebih baik daripada bank yang datanya lengkap', () => {
    const dataAda = calculateScore('BBRI', fullTechnical, {
      ...fullFundamental, der: 6.0, currentRatio: 0.9, sector: bankSector,
    }, fullFlow);
    const dataHilang = calculateScore('BBRI', fullTechnical, {
      ...fullFundamental, der: null, currentRatio: null, sector: bankSector,
    }, fullFlow);
    expect(dataAda.total_score).toBe(dataHilang.total_score);
  });

  it('properti dengan DER 2.0x dinilai lebih baik daripada emiten konsumen dengan DER 2.0x', () => {
    const properti = calculateScore('CTRA', fullTechnical, {
      ...fullFundamental, der: 2.0, sector: { yahooSector: 'Real Estate' },
    }, fullFlow);
    const konsumen = calculateScore('UNVR', fullTechnical, {
      ...fullFundamental, der: 2.0, sector: { yahooSector: 'Consumer Defensive' },
    }, fullFlow);
    expect(properti.detail.kesehatan as number).toBeGreaterThan(konsumen.detail.kesehatan as number);
  });
});

describe('P1-10/P1-12 - valuasi dinilai terhadap pengganda yang dibenarkan fundamentalnya', () => {
  it('bank ROE tinggi di PBV tinggi dinilai lebih baik daripada bank ROE rendah di PBV rendah', () => {
    // Inti temuan P1-10: "PBV < 1 = murah" memberi bank lemah nilai valuasi tertinggi.
    const roeTinggi = calculateScore('BBCA', fullTechnical, {
      per: 20, pbv: 3.0, roe: 21, der: null, currentRatio: null, revenueGrowth: 10, sector: bankSector,
    }, fullFlow);
    const roeRendah = calculateScore('BANK-LEMAH', fullTechnical, {
      per: 20, pbv: 1.2, roe: 6, der: null, currentRatio: null, revenueGrowth: 10, sector: bankSector,
    }, fullFlow);
    expect(roeTinggi.detail.valuasi as number).toBeGreaterThan(roeRendah.detail.valuasi as number);
  });

  it('beta lebih tinggi menurunkan nilai wajar, jadi valuasinya lebih mahal', () => {
    const betaRendah = calculateScore('X', fullTechnical, {
      ...fullFundamental, pbv: 2.0, sector: { yahooSector: 'Industrials', beta: 0.6 },
    }, fullFlow);
    const betaTinggi = calculateScore('X', fullTechnical, {
      ...fullFundamental, pbv: 2.0, sector: { yahooSector: 'Industrials', beta: 1.8 },
    }, fullFlow);
    expect(betaTinggi.detail.valuasi as number).toBeLessThan(betaRendah.detail.valuasi as number);
  });

  it('emiten komoditas dengan PER rendah + ROE sangat tinggi TIDAK dapat nilai valuasi maksimum', () => {
    // Tanda tangan puncak siklus - jebakan nilai klasik batu bara/nikel IDX.
    const siklikalPuncak = calculateScore('PTBA', fullTechnical, {
      per: 4, pbv: 1.0, roe: 40, der: 0.3, currentRatio: 2.0, revenueGrowth: 60,
      sector: { yahooSector: 'Energy' },
    }, fullFlow);
    const nonSiklikal = calculateScore('X', fullTechnical, {
      per: 4, pbv: 1.0, roe: 40, der: 0.3, currentRatio: 2.0, revenueGrowth: 60,
      sector: { yahooSector: 'Industrials' },
    }, fullFlow);
    expect(siklikalPuncak.detail.valuasi as number).toBeLessThan(nonSiklikal.detail.valuasi as number);
    expect(siklikalPuncak.alasan_3_poin.concat(siklikalPuncak.risk).join(' ') +
      JSON.stringify(siklikalPuncak)).toContain('puncak siklus');
  });

  it('emiten rugi tidak dihukum dua kali di valuasi DAN profitabilitas', () => {
    const rugi = calculateScore('X', fullTechnical, {
      per: -8, pbv: 1.5, roe: -12, der: 0.5, currentRatio: 1.5, revenueGrowth: -5,
    }, fullFlow);
    // Valuasi tetap dapat nilai kecil (bukan 0) - kerugiannya sudah dinilai penuh
    // di komponen profitabilitas.
    expect(rugi.detail.valuasi).toBe(2);
    expect(rugi.detail.profitabilitas).toBe(0);
  });
});

describe('P1-8 - volume tinggi tidak lagi diberi poin penuh tanpa arah harga', () => {
  it('volume 3x saat harga ANJLOK tidak dinilai sama dengan volume 3x saat harga NAIK', () => {
    const naik = calculateScore('X', { ...fullTechnical, volToday: 3_000_000, changePct: 5 }, fullFundamental, fullFlow);
    const anjlok = calculateScore('X', { ...fullTechnical, volToday: 3_000_000, changePct: -12 }, fullFundamental, fullFlow);
    expect(naik.detail.volume).toBe(10);
    expect(anjlok.detail.volume).toBe(0);
  });

  it('arah harga tidak diketahui -> volume tinggi diberi nilai tengah, bukan penuh', () => {
    const tanpaArah = calculateScore('X', { ...fullTechnical, changePct: null }, fullFundamental, fullFlow);
    expect(tanpaArah.detail.volume).toBe(5);
  });

  it('volume 0 adalah fakta bearish/illiquid, bukan data hilang yang direnormalisasi', () => {
    const nol = calculateScore('X', { ...fullTechnical, volToday: 0 }, fullFundamental, fullFlow);
    expect(nol.detail.volume).toBe(0);
    expect(nol.missing.join(' ')).not.toContain('Volume');
    expect(nol.alasan_3_poin.join(' ')).toContain('Tidak ada transaksi');
  });
});

describe('P1-7 - RSI ditafsirkan menurut rezim tren, sekali saja', () => {
  it('RSI rendah di UPTREND = pullback (bernilai), di DOWNTREND = bukan sinyal beli', () => {
    const uptrend: TechnicalInput = { ...fullTechnical, currentPrice: 1000, ma50: 900, ma200: 800, rsi: 35 };
    const downtrend: TechnicalInput = { ...fullTechnical, currentPrice: 800, ma50: 900, ma200: 1000, rsi: 35 };
    const a = calculateScore('X', uptrend, fullFundamental, fullFlow);
    const b = calculateScore('X', downtrend, fullFundamental, fullFlow);
    expect(a.detail.rsi as number).toBeGreaterThan(b.detail.rsi as number);
    expect(b.detail.rsi as number).toBeLessThanOrEqual(1);
  });

  it('overbought ekstrem tetap 0 poin di rezim mana pun', () => {
    const uptrend = calculateScore('X', { ...fullTechnical, rsi: 85 }, fullFundamental, fullFlow);
    expect(uptrend.detail.rsi).toBe(0);
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

  it('PER + ROE + DER hilang => 80, karena hilangnya ROE ikut membuat PBV tak bisa dinilai', () => {
    // 85 di bawah perbaikan P1-10 sudah tidak berlaku: PBV wajar adalah fungsi ROE, jadi
    // ROE yang hilang membawa serta sub-faktor PBV (5 bobot lagi). Yang hilang total:
    // PER 5 + PBV 5 + ROE 5 + DER 5 = 20 -> coverage 80. Ini konsekuensi yang benar,
    // bukan regresi: dulu PBV tetap "dinilai" lewat ambang absolut yang keliru.
    const r = calculateScore('X', fullTechnical, { ...fullFundamental, per: null, roe: null, der: null }, fullFlow);
    expect(r.coverage_pct).toBe(80);
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
    // PER hilang, PBV & ROE ada: skor valuasi PENUH dari sub-faktor yang tersedia -
    // yang berubah cuma coverage-nya, bukan hukuman skor.
    const rugi = calculateScore('X', fullTechnical, { ...fullFundamental, per: null, pbv: 0.5 }, fullFlow);
    const lengkap = calculateScore('X', fullTechnical, { ...fullFundamental, pbv: 0.5 }, fullFlow);
    expect(rugi.detail.valuasi).toBe(5);          // 5 dari 5 bobot yang tersedia
    // PER 12 vs PER wajar ~11.8 (ROE 22%, g 5%, r 11.9%) = 3/5 "wajar";
    // PBV 0.5 vs PBV wajar ~2.46 = 5/5 "diskon besar".
    expect(lengkap.detail.valuasi).toBe(8);
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
      'harga', 'kategori', 'missing', 'not_applicable', 'risk', 'simbol',
      'technical_score', 'total_score',
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

  it('persistensi diukur dari proporsi jendela 20 hari, bukan panjang streak (P1-9)', () => {
    // Saham yang 18 dari 20 hari terakhir bertekanan beli tapi hari terakhirnya merah
    // (streak = 0) dulu dinilai sama dengan saham tanpa arus dana searah sama sekali.
    const streakPutus = calculateScore('X', fullTechnical, fullFundamental, {
      ...fullFlow, consecutiveBuyDays: 0, consecutiveSellDays: 1, mfmPositiveRatio20: 0.9,
    });
    const tanpaArus = calculateScore('X', fullTechnical, fullFundamental, {
      ...fullFlow, accumulationStatus: 'NETRAL', consecutiveBuyDays: 0, mfmPositiveRatio20: 0.5,
    });
    expect(streakPutus.detail.flow_persistensi).toBeGreaterThan(tanpaArus.detail.flow_persistensi as number);
  });

  it('streak panjang TIDAK menutupi jendela yang sebenarnya bertekanan jual', () => {
    const streakPanjangTapiJendelaJual = calculateScore('X', fullTechnical, fullFundamental, {
      ...fullFlow, consecutiveBuyDays: 6, mfmPositiveRatio20: 0.2,
    });
    expect(streakPanjangTapiJendelaJual.detail.flow_persistensi).toBeLessThanOrEqual(1);
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
