import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readIdxFinancialArtifact,
  readIdxFinancialReport,
} from '../idx-xbrl.service';

/**
 * GOLDEN TEST atas laporan keuangan RESMI BEI (XBRL) TW1 2026.
 *
 * Fixture di `fixtures/` bukan angka karangan - ketiganya diunduh langsung dari
 * idx.co.id lewat scripts/sync-idx-financial-reports.py pada 2026-08-22, lalu dipangkas
 * ke pos-pos yang diuji saja supaya berkasnya ringkas. Nilainya TIDAK diubah.
 *
 * Tiga emiten dipilih karena masing-masing menguji hal berbeda:
 *   AALI  perkebunan  - non-bank, neraca seimbang persis, EPS wajar
 *   BBCA  bank        - punya Dana Syirkah Temporer & memakai InterestIncome
 *   TLKM  telekom     - EPS SALAH LAPOR di XBRL aslinya (lihat blok di bawah)
 */
const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const opts = { dataDir: FIXTURE_DIR };

describe('readIdxFinancialArtifact - pembacaan & penjagaan path', () => {
  it('membaca artefak yang ada', () => {
    const artifact = readIdxFinancialArtifact('BBCA', 2026, 'TW1', opts);
    expect(artifact).not.toBeNull();
    expect(artifact!.ticker).toBe('BBCA');
    expect(artifact!.entityName).toBe('PT Bank Central Asia Tbk.');
  });

  it('menerima bentuk .JK dan huruf kecil', () => {
    expect(readIdxFinancialArtifact('bbca.jk', 2026, 'TW1', opts)).not.toBeNull();
  });

  it('emiten yang belum melaporkan -> null, bukan galat (keadaan yang SAH)', () => {
    expect(readIdxFinancialArtifact('ZZZZ', 2026, 'TW1', opts)).toBeNull();
  });

  it('menolak path traversal lewat kode emiten', () => {
    expect(readIdxFinancialArtifact('../../package', 2026, 'TW1', opts)).toBeNull();
    expect(readIdxFinancialArtifact('BB', 2026, 'TW1', opts)).toBeNull();
  });

  it('menolak periode & tahun yang tidak wajar', () => {
    expect(readIdxFinancialArtifact('BBCA', 2026, 'TW9', opts)).toBeNull();
    expect(readIdxFinancialArtifact('BBCA', 1900, 'TW1', opts)).toBeNull();
  });
});

describe('GOLDEN - AALI (non-bank) TW1 2026', () => {
  const report = readIdxFinancialReport('AALI', 2026, 'TW1', opts)!;

  it('memetakan pos neraca & laba rugi sesuai angka resmi', () => {
    expect(report.current.assets).toBe(27_893_355_000_000);
    expect(report.current.liabilities).toBe(3_359_838_000_000);
    expect(report.current.equity).toBe(24_533_517_000_000);
    expect(report.current.profitLossAttributableToParent).toBe(373_407_000_000);
    expect(report.current.profitLossBeforeIncomeTax).toBe(540_005_000_000);
  });

  it('pendapatan diambil dari SalesAndRevenue (tag non-bank)', () => {
    expect(report.current.revenue).toBe(7_501_811_000_000);
  });

  it('periode dibaca dari konteks, bukan ditebak dari nama berkas', () => {
    expect(report.periodEnd).toBe('2026-03-31');
    expect(report.priorPeriodEnd).toBe('2025-12-31');
  });

  it('pembanding tahun lalu ikut terbaca (durasi Q1 2025, bukan setahun penuh)', () => {
    expect(report.prior.profitLossBeforeIncomeTax).toBe(370_798_000_000);
  });

  it('neraca seimbang persis', () => {
    expect(report.integrity.balanceSheet.balanced).toBe(true);
    expect(report.integrity.balanceSheet.difference).toBe(0);
  });

  it('EPS wajar -> lolos, tidak di-null-kan', () => {
    expect(report.current.basicEps).toBe(194.01);
    expect(report.integrity.eps.plausible).toBe(true);
    expect(report.integrity.rejected).toEqual([]);
  });
});

