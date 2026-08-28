import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { calculateScore, MIN_COVERAGE_PCT, type TechnicalInput, type FundamentalInput, type FlowInput } from '../scoring.service';
import { SCORING_KATEGORI_THRESHOLDS } from '../decision-thresholds';
import { LENS_SCORE_MODEL_METADATA, LENS_SCORE_MODEL_SPEC } from '../../config/lens-score-model';
import { LENS_SCORE_WEIGHTS, LENS_SCORE_TOTAL_WEIGHT } from '@/shared/constants/lens-score-weights';
import { RETURN_PRICE_BASIS } from '@/shared/market/price-basis';

/**
 * SNAPSHOT LENSSCORE - mengunci ANGKA, bukan hubungan antar angka.
 *
 * scoring.service.test.ts sudah menguji aturannya secara relasional ("A harus lebih
 * tinggi daripada B", "coverage turun jadi 95"). Itu menangkap pelanggaran aturan, tapi
 * TIDAK menangkap pergeseran diam: mengubah satu pita RSI dari 6 ke 7, atau bobot
 * kelompok dari 40/30/30 ke 45/30/25, membuat seluruh skor produksi berpindah sementara
 * setiap test relasional tetap hijau karena urutannya tidak berubah.
 *
 * Pergeseran seperti itu bukan sekadar soal rasa: `partitionByScoreVersion()` MENOLAK
 * baris histori yang `score_config_hash`-nya berbeda, jadi bobot yang berubah tanpa
 * kenaikan versi membuat Calibration Lab & Bucket Backtest membandingkan angka yang
 * dihitung dua model berbeda seolah satu model. Itu kegagalan diam yang paling mahal di
 * sistem scoring - lihat catatan di shared/constants/lens-score-weights.ts.
 *
 * KALAU TEST INI MERAH: jangan perbarui angkanya supaya hijau lagi. Pertama putuskan
 * apakah perubahan skornya memang disengaja. Kalau ya, naikkan `version` di
 * config/lens-score-model.ts, perbarui docs/audit/LENS_SCORE_FORMULA.md, lalu perbarui
 * angka di sini - dalam satu commit yang menjelaskan alasannya.
 */

const DOC_PATH = path.join(process.cwd(), 'docs', 'audit', 'LENS_SCORE_FORMULA.md');

const T = (o: Partial<TechnicalInput> = {}): TechnicalInput => ({
  currentPrice: 1000, currentRawPrice: 1000, currentAdjustedPrice: 1000,
  currentPriceBasis: RETURN_PRICE_BASIS, maPriceBasis: RETURN_PRICE_BASIS,
  ma20: 950, ma50: 900, ma200: 800,
  rsi: 60, macdHist: 5, macdLine: 10, macdSignal: 5,
  adx: 32, plusDi: 30, minusDi: 12,
  bollingerPercentB: 0.1,
  stochasticK: 18, stochasticD: 22,
  volToday: 2_000_000, volAvg20: 1_000_000, changePct: 2.5, ...o,
});
const F = (o: Partial<FundamentalInput> = {}): FundamentalInput => ({
  per: 12, pbv: 0.9, roe: 22, der: 0.4, currentRatio: 2.5, revenueGrowth: 20, ...o,
});
const FL = (o: Partial<FlowInput> = {}): FlowInput => ({
  officialNetPressure20: 25, accumulationStatus: 'AKUMULASI', consecutiveBuyDays: 5, consecutiveSellDays: 0,
  officialPositiveRatio20: 0.7, obvSlope10: 3_000_000, obvAvgVolume10: 1_000_000, ...o,
});

const BANK = { yahooSector: 'Financial Services', yahooIndustry: 'Banks - Regional' };
const ENERGI = { yahooSector: 'Energy', yahooIndustry: 'Thermal Coal' };

interface GoldenProfile {
  /** Id yang SAMA dipakai di kolom pertama tabel LENS_SCORE_FORMULA.md - itu yang
   * menghubungkan dokumen ke angka yang benar-benar dihitung kode. */
  id: string;
  technical: TechnicalInput;
  fundamental: FundamentalInput;
  flow: FlowInput;
  expected: {
    technical_score: number;
    fundamental_score: number;
    flow_score: number;
    total_score: number;
    coverage_pct: number;
    kategori: string;
  };
}

/** Profil SINTETIS, sengaja bukan emiten sungguhan.
 *
 * Angka fundamental emiten nyata berubah tiap kuartal, jadi golden vector yang memakai
 * "BBCA" akan berubah arti tanpa satu baris kode pun berubah - dan menuliskan angka
 * fundamental emiten nyata yang tidak ditarik dari sumber data justru melanggar kebijakan
 * zero-dummy repo ini. Yang dikunci di sini adalah RUMUSNYA, dan untuk itu profil sintetis
 * yang stabil adalah alat yang benar. */
