import { beforeAll, describe, expect, it } from 'vitest';
import { calculateScore } from '@/modules/technical';
import {
  analyzeAccumulationSignal,
  analyzeBandarmology,
  computeAccumulationStreak,
  computeDailyNetFlow,
} from '@/modules/market';
import { analyzeMacd, analyzeRsi } from '@/modules/technical';
import { evaluateMinimalEligibility } from '@/modules/eligibility';
import { evaluatePointInTimeUniverse } from '@/modules/backtest/service/point-in-time-universe';
import { computeMiniCouncil } from '@/lib/miniCouncil';
import {
  DATA_SNAPSHOT_VERSION,
  SCORE_VERSION,
  SIGNAL_VERSION,
  VALUATION_VERSION,
} from '@/modules/lens-radar/constants/model-version';
import {
  PRICE_ADJUSTMENT_VERSION,
  RETURN_PRICE_BASIS,
  detectCorporateAction,
  normalizeYahooOhlcRows,
  selectPriceSeries,
} from '@/shared/market/price-basis';

// INVARIAN LINTAS-JALUR: skor historis (backfill) HARUS sama dengan skor produksi
// (app/api/stock/[ticker]) untuk input yang sama - temuan C-02 audit kuantitatif
// 2026-08-11.
//
// Kenapa file ini ada. Selama berbulan-bulan scripts/backfill-lens-history.mjs mengirim
// `sector: { yahooSector: null, yahooIndustry: null, payoutRatio: null, beta: null }`
// ke calculateScore(), sementara app/api/stock/[ticker]/route.ts:482 mengirim
// assetProfile Yahoo yang asli. Seluruh histori karena itu dinilai sebagai
// 'UNCLASSIFIED': bank dihukum lewat DER yang di produksi dinyatakan TIDAK BERLAKU,
// penjaga puncak siklus emiten komoditas tidak pernah aktif, dan beta acuan sektor selalu
// 1,0. Diuji atas 110.592 kombinasi fundamental: selisih sampai 10 poin LensScore dan
// 8,4% berpindah bucket - dan bucket adalah unit analisis SELURUH Calibration Lab,
// Bucket Backtest, dan TP/CL Lab.
//
// Tidak ada satu pun test lama yang bisa menangkapnya, karena semuanya menguji satu
// fungsi pada satu jalur. Kelas bug ini hanya bisa dicegah oleh test yang menjalankan
// KEDUA jalur lalu membandingkan hasilnya - itulah yang dilakukan di bawah.

let script: any;

beforeAll(async () => {
  script = await import('../backfill-lens-history.mjs');
});

/** Deret OHLC sintetis yang cukup panjang untuk MA200 + warm-up indikator. */
function yahooRows(bars = 260) {
  const rows: any[] = [];
  for (let i = 0; i < bars; i++) {
    const base = 1000 + i * 3 + Math.sin(i / 5) * 20;
    rows.push({
      Date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(),
      Open: base - 2,
      High: base + 8,
      Low: base - 8,
      Close: base,
      AdjClose: base,
      Volume: 5_000_000 + (i % 7) * 250_000,
    });
  }
  return rows;
}

const deps = {
  calculateScore,
  computeMiniCouncil,
  evaluateMinimalEligibility,
  evaluatePointInTimeUniverse,
  analyzeRsi,
  analyzeMacd,
  computeDailyNetFlow,
  computeAccumulationStreak,
  analyzeAccumulationSignal,
  analyzeBandarmology,
  SCORE_VERSION,
  VALUATION_VERSION,
  SIGNAL_VERSION,
  DATA_SNAPSHOT_VERSION,
  PRICE_ADJUSTMENT_VERSION,
  RETURN_PRICE_BASIS,
  normalizeYahooOhlcRows,
  selectPriceSeries,
  detectCorporateAction,
};

/** Baris fundamental_history seperti yang dibaca loadFundamentalHistory(), lengkap
 * dengan konteks sektor point-in-time. */
const bankPitRow = {
  observedDate: '2025-01-01',
  per: 11,
  pbv: 2.2,
  roe: 20,
  der: 6.0,
  currentRatio: null,
  revenueGrowth: 9,
  yahooSector: 'Financial Services',
  yahooIndustry: 'Banks - Regional',
  payoutRatio: 0.5,
};

/** Menjalankan jalur backfill dan mengembalikan argumen fundamental yang benar-benar
 * sampai ke calculateScore(), plus baris hasilnya. */
function runBackfill(fundamentals: any[]) {
  const seen: any[] = [];
  const rows = script.buildHistoricalLensRows({
    ticker: 'TEST.JK',
    yahooRows: yahooRows(),
    fundamentals,
    startDate: '2025-09-01',
    endDate: '2025-09-30',
    dataTimestamp: '2025-09-30T10:00:00.000Z',
    runTimestamp: '2025-09-30T10:00:00.000Z',
    deps: {
      ...deps,
      calculateScore: (symbol: string, technical: any, fundamental: any, flow: any) => {
        seen.push({ symbol, technical, fundamental, flow });
        return calculateScore(symbol, technical, fundamental, flow);
      },
    },
  });
  return { rows, seen };
}