describe('GOLDEN - BBCA (bank, ada unit syariah) TW1 2026', () => {
  const report = readIdxFinancialReport('BBCA', 2026, 'TW1', opts)!;

  it('pendapatan jatuh ke InterestIncome - bank tidak punya SalesAndRevenue sama sekali', () => {
    expect(report.current.revenue).toBe(24_592_248_000_000);
  });

  it('Dana Syirkah Temporer terbaca terpisah dari liabilitas', () => {
    expect(report.current.temporarySyirkahFunds).toBe(11_111_526_000_000);
  });

  // Ini alasan suku syirkah ada di identitas neraca. Tanpa dia:
  //   1.370.360.247.000.000 + 259.358.793.000.000 = 1.629.719.040.000.000
  //   selisih terhadap aset = 11.111.526.000.000  <- PERSIS dana syirkah-nya
  // dan setiap bank dengan unit syariah akan salah dinyatakan "tidak seimbang".
  it('neraca seimbang HANYA kalau dana syirkah ikut dihitung', () => {
    expect(report.integrity.balanceSheet.balanced).toBe(true);
    expect(report.integrity.balanceSheet.difference).toBe(0);
    const tanpaSyirkah = report.current.liabilities! + report.current.equity!;
    expect(report.current.assets! - tanpaSyirkah).toBe(11_111_526_000_000);
  });

  it('EPS wajar -> lolos', () => {
    expect(report.current.basicEps).toBe(119);
    expect(report.integrity.eps.plausible).toBe(true);
  });
});

/**
 * INI UJI TERPENTING DI BERKAS INI.
 *
 * TLKM melaporkan `BasicEarningsLossPerShareFromContinuingOperations = 0,0000000439` di
 * XBRL yang ia serahkan sendiri ke BEI. Dengan laba induk Rp 4,344 triliun, EPS yang
 * benar sekitar Rp 44 - nilainya meleset TEPAT 1e9.
 *
 * Metadata XBRL tidak menolong: TLKM memakai unit yang IDENTIK dengan AALI dan BBCA
 * (`IDRPerShares`, decimals="INF"). Jadi satu-satunya cara menangkapnya adalah
 * memeriksa kewajaran angkanya sendiri.
 *
 * Yang TIDAK dilakukan: mengalikan 1e9 untuk "memperbaikinya". Menebak faktor koreksi
 * berarti mengarang angka, dan kalau tebakannya meleset tidak ada yang akan tahu.
 */
describe('GOLDEN - TLKM: EPS salah lapor di sumber resmi wajib ditolak, bukan diteruskan', () => {
  const report = readIdxFinancialReport('TLKM', 2026, 'TW1', opts)!;

  it('pos lain tetap terbaca normal - satu field cacat tidak membuang seluruh laporan', () => {
    expect(report.current.assets).toBe(289_955_000_000_000);
    expect(report.current.revenue).toBe(37_189_000_000_000);
    expect(report.current.profitLossAttributableToParent).toBe(4_344_000_000_000);
    expect(report.integrity.balanceSheet.balanced).toBe(true);
  });

  it('EPS mustahil terdeteksi lewat jumlah lembar saham tersirat', () => {
    expect(report.integrity.eps.reported).toBe(0.0000000439);
    // 4,344e12 / 4,39e-8 = ~9,9e19 lembar - tujuh orde di luar batas wajar.
    expect(report.integrity.eps.impliedShares!).toBeGreaterThan(1e19);
    expect(report.integrity.eps.plausible).toBe(false);
  });

  it('EPS di-null-kan (fail-closed), TIDAK dikoreksi otomatis', () => {
    expect(report.current.basicEps).toBeNull();
  });

  it('penolakan dinyatakan dengan alasannya, bukan hilang diam-diam', () => {
    expect(report.integrity.rejected).toHaveLength(1);
    expect(report.integrity.rejected[0]).toContain('basicEps');
    expect(report.integrity.rejected[0]).toContain('kisaran wajar IDX');
  });
});

