import { describe, expect, it } from 'vitest';
import {
  TRANSPARENCY_CACHE_KEY,
  TRANSPARENCY_CACHE_VERSION,
  buildBucketRows,
  buildDecileRows,
  buildEmitenCoverage,
  buildTop5EquityCurve,
  buildTransparencyBanner,
} from '../transparency.service';
import type { CalibrationObservation } from '../calibration.service';
import { SCORE_VERSION } from '../../constants/model-version';
import type { ValidationStatus } from '../../constants/research-status';

function obs(partial: Partial<CalibrationObservation>): CalibrationObservation {
  return {
    ticker: 'AAAA.JK',
    signalDate: '2026-01-01',
    entryDate: '2026-01-02',
    exitDateT20: '2026-01-21',
    lensScore: 85,
    bucket: '80-100',
    marketCap: 1_000_000_000,
    returnT5: 1,
    returnT20: 5,
    ...partial,
  };
}

describe('transparency.service', () => {
  it('cache key publik menyertakan score version agar payload lama tanpa audit trail tidak dipakai ulang', () => {
    expect(TRANSPARENCY_CACHE_KEY).toContain(SCORE_VERSION);
    expect(TRANSPARENCY_CACHE_KEY).toContain(TRANSPARENCY_CACHE_VERSION);
    expect(TRANSPARENCY_CACHE_KEY).not.toBe('sahamlens:cache:lens-radar:transparency:v1');
  });

  it('membangun bucket rows dari lens_bucket_stats dan fallback observasi real untuk metric baru', () => {
    const result = buildBucketRows([
      {
        run_date: '2026-02-01',
        bucket: '80-100',
        score_version: SCORE_VERSION,
        avg_t1: '1.1',
        avg_t5: '2.2',
        avg_t20: '3.3',
        avg_t20_gross: '3.8',
        illiquid_rows_skipped: '7',
        unknown_liquidity_rows: '0',
        win_rate_t20: '55',
        total_samples: '10',
        max_dd_p95: null,
        worst_mae: null,
        avg_win_t20: null,
        avg_loss_t20: null,
        source_rows: '100',
      },
    ], [
      obs({ returnT20: 10 }),
      obs({ returnT20: -4 }),
    ]);

    const high = result.rows.find((row) => row.bucket === '80-100')!;
    expect(result.latestStatsRunDate).toBe('2026-02-01');
    expect(high.avgT1).toBe(1.1);
    expect(high.avgT20).toBe(3.3);
    expect(high.provenance.avgT20).toEqual(expect.objectContaining({
      value: 3.3,
      provenance: expect.objectContaining({ source: 'lens_bucket_stats', confidence: 'calculated', isEstimated: false }),
    }));
    expect(high.avgT20Gross).toBe(3.8);
    // Dua observasi [10, -4]: P95 dan trade terburuk sama-sama jatuh di -4.
    expect(high.maxDdP95T20).toBe(-4);
    expect(high.worstMaeT20).toBe(-4);
    expect(high.avgWinT20).toBe(10);
    expect(high.avgLossT20).toBe(-4);
  });

  it('membangun equity curve Top 5 LensRadar vs IHSG dari window 20 hari yang tidak tumpang tindih', () => {
    const observations = [
      obs({ ticker: 'A.JK', signalDate: '2026-01-01', lensScore: 90, returnT20: 10 }),
      obs({ ticker: 'B.JK', signalDate: '2026-01-01', lensScore: 89, returnT20: 0 }),
      obs({ ticker: 'C.JK', signalDate: '2026-01-01', lensScore: 88, returnT20: 5 }),
      obs({ ticker: 'D.JK', signalDate: '2026-01-01', lensScore: 87, returnT20: -5 }),
      obs({ ticker: 'E.JK', signalDate: '2026-01-01', lensScore: 86, returnT20: 15 }),
      obs({ ticker: 'F.JK', signalDate: '2026-01-01', lensScore: 60, returnT20: 100 }),
      obs({ ticker: 'A.JK', signalDate: '2026-01-02', entryDate: '2026-01-03', exitDateT20: '2026-01-22', lensScore: 90, returnT20: 10 }),
      ...Array.from({ length: 18 }, (_, i) => obs({
        ticker: `X${i}.JK`,
        signalDate: `2026-01-${String(i + 3).padStart(2, '0')}`,
        lensScore: 70,
        returnT20: 1,
      })),
      obs({ ticker: 'A.JK', signalDate: '2026-01-21', entryDate: '2026-01-22', exitDateT20: '2026-02-10', lensScore: 90, returnT20: 20 }),
    ];
    const curve = buildTop5EquityCurve(observations, [
      { date: '2026-01-02', open: 100, close: 100 },
      { date: '2026-01-03', open: 100, close: 100 },
      { date: '2026-01-21', open: 100, close: 110 },
      { date: '2026-01-22', open: 100, close: 120 },
      { date: '2026-02-10', open: 100, close: 130 },
    ]);

    expect(curve).toHaveLength(2);
    // Hari pertama hanya 5 skor teratas dipakai: avg (10+0+5-5+15)/5 = 5%.
    expect(curve[0].lensTop5).toBe(105);
    // IHSG adalah benchmark pasif, bukan trade strategi: return 10% TANPA biaya round-trip strategi.
    expect(curve[0].ihsg).toBe(110);
    expect(curve[0].signals).toBe(5);
  });

  it('tidak memilih window baru hanya karena ada 20 tanggal sinyal bila exit sebelumnya belum lewat', () => {
    const observations = [
      obs({ signalDate: '2026-01-01', entryDate: '2026-01-02', exitDateT20: '2026-02-15', returnT20: 5 }),
      ...Array.from({ length: 20 }, (_, i) => obs({
        ticker: `GAP${i}.JK`,
        signalDate: `2026-01-${String(i + 2).padStart(2, '0')}`,
        entryDate: `2026-01-${String(i + 3).padStart(2, '0')}`,
        exitDateT20: '2026-02-20',
        returnT20: 1,
      })),
      obs({ ticker: 'NEXT.JK', signalDate: '2026-02-15', entryDate: '2026-02-16', exitDateT20: '2026-03-10', returnT20: 2 }),
    ];

    const curve = buildTop5EquityCurve(observations, []);

    // Kandidat ke-21 berada pada 21 Jan dan masih tumpang tindih dengan trade yang
    // exit 15 Feb; hanya sinyal tepat pada tanggal exit yang boleh memulai window baru.
    expect(curve).toHaveLength(2);
    expect(curve.map((point) => point.date)).toEqual(['2026-01-01', '2026-02-15']);
  });

  // AUDIT KUANTITATIF 2026-09-24: rata-rata naik mengikuti skor, tetapi median dan korelasi
  // peringkat tidak. Halaman publik wajib membawa keduanya supaya distribusi miring ke kanan
  // tidak terbaca sebagai daya pisah skor.
  it('menghitung median dan excess-vs-pasar per bucket dari sampel kalibrasi', () => {
    const result = buildBucketRows([], [
      obs({ returnT20: 10 }),
      obs({ ticker: 'BBBB.JK', returnT20: -4 }),
    ]);

    const high = result.rows.find((row) => row.bucket === '80-100')!;
    // Rata-rata lintas-emiten di tanggal yang sama = (10 + -4) / 2 = 3.
    expect(high.avgT20).toBe(3);
    expect(high.medianT20).toBe(3);
    // Excess harus dihitung terhadap pembanding tanggal yang sama, bukan nol.
    expect(high.excessT20).toBe(0);
    expect(result.rows.find((row) => row.bucket === '<60')!.medianT20).toBeNull();
  });

  it('membangun desil dengan jumlah sampel setara dan urutan skor yang benar', () => {
    const observations = Array.from({ length: 20 }, (_, index) =>
      obs({
        ticker: `D${String(index).padStart(2, '0')}.JK`,
        signalDate: '2026-03-02',
        lensScore: index + 1,
        returnT20: index + 1,
      })
    );

    const deciles = buildDecileRows(observations);

    expect(deciles).toHaveLength(10);
    expect(deciles.every((row) => row.samples === 2)).toBe(true);
    expect(deciles[0].scoreMin).toBe(1);
    expect(deciles[9].scoreMax).toBe(20);
    // Desil 1 memuat skor 1 & 2 -> rata-rata 1,5%; desil 10 memuat 19 & 20 -> 19,5%.
    expect(deciles[0].avgT20).toBe(1.5);
    expect(deciles[9].avgT20).toBe(19.5);
    // Rata-rata lintas-emiten = 10,5% sehingga desil bawah negatif dan desil atas positif.
    expect(deciles[0].excessT20!).toBeLessThan(0);
    expect(deciles[9].excessT20!).toBeGreaterThan(0);
  });

  // FASE 0 - banner publik tidak boleh mengklaim validasi selama syaratnya belum dipenuhi.
  it('banner TIDAK PERNAH hijau/tervalidasi untuk status yang bisa dihasilkan sistem hari ini', () => {
    const reachable: ValidationStatus[] = [
      'NOT_ENOUGH_DATA',
      'EXPLORATORY',
      'OUT_OF_SAMPLE_PENDING',
      'FAILED_VALIDATION',
    ];

    for (const status of reachable) {
      const banner = buildTransparencyBanner(status);
      expect(banner.color).not.toBe('green');
      expect(banner.status).not.toBe('validated');
      expect(banner.message.toLowerCase()).not.toContain('tervalidasi');
      expect(banner.message.toLowerCase()).not.toContain('outperform signifikan');
    }
  });

  it('banner menyatakan status riset apa adanya, bukan sel kosong', () => {
    expect(buildTransparencyBanner('NOT_ENOUGH_DATA').message).toContain('pengumpulan');
    expect(buildTransparencyBanner('OUT_OF_SAMPLE_PENDING').message.toLowerCase()).toContain('out-of-sample');
    expect(buildTransparencyBanner('EXPLORATORY').message.toLowerCase()).toContain('eksploratif');
  });

  it('memisahkan jumlah emiten arsip dari emiten yang lolos gerbang populasi validasi', () => {
    const historyRow = (ticker: string, scoreVersion: string | null) => ({
      date: '2026-01-01',
      ticker,
      lens_score: 80,
      close_price: 1_000,
      market_cap: null,
      score_version: scoreVersion,
    });

    const coverage = buildEmitenCoverage(
      [
        historyRow('aaaa.jk', SCORE_VERSION),
        historyRow('AAAA.JK', SCORE_VERSION),
        // Kode asli katalog: arsip menyimpan "AALI.JK", katalog menyimpan "AALI".
        historyRow('AALI.JK', SCORE_VERSION),
        // Versi model lain tidak boleh membesarkan hitungan arsip versi yang ditampilkan.
        historyRow('ZZZZ.JK', 'v0-legacy'),
      ] as never,
      [
        obs({ ticker: 'AAAA.JK', signalDate: '2026-01-01' }),
        obs({ ticker: 'AAAA.JK', signalDate: '2026-01-02' }),
        obs({ ticker: 'BBBB.JK', signalDate: '2026-01-02' }),
        obs({ ticker: 'AAAA.JK', signalDate: '2026-01-03' }),
        obs({ ticker: 'BBBB.JK', signalDate: '2026-01-03' }),
        obs({ ticker: 'CCCC.JK', signalDate: '2026-01-03' }),
      ],
      SCORE_VERSION
    );

    expect(coverage.archiveEmiten).toBe(2);
    expect(coverage.validationEmiten).toBe(3);
    expect(coverage.validationRows).toBe(6);
    // Satu emiten boleh muncul beberapa kali per tanggal, tetapi dihitung sekali per hari.
    expect(coverage.perDay).toEqual({
      median: 2,
      min: 1,
      max: 3,
      latestDate: '2026-01-03',
      latest: 3,
    });
    // Katalog resmi opsional: kalau terbaca, jumlahnya harus realistis (ratusan emiten).
    if (coverage.catalogEmiten != null) {
      expect(coverage.catalogEmiten).toBeGreaterThan(500);
      // AALI ada di katalog dan ada di arsip, jadi tepat satu emiten katalog punya data.
      // Tanpa penjembatan sufiks ".JK" angka ini akan sama dengan jumlah katalog (bug 962).
      expect(coverage.catalogWithoutArchiveData).toBe(coverage.catalogEmiten - 1);
    }
  });

  it('cakupan emiten nol tetap menghasilkan angka yang jujur, bukan undefined', () => {
    const coverage = buildEmitenCoverage([], [], SCORE_VERSION);
    expect(coverage.archiveEmiten).toBe(0);
    expect(coverage.validationEmiten).toBe(0);
    expect(coverage.validationRows).toBe(0);
    expect(coverage.perDay).toEqual({ median: null, min: null, max: null, latestDate: null, latest: null });
  });
});
