import { describe, expect, it } from 'vitest';
import {
  applyIsotonic,
  buildReliabilityBins,
  buildScoreCalibration,
  calibrationMetrics,
  CALIBRATION_BIN_WIDTH,
  fitIsotonic,
  MIN_SAMPLES_PER_ISOTONIC_SPLIT,
  MIN_SAMPLES_PER_RELIABLE_BIN,
  naiveProbabilityFromScore,
  wilsonInterval,
  type CalibrationPair,
  type CalibrationSampleInput,
} from '../score-calibration.service';

function pair(score: number, y: 0 | 1, signalDate = '2026-01-01'): CalibrationPair {
  return { p: naiveProbabilityFromScore(score), y, score, signalDate };
}

/** Deret tanggal bursa palsu yang selalu naik, supaya split temporal punya urutan jelas. */
function dateAt(index: number): string {
  const base = new Date(Date.UTC(2026, 0, 1));
  base.setUTCDate(base.getUTCDate() + index);
  return base.toISOString().slice(0, 10);
}

describe('wilsonInterval', () => {
  it('memuat proporsi teramati dan tetap di dalam [0,1] pada p ekstrem', () => {
    // 10 dari 10 menang. Interval normal biasa akan memberi batas atas > 1 di sini.
    const ci = wilsonInterval(10, 10);
    expect(ci.high).toBeLessThanOrEqual(1);
    expect(ci.low).toBeGreaterThan(0.6);
    expect(ci.low).toBeLessThan(1);
  });

  it('menyempit saat n bertambah pada proporsi yang sama', () => {
    const sempit = wilsonInterval(300, 600);
    const lebar = wilsonInterval(5, 10);
    expect(sempit.high - sempit.low).toBeLessThan(lebar.high - lebar.low);
  });

  it('nilai referensi yang diketahui: 5 dari 10 -> sekitar 0,2366..0,7634', () => {
    const ci = wilsonInterval(5, 10);
    expect(ci.low).toBeCloseTo(0.2366, 3);
    expect(ci.high).toBeCloseTo(0.7634, 3);
  });

  it('n = 0 tidak melempar dan tidak mengklaim apa pun', () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
  });
});

describe('buildReliabilityBins', () => {
  it('mengelompokkan per lebar bin dan menghitung observed sebagai frekuensi menang', () => {
    const pairs = [
      pair(81, 1), pair(85, 1), pair(88, 0), pair(89, 1),
      pair(51, 0), pair(55, 0),
    ];
    const bins = buildReliabilityBins(pairs, CALIBRATION_BIN_WIDTH);
    const bin80 = bins.find((b) => b.binLow === 80)!;
    const bin50 = bins.find((b) => b.binLow === 50)!;

    expect(bin80.samples).toBe(4);
    expect(bin80.wins).toBe(3);
    expect(bin80.observed).toBe(0.75);
    expect(bin50.observed).toBe(0);
  });

  it('skor 100 masuk ke bin terakhir, bukan ke bin ke-11 yang tidak ada', () => {
    const bins = buildReliabilityBins([pair(100, 1)], CALIBRATION_BIN_WIDTH);
    expect(bins).toHaveLength(1);
    expect(bins[0]!.binLow).toBe(90);
    expect(bins[0]!.binHigh).toBe(100);
  });

  it('menandai bin tipis sebagai tidak reliabel tetapi tetap menampilkannya', () => {
    const bins = buildReliabilityBins([pair(85, 1), pair(86, 0)], CALIBRATION_BIN_WIDTH);
    expect(bins[0]!.reliable).toBe(false);
    expect(bins[0]!.samples).toBe(2);
  });

  it('predictionWithinCi false saat prediksi jauh dari observasi', () => {
    // 40 sinyal skor 90 (prediksi naif 0,90) yang hanya menang 25%.
    const pairs = Array.from({ length: 40 }, (_, i) => pair(90, i < 10 ? 1 : 0));
    const bin = buildReliabilityBins(pairs, CALIBRATION_BIN_WIDTH)[0]!;
    expect(bin.observed).toBe(0.25);
    expect(bin.predicted).toBe(0.9);
    expect(bin.predictionWithinCi).toBe(false);
    expect(bin.reliable).toBe(true);
  });
});

