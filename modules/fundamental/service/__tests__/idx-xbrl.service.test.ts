import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  mapIdxFinancialReport,
  readIdxFinancialArtifact,
  readIdxFinancialReport,
  type IdxXbrlArtifact,
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

describe('pemeriksaan integritas - membedakan "tidak bisa diperiksa" dari "gagal"', () => {
  function artifactWith(facts: Record<string, Record<string, string>>): IdxXbrlArtifact {
    return {
      schemaVersion: 1, ticker: 'TEST', entityName: 'Uji', year: 2026, period: 'TW1',
      fileModified: null, fetchedAt: '2026-08-22T00:00:00Z', sourceUrl: '',
      contexts: { CurrentYearInstant: { instant: '2026-03-31' } },
      facts, dimensionalContextCount: 0, dimensionalFactsSkipped: 0, unexpectedPlainContexts: [],
    };
  }

  it('komponen neraca tidak lengkap -> balanced null, BUKAN false', () => {
    const report = mapIdxFinancialReport(artifactWith({
      'idx-cor:Assets': { CurrentYearInstant: '1000' },
    }));
    expect(report.integrity.balanceSheet.balanced).toBeNull();
  });

  it('neraca yang benar-benar tidak seimbang -> false', () => {
    const report = mapIdxFinancialReport(artifactWith({
      'idx-cor:Assets': { CurrentYearInstant: '1000' },
      'idx-cor:Liabilities': { CurrentYearInstant: '400' },
      'idx-cor:Equity': { CurrentYearInstant: '300' },
    }));
    expect(report.integrity.balanceSheet.balanced).toBe(false);
    expect(report.integrity.balanceSheet.difference).toBe(300);
  });

  it('pos yang tidak dilaporkan -> null, bukan 0', () => {
    const report = mapIdxFinancialReport(artifactWith({}));
    expect(report.current.assets).toBeNull();
    expect(report.current.revenue).toBeNull();
    expect(report.current.basicEps).toBeNull();
  });

  it('nilai kosong/bukan angka -> null, tidak menyusup sebagai NaN', () => {
    const report = mapIdxFinancialReport(artifactWith({
      'idx-cor:Assets': { CurrentYearInstant: '' },
      'idx-cor:Liabilities': { CurrentYearInstant: 'n/a' },
    }));
    expect(report.current.assets).toBeNull();
    expect(report.current.liabilities).toBeNull();
  });

  it('EPS ada tapi laba tidak -> plausible null (tidak bisa diperiksa), EPS tetap dipakai', () => {
    const report = mapIdxFinancialReport(artifactWith({
      'idx-cor:BasicEarningsLossPerShareFromContinuingOperations': { CurrentYearDuration: '150' },
    }));
    expect(report.integrity.eps.plausible).toBeNull();
    expect(report.current.basicEps).toBe(150);
  });
});