const GOLDEN_PROFILES: GoldenProfile[] = [
  {
    id: 'P1',
    technical: T(), fundamental: F(), flow: FL(),
    expected: { technical_score: 40, fundamental_score: 28, flow_score: 30, total_score: 98, coverage_pct: 100, kategori: 'STRONG BUY' },
  },
  {
    id: 'P2',
    technical: T({
      ma20: 1050, ma50: 1100, ma200: 1200, rsi: 35, macdHist: -4, changePct: -3.1,
      adx: 36, plusDi: 10, minusDi: 34, bollingerPercentB: 1.05, stochasticK: 88, stochasticD: 75,
    }),
    fundamental: F({ per: 28, pbv: 3.1, roe: 6, der: 2.4, currentRatio: 0.9, revenueGrowth: -8 }),
    flow: FL({
      officialNetPressure20: -25, accumulationStatus: 'DISTRIBUSI', consecutiveBuyDays: 0, consecutiveSellDays: 6,
      officialPositiveRatio20: 0.25, obvSlope10: -3_000_000,
    }),
    expected: { technical_score: 1, fundamental_score: 0, flow_score: 0, total_score: 1, coverage_pct: 100, kategori: 'SELL' },
  },
  {
    id: 'P3',
    technical: T(), fundamental: F({ der: 6.2, currentRatio: null, sector: BANK }), flow: FL(),
    expected: { technical_score: 40, fundamental_score: 27, flow_score: 30, total_score: 97, coverage_pct: 100, kategori: 'STRONG BUY' },
  },
  {
    id: 'P4',
    technical: T(), fundamental: F({ per: -8, roe: -5, revenueGrowth: -12 }), flow: FL(),
    expected: { technical_score: 40, fundamental_score: 12, flow_score: 30, total_score: 82, coverage_pct: 100, kategori: 'STRONG BUY' },
  },
  {
    id: 'P5',
    technical: T(),
    fundamental: F({ per: null, pbv: null, roe: null, der: null, currentRatio: null, revenueGrowth: null }),
    flow: FL({ officialNetPressure20: null, accumulationStatus: null, officialPositiveRatio20: null, obvSlope10: null, obvAvgVolume10: null }),
    expected: { technical_score: 40, fundamental_score: 0, flow_score: 0, total_score: 99, coverage_pct: 40, kategori: 'DATA TIDAK CUKUP' },
  },
  {
    id: 'P6',
    technical: T(), fundamental: F({ per: 4.5, pbv: 1.8, roe: 42, sector: ENERGI }), flow: FL(),
    expected: { technical_score: 40, fundamental_score: 24, flow_score: 30, total_score: 94, coverage_pct: 100, kategori: 'STRONG BUY' },
  },
  {
    id: 'P7',
    technical: T({ ma20: 1010, ma50: 960, ma200: 900, rsi: 48, macdHist: -1.2, volToday: 1_200_000, changePct: 0.3 }),
    fundamental: F({ per: 18, pbv: 2.2, roe: 12, der: 1.1, currentRatio: 1.6, revenueGrowth: 7 }),
    flow: FL({ officialNetPressure20: 3, accumulationStatus: 'NETRAL', consecutiveBuyDays: 1, consecutiveSellDays: 0, officialPositiveRatio20: 0.5 }),
    expected: { technical_score: 21, fundamental_score: 13, flow_score: 14, total_score: 48, coverage_pct: 100, kategori: 'HOLD' },
  },
  {
    id: 'P8',
    technical: T(), fundamental: F({ per: null }), flow: FL(),
    expected: { technical_score: 40, fundamental_score: 25, flow_score: 30, total_score: 100, coverage_pct: 95, kategori: 'STRONG BUY' },
  },
];

describe('LensScore - spesifikasi model beku', () => {
  it('config hash tidak berubah tanpa kenaikan versi', () => {
    // Hash ini yang disimpan di setiap baris lens_radar_history sebagai score_config_hash.
    // Kalau ia berubah sementara `version` tetap, seluruh histori lama diam-diam ditolak
    // partitionByScoreVersion() dan Calibration Lab menampilkan nol sampel tanpa sebab
    // yang terlihat.
    expect(LENS_SCORE_MODEL_METADATA.version).toBe('lens-score-v1.6.0');
    expect(LENS_SCORE_MODEL_METADATA.configHash).toBe('fnv1a32-2b2f012f');
  });

  it('bobot kelompok 40/30/30 dan totalnya 100', () => {
    expect(LENS_SCORE_WEIGHTS).toEqual({ technical: 40, fundamental: 30, flow: 30 });
    expect(LENS_SCORE_TOTAL_WEIGHT).toBe(100);
  });

  it('ambang kategori dan gerbang kelengkapan tidak bergeser diam-diam', () => {
    expect(SCORING_KATEGORI_THRESHOLDS).toEqual({ STRONG_BUY: 75, BUY: 60, HOLD: 45 });
    expect(MIN_COVERAGE_PCT).toBe(55);
  });

  it('parameter indikator tetap sesuai spesifikasi yang dipublikasikan', () => {
    expect(LENS_SCORE_MODEL_SPEC.indicatorParameters).toEqual({
      rsiPeriod: 14, atrPeriod: 14, emaFast: 20, emaSlow: 50,
      macdFast: 12, macdSlow: 26, macdSignal: 9,
      adxPeriod: 14, bollingerPeriod: 20, bollingerStdDev: 2,
      stochasticPeriod: 14, stochasticSmoothK: 3, stochasticPeriodD: 3,
      obvSlopeLookback: 10, volumeAveragePeriod: 20,
    });
    expect(LENS_SCORE_MODEL_SPEC.status).toBe('RESEARCH_ONLY');
  });
});