describe('calibrationMetrics', () => {
  it('Brier prediksi sempurna = 0, Brier prediksi terbalik total = 1', () => {
    const sempurna: CalibrationPair[] = [
      { p: 1, y: 1, score: 100, signalDate: '2026-01-01' },
      { p: 0, y: 0, score: 0, signalDate: '2026-01-02' },
    ];
    const terbalik: CalibrationPair[] = [
      { p: 0, y: 1, score: 0, signalDate: '2026-01-01' },
      { p: 1, y: 0, score: 100, signalDate: '2026-01-02' },
    ];
    expect(calibrationMetrics(sempurna)!.brier).toBe(0);
    expect(calibrationMetrics(terbalik)!.brier).toBe(1);
  });

  it('skill score NEGATIF saat pemetaan lebih buruk daripada menebak base rate', () => {
    // Semua sinyal skor 90 tapi hanya separuh menang: tebakan konstan 0,5 jauh lebih baik
    // daripada 0,9. Angka ini harus negatif, bukan dipaksa ke 0.
    const pairs = Array.from({ length: 40 }, (_, i) => pair(90, i % 2 === 0 ? 1 : 0));
    const metrics = calibrationMetrics(pairs)!;
    expect(metrics.baseRate).toBe(0.5);
    expect(metrics.brierSkillScore).toBeLessThan(0);
  });

  it('ECE = 0 saat setiap bin persis setepat prediksinya', () => {
    // Bin 80-90: prediksi rata-rata 0,8 dan menang 80%.
    const pairs = Array.from({ length: 100 }, (_, i) => pair(80, i < 80 ? 1 : 0));
    const metrics = calibrationMetrics(pairs)!;
    expect(metrics.ece).toBe(0);
  });

  it('outcome seragam tidak membuat skill score meledak jadi Infinity', () => {
    const pairs = Array.from({ length: 10 }, () => pair(70, 1));
    const metrics = calibrationMetrics(pairs)!;
    expect(metrics.brierBaseRate).toBe(0);
    expect(Number.isFinite(metrics.brierSkillScore)).toBe(true);
  });
});

describe('fitIsotonic / applyIsotonic', () => {
  it('menghasilkan kurva yang monoton tidak menurun', () => {
    const curve = fitIsotonic([
      { x: 50, y: 1 }, { x: 55, y: 0 }, { x: 60, y: 1 },
      { x: 65, y: 0 }, { x: 70, y: 1 }, { x: 75, y: 1 },
    ]);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]!.probability).toBeGreaterThanOrEqual(curve[i - 1]!.probability);
    }
  });

  it('menggabungkan x kembar jadi satu probabilitas', () => {
    const curve = fitIsotonic([{ x: 60, y: 1 }, { x: 60, y: 0 }, { x: 90, y: 1 }]);
    const di60 = curve.filter((point) => point.score === 60);
    expect(di60).toHaveLength(1);
    expect(di60[0]!.probability).toBe(0.5);
  });

  it('menahan nilai di ujung, tidak mengekstrapolasi ke luar rentang latih', () => {
    const curve = fitIsotonic([{ x: 60, y: 0 }, { x: 80, y: 1 }]);
    expect(applyIsotonic(curve, 10)).toBe(applyIsotonic(curve, 60));
    expect(applyIsotonic(curve, 99)).toBe(applyIsotonic(curve, 80));
  });

  it('interpolasi linier di antara dua simpul', () => {
    const curve = fitIsotonic([{ x: 60, y: 0 }, { x: 80, y: 1 }]);
    expect(applyIsotonic(curve, 70)).toBeCloseTo(0.5, 6);
  });

  it('kurva kosong tidak melempar', () => {
    expect(fitIsotonic([])).toEqual([]);
    expect(applyIsotonic([], 75)).toBe(0);
  });
});