describe('klasifikasi lancar/tidak lancar - dasar current ratio', () => {
  it('AALI melaporkan pos lancar dan identitasnya persis', () => {
    const report = readIdxFinancialReport('AALI', 2026, 'TW1', opts)!;
    expect(report.current.currentAssets).toBe(9_770_714_000_000);
    expect(report.current.currentLiabilities).toBe(2_442_686_000_000);
    expect(report.integrity.currentClassification.assets.difference).toBe(0);
    expect(report.integrity.currentClassification.liabilities.difference).toBe(0);
    expect(report.integrity.currentClassification.assets.balanced).toBe(true);
    expect(report.integrity.currentClassification.liabilities.balanced).toBe(true);
  });

  it('TLKM juga seimbang - aset dimiliki-untuk-dijual sudah termasuk di NonCurrentAssets', () => {
    const report = readIdxFinancialReport('TLKM', 2026, 'TW1', opts)!;
    expect(report.current.currentAssets).toBe(65_928_000_000_000);
    expect(report.current.currentLiabilities).toBe(71_609_000_000_000);
    expect(report.integrity.currentClassification.assets.balanced).toBe(true);
    expect(report.integrity.currentClassification.liabilities.balanced).toBe(true);
  });

  /**
   * Ini kasus yang paling penting di blok ini. BBCA tidak melaporkan SATU PUN tag
   * lancar/tidak lancar - neraca bank disusun menurut likuiditas, bukan klasifikasi itu.
   *
   * Yang diuji bukan cuma "null-nya benar", tapi bahwa null-nya TIDAK tertukar dengan
   * "gagal periksa": balanced harus null, bukan false, dan tidak boleh ada entri di
   * integrity.rejected - sebab tidak ada yang ditolak, memang tidak dilaporkan.
   */
  it('BBCA (bank) - pos lancar null, balanced null, dan TIDAK dianggap pelanggaran', () => {
    const report = readIdxFinancialReport('BBCA', 2026, 'TW1', opts)!;
    expect(report.current.currentAssets).toBeNull();
    expect(report.current.currentLiabilities).toBeNull();
    expect(report.integrity.currentClassification.assets.balanced).toBeNull();
    expect(report.integrity.currentClassification.liabilities.balanced).toBeNull();
    expect(report.integrity.rejected).toEqual([]);
  });
});

/**
 * BSIM (Bank Sinarmas Tbk) TW1 2026 - emiten NYATA yang membuktikan kenapa identitas
 * neraca TIDAK boleh dihitung dengan menjumlah komponen sendiri.
 *
 * Menjumlah Liabilitas + Dana Syirkah Temporer + Ekuitas menghasilkan
 * Rp 51.792.771.000.000, sementara total asetnya Rp 56.422.278.000.000 - meleset
 * Rp 4.629.507.000.000. Selisih itu PERSIS sama dengan `AccumulatedTabarrusFunds`,
 * pos yang berdiri di sisi kanan neraca BSIM tapi tidak ada di daftar tag yang kita baca.
 *
 * Neracanya sendiri seimbang, dan BSIM menyatakannya: ia melaporkan
 * `LiabilitiesTemporarySyirkahFundsAndEquity` = total asetnya, sama persis.
 *
 * Terukur atas 847 emiten yang melapor TW1 2026: 38 melaporkan subtotal ini dan
 * ke-38-nya sama persis dengan Assets. Dengan penjumlahan komponen, BSIM dan CASA
 * dituduh tidak seimbang; dengan subtotal resmi, 847 dari 847 emiten seimbang.
 */
describe('GOLDEN - BSIM: subtotal resmi mengalahkan penjumlahan komponen', () => {
  const report = readIdxFinancialReport('BSIM', 2026, 'TW1', opts)!;

  it('menjumlah komponen sendiri akan MELESET - ini angka yang membuktikannya', () => {
    const componentSum = report.current.liabilities! + report.current.equity!;
    expect(report.current.temporarySyirkahFunds).toBeNull();
    expect(componentSum).toBe(51_792_771_000_000);
    expect(report.current.assets! - componentSum).toBe(4_629_507_000_000);
  });

  it('subtotal yang dilaporkan BSIM sendiri sama persis dengan total aset', () => {
    expect(report.current.liabilitiesSyirkahAndEquity).toBe(56_422_278_000_000);
    expect(report.current.assets).toBe(56_422_278_000_000);
  });

  it('gerbang memakai subtotal resmi, dan BSIM dinyatakan seimbang', () => {
    expect(report.integrity.balanceSheet.basis).toBe('REPORTED_SUBTOTAL');
    expect(report.integrity.balanceSheet.difference).toBe(0);
    expect(report.integrity.balanceSheet.balanced).toBe(true);
    expect(report.integrity.rejected).toEqual([]);
  });

  it('emiten tanpa subtotal itu tetap diperiksa lewat penjumlahan komponen', () => {
    const aali = readIdxFinancialReport('AALI', 2026, 'TW1', opts)!;
    expect(aali.current.liabilitiesSyirkahAndEquity).toBeNull();
    expect(aali.integrity.balanceSheet.basis).toBe('COMPONENT_SUM');
    expect(aali.integrity.balanceSheet.balanced).toBe(true);
  });
});