describe('LensScore - golden vector calculateScore()', () => {
  for (const profile of GOLDEN_PROFILES) {
    it(`${profile.id} menghasilkan skor yang sama persis seperti yang didokumentasikan`, () => {
      const result = calculateScore(profile.id, profile.technical, profile.fundamental, profile.flow);
      expect({
        technical_score: result.technical_score,
        fundamental_score: result.fundamental_score,
        flow_score: result.flow_score,
        total_score: result.total_score,
        coverage_pct: result.coverage_pct,
        kategori: result.kategori,
      }).toEqual(profile.expected);
    });
  }

  it('skor kelompok selalu berada di dalam bobot kelompok yang tersedia', () => {
    for (const profile of GOLDEN_PROFILES) {
      const r = calculateScore(profile.id, profile.technical, profile.fundamental, profile.flow);
      expect(r.technical_score).toBeLessThanOrEqual(Math.round(r.available_max.technical));
      expect(r.fundamental_score).toBeLessThanOrEqual(Math.round(r.available_max.fundamental));
      expect(r.flow_score).toBeLessThanOrEqual(Math.round(r.available_max.flow));
    }
  });
});

/**
 * Gerbang pemindai dokumen (pola CLAUDE.md §2).
 *
 * Dokumen rumus yang tidak dijaga apa pun akan basi dalam hitungan minggu, dan dokumen
 * transparansi yang basi lebih buruk daripada tidak ada dokumen - ia menyatakan angka
 * yang tidak lagi dihitung siapa pun. Penjaga jumlah di bawah ada karena pemindai yang
 * rusak akan LULUS tanpa memeriksa apa pun, dan itu jauh lebih buruk daripada merah.
 */
describe('LENS_SCORE_FORMULA.md tetap sinkron dengan kode', () => {
  const doc = fs.readFileSync(DOC_PATH, 'utf8');

  /** Baris tabel: | P1 | 40 | 28 | 30 | 98 | 100% | STRONG BUY | ... */
  const rows = doc
    .split('\n')
    // Penekanan markdown (**100**, `95%`) dibuang SEBELUM dicocokkan - dokumen boleh
    // menebalkan angka yang perlu diperhatikan pembaca tanpa membuat pemindainya
    // membaca NaN dan gagal karena alasan yang salah.
    .map((line) => line.split('|').map((cell) => cell.replace(/[*`]/g, '').trim()))
    .filter((cells) => cells.length > 7 && /^P\d+$/.test(cells[1]))
    .map((cells) => ({
      id: cells[1],
      technical_score: Number(cells[2]),
      fundamental_score: Number(cells[3]),
      flow_score: Number(cells[4]),
      total_score: Number(cells[5]),
      coverage_pct: Number(cells[6].replace('%', '')),
      kategori: cells[7],
    }));

  it('menemukan seluruh baris profil untuk diperiksa', () => {
    // Kalau angka ini jatuh (mis. format tabelnya berubah), pemindainya yang rusak -
    // bukan berarti dokumennya benar.
    expect(rows.length).toBe(GOLDEN_PROFILES.length);
  });

  it('setiap angka di tabel dokumen sama dengan yang dihitung calculateScore()', () => {
    for (const row of rows) {
      const profile = GOLDEN_PROFILES.find((p) => p.id === row.id);
      expect(profile, `profil ${row.id} ada di dokumen tapi tidak di golden vector`).toBeDefined();
      const r = calculateScore(row.id, profile!.technical, profile!.fundamental, profile!.flow);
      expect(row, `baris ${row.id} di LENS_SCORE_FORMULA.md`).toEqual({
        id: row.id,
        technical_score: r.technical_score,
        fundamental_score: r.fundamental_score,
        flow_score: r.flow_score,
        total_score: r.total_score,
        coverage_pct: r.coverage_pct,
        kategori: r.kategori,
      });
    }
  });

  it('versi model dan config hash yang ditulis dokumen sama dengan yang dipakai kode', () => {
    expect(doc).toContain(LENS_SCORE_MODEL_METADATA.version);
    expect(doc).toContain(LENS_SCORE_MODEL_METADATA.configHash);
  });

  it('bobot kelompok yang ditulis dokumen sama dengan LENS_SCORE_WEIGHTS', () => {
    for (const [group, weight] of Object.entries(LENS_SCORE_WEIGHTS)) {
      const pattern = new RegExp(`${group}[^\\n|]*\\|\\s*${weight}\\b`, 'i');
      expect(doc, `bobot ${group}=${weight} tidak ditemukan di dokumen`).toMatch(pattern);
    }
  });
});
