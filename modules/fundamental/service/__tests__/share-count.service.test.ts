import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readIdxFinancialReport, mapIdxFinancialReport, type IdxXbrlArtifact } from '../idx-xbrl.service';
import { resolveShareCount } from '../share-count.service';

/**
 * Fixture yang sama dengan idx-xbrl.service.test.ts - laporan resmi BEI TW1 2026 yang
 * diunduh apa adanya, tidak diubah nilainya.
 *
 * Ketiganya menguji cabang yang berbeda di resolver ini:
 *   AALI  jalur utama mulus, nominal tersirat mendarat di Rp 500
 *   BBCA  jalur utama juga lulus, TAPI ada buyback - jadi rata-rata tertimbang
 *         menyimpang 0,1% dari posisi akhir periode
 *   TLKM  EPS ditolak gerbang, jadi jalur utama HARUS gagal dan cadangan mengambil alih
 */
const opts = { dataDir: path.join(__dirname, 'fixtures') };

describe('resolveShareCount - jalur utama dari XBRL', () => {
  it('AALI: lembar diturunkan dari EPS, nominal tersirat mendarat di Rp 500', () => {
    const result = resolveShareCount(readIdxFinancialReport('AALI', 2026, 'TW1', opts)!);
    expect(result.source).toBe('IDX_XBRL_EPS');
    expect(result.basis).toBe('WEIGHTED_AVERAGE_PERIOD');
    expect(result.shares).toBeCloseTo(1_924_679_140, -3);
    expect(result.impliedParValue).toBeCloseTo(500, 1);
  });

  it('BBCA: lulus juga, dan nominal tersirat mendarat di Rp 12,5', () => {
    const result = resolveShareCount(readIdxFinancialReport('BBCA', 2026, 'TW1', opts)!);
    expect(result.source).toBe('IDX_XBRL_EPS');
    expect(result.impliedParValue).toBeCloseTo(12.5, 1);
  });

  /**
   * Ini bukan cacat yang ditoleransi, ini sifat angkanya - dan justru karena itu wajib
   * diuji. BBCA membeli kembali saham treasuri selama TW1 2026, jadi rata-rata tertimbang
   * selama periode TIDAK sama dengan posisi akhir periode. Selisihnya kecil (0,1%) tapi
   * nyata, dan `basis` adalah satu-satunya hal yang memberitahu pemakai soal itu.
   */
  it('BBCA: rata-rata tertimbang menyimpang dari posisi akhir periode, dan basis menyatakannya', () => {
    const report = readIdxFinancialReport('BBCA', 2026, 'TW1', opts)!;
    const result = resolveShareCount(report);
    const endOfPeriodShares = report.current.commonStocks! / 12.5;

    expect(result.basis).toBe('WEIGHTED_AVERAGE_PERIOD');
    expect(result.shares).not.toBe(endOfPeriodShares);
    const deviation = Math.abs(result.shares! - endOfPeriodShares) / endOfPeriodShares;
    expect(deviation).toBeGreaterThan(0);
    expect(deviation).toBeLessThan(0.005);
  });
});

describe('resolveShareCount - EPS yang ditolak tidak boleh menular ke turunannya', () => {
  const tlkm = () => readIdxFinancialReport('TLKM', 2026, 'TW1', opts)!;

  it('TLKM tanpa cadangan: null, bukan angka dari EPS yang sudah divonis salah', () => {
    const result = resolveShareCount(tlkm());
    expect(result.shares).toBeNull();
    expect(result.source).toBeNull();
    expect(result.impliedParValue).toBeNull();
    expect(result.reason).toContain('ditolak gerbang kewajaran');
  });

  it('TLKM dengan cadangan: dipakai, tapi sumber & basis-nya ditandai jujur', () => {
    const result = resolveShareCount(tlkm(), {
      externalShares: 99_062_216_600,
      externalLabel: 'Yahoo sharesOutstanding',
    });
    expect(result.shares).toBe(99_062_216_600);
    expect(result.source).toBe('EXTERNAL_FALLBACK');
    expect(result.basis).toBe('EXTERNAL_AS_OF_FETCH');
    expect(result.reason).toContain('Yahoo sharesOutstanding');
    expect(result.reason).toContain('TIDAK point-in-time');
    // Konfirmasi silang tetap dilaporkan untuk sumber cadangan - dan di sini ia justru
    // membuktikan cadangannya benar: nominal TLKM memang Rp 50.
    expect(result.impliedParValue).toBeCloseTo(50, 1);
  });

  it('cadangan yang sendirinya tidak masuk akal tetap ditolak, bukan diteruskan', () => {
    const result = resolveShareCount(tlkm(), { externalShares: 12 });
    expect(result.shares).toBeNull();
    expect(result.source).toBeNull();
  });
});

describe('resolveShareCount - cabang yang tidak diwakili fixture', () => {
  function reportWith(facts: Record<string, Record<string, string>>) {
    const artifact: IdxXbrlArtifact = {
      schemaVersion: 1, ticker: 'TEST', entityName: 'Uji', year: 2026, period: 'TW1',
      fileModified: null, fetchedAt: '2026-08-22T00:00:00Z', sourceUrl: '',
      contexts: { CurrentYearInstant: { instant: '2026-03-31' } },
      facts, dimensionalContextCount: 0, dimensionalFactsSkipped: 0, unexpectedPlainContexts: [],
    };
    return mapIdxFinancialReport(artifact);
  }

  it('EPS tidak dilaporkan -> null, dan alasannya BEDA dari kasus EPS ditolak', () => {
    const result = resolveShareCount(reportWith({}));
    expect(result.shares).toBeNull();
    expect(result.reason).toContain('tidak dilaporkan');
    expect(result.reason).not.toContain('ditolak gerbang');
  });

  /**
   * Gerbang EPS menilai BESARAN lewat nilai mutlak, jadi emiten yang melaporkan rugi
   * tetapi EPS positif bisa lolos gerbang itu dengan lembar tersirat NEGATIF. Jumlah
   * lembar saham negatif tidak punya arti apa pun - resolver ini harus menangkapnya
   * sendiri, tidak boleh mengandalkan gerbang EPS untuk itu.
   */
  it('tanda EPS tidak konsisten dengan laba -> lembar negatif ditolak', () => {
    const report = reportWith({
      'idx-cor:ProfitLossAttributableToParentEntity': { CurrentYearDuration: '-1000000000000' },
      'idx-cor:BasicEarningsLossPerShareFromContinuingOperations': { CurrentYearDuration: '100' },
    });
    expect(report.integrity.eps.plausible).toBe(true);
    expect(report.integrity.eps.impliedShares).toBeLessThan(0);
    expect(resolveShareCount(report).shares).toBeNull();
  });

  it('modal saham tidak dilaporkan -> lembar tetap terselesaikan, nominal tersirat null', () => {
    const report = reportWith({
      'idx-cor:ProfitLossAttributableToParentEntity': { CurrentYearDuration: '1000000000000' },
      'idx-cor:BasicEarningsLossPerShareFromContinuingOperations': { CurrentYearDuration: '100' },
    });
    const result = resolveShareCount(report);
    expect(result.shares).toBe(10_000_000_000);
    expect(result.impliedParValue).toBeNull();
  });
});
