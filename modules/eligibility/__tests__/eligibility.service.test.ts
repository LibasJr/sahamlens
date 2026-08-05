import { describe, it, expect } from 'vitest';
import { evaluateMinimalEligibility } from '../service/eligibility.service';
import {
  ADV_HARD_FLOOR_IDR,
  MAX_STALE_CALENDAR_DAYS,
  MIN_BARS,
} from '../constants/eligibility.constants';
import type { EligibilityBar } from '../types/eligibility.types';

// P0-3: gerbang kelayakan minimal. Setiap test memicu SATU gerbang dengan fixture yang
// sepersis mungkin, plus test urutan prioritas kalau beberapa aktif bersamaan.

/** Deret bar likuid & segar, berakhir tepat di `lastDate`. Volume x close dibuat jauh di
 * atas ADV floor supaya gerbang likuiditas tidak ikut terpicu tanpa diminta. */
function bars(count: number, lastDate: string, overrides: Partial<EligibilityBar> = {}): EligibilityBar[] {
  const end = Date.parse(`${lastDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    close: 1000,
    volume: 5_000_000, // 1000 x 5 juta = Rp 5 miliar/hari
    ...overrides,
  }));
}

const ASOF = '2026-08-05';

describe('evaluateMinimalEligibility - jalur bersih', () => {
  it('saham likuid dengan histori & data lengkap => ELIGIBLE', () => {
    const r = evaluateMinimalEligibility({ ticker: 'BBCA.JK', asOf: ASOF, bars: bars(250, ASOF), coveragePct: 100 });
    expect(r.status).toBe('ELIGIBLE');
    expect(r.reasonCodes).toEqual([]);
    expect(r.blocking).toBe(false);
    expect(r.advisory).toBe(true);
    expect(r.message).toBeNull();
  });

  it('coverage tidak dipasok => gerbang kelengkapan dilewati, bukan dianggap gagal', () => {
    const r = evaluateMinimalEligibility({ ticker: 'BBCA.JK', asOf: ASOF, bars: bars(250, ASOF) });
    expect(r.status).toBe('ELIGIBLE');
    expect(r.details.coveragePct).toBeNull();
  });
});

describe('evaluateMinimalEligibility - satu gerbang per fixture', () => {
  it(`histori ${MIN_BARS - 1} bar => INSUFFICIENT_HISTORY (blocking)`, () => {
    const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, bars: bars(MIN_BARS - 1, ASOF), coveragePct: 100 });
    expect(r.status).toBe('INSUFFICIENT_HISTORY');
    expect(r.reasonCodes).toContain('HISTORY_TOO_SHORT');
    expect(r.blocking).toBe(true);
    expect(r.advisory).toBe(false);
  });

  it(`bar terakhir ${MAX_STALE_CALENDAR_DAYS + 1} hari lalu => STALE_DATA (blocking)`, () => {
    const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, bars: bars(250, '2026-07-30'), coveragePct: 100 });
    expect(r.status).toBe('STALE_DATA');
    expect(r.reasonCodes).toContain('DATA_STALE');
    expect(r.blocking).toBe(true);
  });

  it(`bar terakhir ${MAX_STALE_CALENDAR_DAYS} hari lalu masih ELIGIBLE (akhir pekan panjang tidak memicu)`, () => {
    const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, bars: bars(250, '2026-07-31'), coveragePct: 100 });
    expect(r.status).toBe('ELIGIBLE');
  });

  it('3 hari volume nol berturut => POSSIBLY_NOT_TRADED (blocking)', () => {
    const b = bars(250, ASOF);
    for (let i = b.length - 3; i < b.length; i++) b[i].volume = 0;
    const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, bars: b, coveragePct: 100 });
    expect(r.status).toBe('POSSIBLY_NOT_TRADED');
    expect(r.reasonCodes).toContain('NO_TRADING_ACTIVITY');
    expect(r.blocking).toBe(true);
  });

  it('status memakai kata "kemungkinan", TIDAK mengklaim suspensi resmi IDX', () => {
    const b = bars(250, ASOF);
    for (let i = b.length - 3; i < b.length; i++) b[i].volume = 0;
    const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, bars: b, coveragePct: 100 });
    expect(r.status).not.toBe('SUSPENDED');
    expect(r.message?.toLowerCase()).toContain('kemungkinan');
  });

  it('volume null (hari libur, bukan nol) TIDAK dianggap bukti berhenti diperdagangkan', () => {
    const b = bars(250, ASOF);
    for (let i = b.length - 5; i < b.length - 1; i++) b[i].volume = null;
    const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, bars: b, coveragePct: 100 });
    expect(r.reasonCodes).not.toContain('NO_TRADING_ACTIVITY');
  });

  it('8 hari volume nol dalam 20 bar (tidak berturut) => POSSIBLY_NOT_TRADED', () => {
    const b = bars(250, ASOF);
    for (let i = 0; i < 20; i += 2) b[b.length - 20 + i].volume = 0;
    const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, bars: b, coveragePct: 100 });
    expect(r.reasonCodes).toContain('NO_TRADING_ACTIVITY');
  });

  it(`ADV20 di bawah Rp ${ADV_HARD_FLOOR_IDR / 1e9} miliar => LOW_LIQUIDITY (TIDAK blocking)`, () => {
    // 200 x 1.000 lembar = Rp 200 ribu/hari.
    const r = evaluateMinimalEligibility({
      ticker: 'X.JK', asOf: ASOF, bars: bars(250, ASOF, { close: 200, volume: 1000 }), coveragePct: 100,
    });
    expect(r.status).toBe('LOW_LIQUIDITY');
    expect(r.reasonCodes).toContain('LIQUIDITY_BELOW_FLOOR');
    expect(r.blocking).toBe(false);   // datanya valid, skornya bermakna
    expect(r.advisory).toBe(false);   // tapi tidak boleh direkomendasikan
  });

  it('coverage 40% => INSUFFICIENT_DATA (blocking)', () => {
    const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, bars: bars(250, ASOF), coveragePct: 40 });
    expect(r.status).toBe('INSUFFICIENT_DATA');
    expect(r.reasonCodes).toContain('COVERAGE_BELOW_MIN');
    expect(r.blocking).toBe(true);
  });
});

describe('evaluateMinimalEligibility - prioritas & pelaporan', () => {
  it('beberapa gerbang aktif: status = prioritas tertinggi, reasonCodes memuat SEMUA', () => {
    // Histori pendek + tidak likuid + coverage tipis sekaligus.
    const r = evaluateMinimalEligibility({
      ticker: 'X.JK', asOf: ASOF, bars: bars(50, ASOF, { close: 100, volume: 100 }), coveragePct: 30,
    });
    expect(r.status).toBe('INSUFFICIENT_HISTORY');
    expect(r.reasonCodes).toEqual(
      expect.arrayContaining(['HISTORY_TOO_SHORT', 'COVERAGE_BELOW_MIN', 'LIQUIDITY_BELOW_FLOOR'])
    );
  });

  it('details melaporkan angka yang benar-benar diukur, bukan angka pengganti', () => {
    const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, bars: bars(250, ASOF), coveragePct: 88 });
    expect(r.details.bars).toBe(250);
    expect(r.details.lastBarDate).toBe(ASOF);
    expect(r.details.calendarDaysSinceLastBar).toBe(0);
    expect(r.details.adv20Idr).toBe(5_000_000_000);
    expect(r.details.coveragePct).toBe(88);
  });
});

describe('evaluateMinimalEligibility - adversarial', () => {
  it('bars kosong => INSUFFICIENT_HISTORY, tidak melempar', () => {
    const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, bars: [], coveragePct: null });
    expect(r.status).toBe('INSUFFICIENT_HISTORY');
    expect(r.details.adv20Idr).toBeNull();
  });

  it('bars null/undefined => INSUFFICIENT_HISTORY, tidak melempar', () => {
    expect(() =>
      evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, bars: null as unknown as EligibilityBar[] })
    ).not.toThrow();
    const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, bars: undefined as unknown as EligibilityBar[] });
    expect(r.status).toBe('INSUFFICIENT_HISTORY');
  });

  it('close/volume NaN => ADV tidak terukur => LOW_LIQUIDITY, bukan lolos diam-diam', () => {
    const r = evaluateMinimalEligibility({
      ticker: 'X.JK', asOf: ASOF, bars: bars(250, ASOF, { close: NaN, volume: NaN }), coveragePct: 100,
    });
    expect(r.details.adv20Idr).toBeNull();
    expect(r.reasonCodes).toContain('LIQUIDITY_UNMEASURABLE');
    expect(r.advisory).toBe(false);
  });

  it('tanggal bar tidak bisa diurai => STALE_DATA, bukan dianggap segar', () => {
    const r = evaluateMinimalEligibility({
      ticker: 'X.JK', asOf: ASOF, bars: bars(250, ASOF).map((b, i, a) => (i === a.length - 1 ? { ...b, date: 'bukan-tanggal' } : b)),
      coveragePct: 100,
    });
    expect(r.reasonCodes).toContain('DATA_DATE_UNPARSEABLE');
    expect(r.advisory).toBe(false);
  });

  it('bar bertanggal SETELAH asOf => ditolak, bukan diterima sebagai "sangat segar"', () => {
    const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: '2026-08-01', bars: bars(250, ASOF), coveragePct: 100 });
    expect(r.reasonCodes).toContain('DATA_DATE_IN_FUTURE');
    expect(r.advisory).toBe(false);
  });

  it('coverage NaN diperlakukan sebagai tidak dipasok, bukan 0', () => {
    const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, bars: bars(250, ASOF), coveragePct: NaN });
    expect(r.status).toBe('ELIGIBLE');
    expect(r.details.coveragePct).toBeNull();
  });

  it('tidak ada jalan keluar yang menghasilkan advisory=true saat status bukan ELIGIBLE', () => {
    const kasus = [
      { bars: bars(10, ASOF), coveragePct: 100 },
      { bars: bars(250, '2026-01-01'), coveragePct: 100 },
      { bars: bars(250, ASOF, { close: 50, volume: 10 }), coveragePct: 100 },
      { bars: bars(250, ASOF), coveragePct: 10 },
    ];
    for (const k of kasus) {
      const r = evaluateMinimalEligibility({ ticker: 'X.JK', asOf: ASOF, ...k });
      expect(r.status).not.toBe('ELIGIBLE');
      expect(r.advisory).toBe(false);
      expect(r.message).toBeTruthy();
    }
  });
});