describe('buildScoreCalibration', () => {
  it('tanpa observasi matang -> WAITING_FOR_MATURITY, bukan angka nol yang menyesatkan', () => {
    const result = buildScoreCalibration([
      { ticker: 'AAA.JK', signalDate: '2026-01-01', lensScore: 85, returnT20: null },
    ]);
    expect(result.status).toBe('WAITING_FOR_MATURITY');
    expect(result.samples).toBe(0);
    expect(result.naive).toBeNull();
    expect(result.bins).toEqual([]);
  });

  it('sampel ada tetapi tak ada bin yang tebal -> INSUFFICIENT_SAMPLE dan tidak menolak apa pun', () => {
    // 40 sampel tersebar merata ke banyak bin: totalnya lolos, tapi tiap bin tetap tipis.
    const samples: CalibrationSampleInput[] = Array.from({ length: 40 }, (_, i) => ({
      ticker: `T${i}.JK`,
      signalDate: dateAt(i),
      lensScore: 5 + (i % 10) * 10 + Math.floor(i / 10),
      returnT20: i % 2 === 0 ? 1.5 : -1.5,
    }));
    const result = buildScoreCalibration(samples);
    expect(result.status).toBe('INSUFFICIENT_SAMPLE');
    expect(result.reliableBins).toBe(0);
    expect(result.naiveMappingRejected).toBe(false);
    expect(result.naive).not.toBeNull();
  });

  it('menolak pemetaan naif saat mayoritas bin reliabel meleset dari CI-nya', () => {
    // Dua bin tebal yang jelas salah kalibrasi: skor 90-an menang 30%, skor 20-an menang 60%.
    const samples: CalibrationSampleInput[] = [];
    for (let i = 0; i < 60; i++) {
      samples.push({ ticker: `H${i}.JK`, signalDate: dateAt(i), lensScore: 95, returnT20: i < 18 ? 2 : -2 });
    }
    for (let i = 0; i < 60; i++) {
      samples.push({ ticker: `L${i}.JK`, signalDate: dateAt(60 + i), lensScore: 25, returnT20: i < 36 ? 2 : -2 });
    }
    const result = buildScoreCalibration(samples);

    expect(result.status).toBe('REPORTED');
    expect(result.reliableBins).toBe(2);
    expect(result.naiveMappingRejectedBins).toBe(2);
    expect(result.naiveMappingRejected).toBe(true);
    expect(result.conclusion).toContain('tertolak');
  });

  it('isotonic TIDAK di-fit saat salah satu sisi split kurang dari minimum', () => {
    // 45 sampel: train ~31, test ~14 -> test di bawah minimum, jadi fit harus dibatalkan.
    const samples: CalibrationSampleInput[] = Array.from({ length: 45 }, (_, i) => ({
      ticker: `T${i}.JK`,
      signalDate: dateAt(i),
      lensScore: 60 + (i % 30),
      returnT20: i % 3 === 0 ? 1 : -1,
    }));
    const result = buildScoreCalibration(samples);
    expect(result.isotonic.fitted).toBe(false);
    expect(result.isotonic.testSamples).toBeLessThan(MIN_SAMPLES_PER_ISOTONIC_SPLIT);
    expect(result.isotonic.curve).toEqual([]);
    expect(result.isotonic.isotonicOnTest).toBeNull();
    expect(result.isotonic.note).toContain('tidak dijalankan');
  });

  it('ANTI-TAUTOLOGI: kurva dilatih hanya di TRAIN - baris TEST tidak boleh ikut membentuknya', () => {
    // TRAIN: skor tinggi selalu menang, skor rendah selalu kalah.
    // TEST : polanya DIBALIK total. Kalau fit diam-diam memakai seluruh data, kurvanya akan
    // ikut mendatar dan Brier di test akan terlihat bagus. Fit yang benar tetap memakai
    // kurva train, jadi ia harus KALAH di test - dan itulah yang diassert di sini.
    const samples: CalibrationSampleInput[] = [];
    for (let i = 0; i < 70; i++) {
      samples.push({
        ticker: `A${i}.JK`,
        signalDate: dateAt(i),
        lensScore: i % 2 === 0 ? 90 : 30,
        returnT20: i % 2 === 0 ? 3 : -3,
      });
    }
    for (let i = 0; i < 40; i++) {
      samples.push({
        ticker: `B${i}.JK`,
        signalDate: dateAt(200 + i),
        lensScore: i % 2 === 0 ? 90 : 30,
        returnT20: i % 2 === 0 ? -3 : 3,
      });
    }

    const result = buildScoreCalibration(samples);
    expect(result.isotonic.fitted).toBe(true);
    expect(result.isotonic.trainSamples).toBeGreaterThanOrEqual(MIN_SAMPLES_PER_ISOTONIC_SPLIT);
    expect(result.isotonic.testSamples).toBeGreaterThanOrEqual(MIN_SAMPLES_PER_ISOTONIC_SPLIT);

    // Kurva train: skor 30 -> ~0, skor 90 -> ~1.
    expect(applyIsotonic(result.isotonic.curve, 30)).toBeLessThan(0.2);
    expect(applyIsotonic(result.isotonic.curve, 90)).toBeGreaterThan(0.8);

    // Dan karena test dibalik, hasilnya harus jelek. Fit yang bocor akan lulus di sini.
    expect(result.isotonic.isotonicOnTest!.brierSkillScore).toBeLessThan(0);
    expect(result.isotonic.improvesBrierOutOfSample).toBe(false);
    expect(result.isotonic.note).toContain('TIDAK bertahan');
  });

  it('split temporal tidak memotong satu tanggal sinyal jadi dua sisi', () => {
    // 200 sinyal yang semuanya jatuh di 5 tanggal saja, 40 per tanggal. Batas 70% jatuh di
    // indeks 140 - tepat di TENGAH tanggal ke-4 - dan harus digeser maju ke 160 supaya
    // tanggal itu utuh di satu sisi.
    const samples: CalibrationSampleInput[] = Array.from({ length: 200 }, (_, i) => ({
      ticker: `T${i}.JK`,
      signalDate: dateAt(Math.floor(i / 40)),
      lensScore: 50 + (i % 40),
      returnT20: i % 2 === 0 ? 1 : -1,
    }));
    const result = buildScoreCalibration(samples);
    expect(result.isotonic.fitted).toBe(true);
    expect(result.isotonic.trainSamples).toBe(160);
    expect(result.isotonic.testSamples).toBe(40);
    // Tidak ada tanggal yang badannya di train dan ekornya di test.
    expect(result.isotonic.trainSamples % 40).toBe(0);
  });

  it('ambang bin reliabel mengikuti konstanta bersama, bukan angka yang ditulis ulang', () => {
    const tepat = Array.from({ length: MIN_SAMPLES_PER_RELIABLE_BIN }, (_, i) => pair(75, i < 10 ? 1 : 0));
    const kurangSatu = tepat.slice(0, MIN_SAMPLES_PER_RELIABLE_BIN - 1);
    expect(buildReliabilityBins(tepat)[0]!.reliable).toBe(true);
    expect(buildReliabilityBins(kurangSatu)[0]!.reliable).toBe(false);
  });
});