describe('C-02 - konteks sektor point-in-time sampai ke scoring historis', () => {
  it('backfill meneruskan sektor dari arsip, bukan null seperti sebelum perbaikan', () => {
    const { seen } = runBackfill([bankPitRow]);
    expect(seen.length).toBeGreaterThan(0);
    for (const call of seen) {
      expect(call.fundamental.sector).toEqual({
        yahooSector: 'Financial Services',
        yahooIndustry: 'Banks - Regional',
        payoutRatio: 0.5,
        // beta sengaja null: dihitung dari harga per-request, tidak diarsipkan.
        beta: null,
      });
    }
  });

  it('skor historis IDENTIK dengan skor produksi untuk input yang sama', () => {
    const { seen } = runBackfill([bankPitRow]);
    const call = seen[seen.length - 1];

    // Jalur produksi (app/api/stock/[ticker]/route.ts:482) menyusun sector langsung dari
    // quoteSummary. Untuk emiten & tanggal yang sama, isinya harus menghasilkan skor
    // yang sama persis dengan jalur backfill.
    const quoteSummary = {
      assetProfile: { sector: 'Financial Services', industry: 'Banks - Regional' },
      summaryDetail: { payoutRatio: 0.5 },
    };
    const produksi = calculateScore('TEST', call.technical, {
      per: call.fundamental.per,
      pbv: call.fundamental.pbv,
      roe: call.fundamental.roe,
      der: call.fundamental.der,
      currentRatio: call.fundamental.currentRatio,
      revenueGrowth: call.fundamental.revenueGrowth,
      sector: {
        yahooSector: quoteSummary.assetProfile.sector,
        yahooIndustry: quoteSummary.assetProfile.industry,
        payoutRatio: quoteSummary.summaryDetail.payoutRatio,
        beta: null,
      },
    }, call.flow);

    const historis = calculateScore('TEST', call.technical, call.fundamental, call.flow);
    expect(historis.total_score).toBe(produksi.total_score);
    expect(historis.coverage_pct).toBe(produksi.coverage_pct);
    expect(historis.kategori).toBe(produksi.kategori);
    expect(historis.not_applicable).toEqual(produksi.not_applicable);
  });

  it('REGRESI: sektor kosong menghasilkan skor BERBEDA - inilah yang dulu terjadi', () => {
    const { seen } = runBackfill([bankPitRow]);
    const call = seen[seen.length - 1];

    const denganSektor = calculateScore('TEST', call.technical, call.fundamental, call.flow);
    const tanpaSektor = calculateScore('TEST', call.technical, {
      ...call.fundamental,
      sector: { yahooSector: null, yahooIndustry: null, payoutRatio: null, beta: null },
    }, call.flow);

    // Kalau assertion ini gagal, artinya sektor sudah tidak lagi mempengaruhi skor sama
    // sekali - dan itu berarti perbaikan C-02 sudah kehilangan maknanya.
    expect(tanpaSektor.total_score).not.toBe(denganSektor.total_score);
    // Bank: DER & Current Ratio TIDAK BERLAKU, jadi keduanya keluar dari coverage.
    expect(denganSektor.not_applicable.length).toBeGreaterThan(0);
    expect(tanpaSektor.not_applicable).toEqual([]);
  });

  it('baris arsip lama tanpa kolom sektor tetap jalan sebagai UNCLASSIFIED, tidak melempar', () => {
    const legacy = { ...bankPitRow, yahooSector: undefined, yahooIndustry: undefined, payoutRatio: undefined };
    const { seen, rows } = runBackfill([legacy]);
    expect(rows.length).toBeGreaterThan(0);
    expect(seen[0].fundamental.sector).toEqual({
      yahooSector: null, yahooIndustry: null, payoutRatio: null, beta: null,
    });
  });

  it('sektor mengikuti tanggal: snapshot yang belum terbit tidak boleh terlihat', () => {
    // Emiten pindah klasifikasi di tengah jalan. Sinyal sebelum 2025-09-15 wajib memakai
    // sektor lama - kalau tidak, itu look-ahead yang sama seperti fundamental.
    const { seen } = runBackfill([
      { ...bankPitRow, observedDate: '2025-01-01', yahooSector: 'Financial Services', yahooIndustry: 'Banks - Regional' },
      { ...bankPitRow, observedDate: '2025-09-15', yahooSector: 'Energy', yahooIndustry: 'Thermal Coal' },
    ]);
    const sebelum = seen.filter((c: any) => c.technical && c.fundamental).slice(0, 1)[0];
    const sesudah = seen[seen.length - 1];
    expect(sebelum.fundamental.sector.yahooSector).toBe('Financial Services');
    expect(sesudah.fundamental.sector.yahooSector).toBe('Energy');
  });
});

/**
 * VERDICT PEMBANDING (2026-08-12). Hanya LensScore yang selama ini diarsipkan; verdict
 * "Konsensus AI" dihitung di browser lalu hilang. Akibatnya pertanyaan "verdict mana yang
 * paling mendekati kenyataan" tidak bisa dijawab - rekam jejak salah satunya tidak ada.
 *
 * Yang diuji di sini bukan isi verdict-nya (itu urusan miniCouncil sendiri), melainkan
 * bahwa ia BENAR-BENAR terarsip dan point-in-time.
 */
describe('arsip verdict pembanding', () => {
  it('setiap baris membawa verdict council, bukan null diam-diam', () => {
    const { rows } = runBackfill([bankPitRow]);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(['BUY', 'HOLD', 'SELL']).toContain(row.councilSignal);
      expect(typeof row.councilConfidence).toBe('number');
      expect(typeof row.councilBuyPct).toBe('number');
      expect(typeof row.councilSellPct).toBe('number');
      expect(typeof row.councilDivided).toBe('boolean');
    }
  });

  it('POINT-IN-TIME: verdict tanggal awal tidak berubah walau data sesudahnya ditambah', () => {
    // Kalau council diam-diam melihat bar setelah tanggal sinyal, memperpanjang deret
    // akan menggeser verdict di tanggal-tanggal awal. Inilah bentuk look-ahead yang sama
    // dengan temuan C-03, dan satu-satunya cara menangkapnya adalah membandingkan dua
    // jendela yang berbagi awal yang sama.
    const pendek = runBackfill([bankPitRow]).rows;
    const panjang = script.buildHistoricalLensRows({
      ticker: 'TEST.JK',
      yahooRows: yahooRows(320),
      fundamentals: [bankPitRow],
      startDate: '2025-09-01',
      endDate: '2025-09-30',
      dataTimestamp: '2025-09-30T10:00:00.000Z',
      runTimestamp: '2025-09-30T10:00:00.000Z',
      deps,
    });

    const byDatePanjang = new Map<string, any>(panjang.map((r: any) => [r.date, r]));
    let dibandingkan = 0;
    for (const row of pendek) {
      const lain = byDatePanjang.get(row.date);
      if (!lain) continue;
      dibandingkan++;
      expect(lain.councilSignal).toBe(row.councilSignal);
      expect(lain.councilBuyPct).toBe(row.councilBuyPct);
    }
    expect(dibandingkan).toBeGreaterThan(0);
  });

  it('`divided` dibedakan dari HOLD - dua keadaan yang berbeda', () => {
    const { rows } = runBackfill([bankPitRow]);
    for (const row of rows) {
      // divided hanya boleh true saat sinyalnya HOLD.
      if (row.councilDivided) expect(row.councilSignal).toBe('HOLD');
    }
  });
});


describe('M-6 - changePct memakai return basis yang sama dengan scoring', () => {
  it('tidak membaca corporate-action raw drop sebagai penurunan harga ekonomis', () => {
    const source = yahooRows();
    const idx = 240;
    const prev = source[idx - 1]!;
    const cur = source[idx]!;
    const targetDate = String(cur.Date).slice(0, 10);

    // Simulasikan raw series yang turun ~50% karena adjustment factor berubah, sementara
    // AdjClose (basis return LensScore) tetap mengikuti tren ekonomis yang mulus.
    cur.Close = cur.Close / 2;
    cur.Open = cur.Open / 2;
    cur.High = cur.High / 2;
    cur.Low = cur.Low / 2;
    // AdjClose sengaja dibiarkan pada nilai sebelum pembagian raw.

    const seen: any[] = [];
    const rows = script.buildHistoricalLensRows({
      ticker: 'TEST.JK',
      yahooRows: source,
      fundamentals: [bankPitRow],
      startDate: targetDate,
      endDate: targetDate,
      dataTimestamp: `${targetDate}T10:00:00.000Z`,
      runTimestamp: `${targetDate}T10:00:00.000Z`,
      deps: {
        ...deps,
        calculateScore: (symbol: string, technical: any, fundamental: any, flow: any) => {
          seen.push(technical);
          return calculateScore(symbol, technical, fundamental, flow);
        },
      },
    });

    expect(rows).toHaveLength(1);
    expect(seen).toHaveLength(1);
    const expectedAdjustedChange = ((cur.AdjClose / prev.AdjClose) - 1) * 100;
    const falseRawChange = ((cur.Close / prev.Close) - 1) * 100;
    expect(falseRawChange).toBeLessThan(-40);
    expect(seen[0].changePct).toBeCloseTo(expectedAdjustedChange, 8);
    expect(Math.abs(seen[0].changePct)).toBeLessThan(5);
  });
});
