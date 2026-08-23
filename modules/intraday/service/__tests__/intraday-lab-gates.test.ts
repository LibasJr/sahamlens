import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildLeakageAudit,
  type LeakageAudit,
} from '../intraday-validation.service';
import { computeIntradayComponents, intradayLookbackCoverage, simulateIntradayOutcome } from '../intraday-signal.service';
import { correctPValues } from '../intraday-stats';
import {
  DEFAULT_INTRADAY_CALENDAR,
  defaultIntradayRunConfig,
  MOMENTUM_DOC_BARS,
  TREND_DOC_BARS,
} from '../../constants/intraday-model';

const ROOT = path.join(__dirname, '..', '..', '..', '..');
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const validationSource = stripComments(
  readFileSync(path.join(ROOT, 'modules/intraday/service/intraday-validation.service.ts'), 'utf8')
);

function bars(n: number, startMinute = 9 * 60, step = 1) {
  return Array.from({ length: n }, (_, i) => ({
    ticker: 'TEST.JK',
    tradingDate: '2026-08-20',
    unixSeconds: Date.parse(`2026-08-20T${String(Math.floor((startMinute + i * 5) / 60)).padStart(2, '0')}:${String((startMinute + i * 5) % 60).padStart(2, '0')}:00+07:00`) / 1000,
    wibMinute: startMinute + i * 5,
    open: 1000 + i * step,
    high: 1005 + i * step,
    low: 995 + i * step,
    close: 1000 + i * step,
    volume: 100_000,
  })) as never[];
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    ticker: 'TEST.JK',
    tradingDate: '2026-08-20',
    signalMinute: 600,
    signalTimestamp: '2026-08-20T10:00:00+07:00',
    score: 60,
    bucket: '60-69',
    horizon: 'H30',
    netReturn: 0.001,
    grossReturn: 0.002,
    entryPrice: 1000,
    exitPrice: 1001,
    entryPriceRaw: 1000,
    exitPriceRaw: 1001,
    mfe: 0.002,
    mae: -0.001,
    exitReason: 'HORIZON',
    fillStatus: 'FILLED',
    entryTimestamp: '2026-08-20T10:00:00+07:00',
    exitTimestamp: '2026-08-20T10:30:00+07:00',
    tradable: true,
    spreadFloorBinding: false,
    slippageBpsApplied: 10,
    turnoverIdr: 1e9,
    sector: null,
    componentScores: null,
    ...overrides,
  } as never;
}

const config = defaultIntradayRunConfig();

describe('#1 gerbang look-ahead benar-benar memeriksa', () => {
  it('tidak lagi berupa literal true di daftar gerbang', () => {
    // Regresi langsung: gerbang ini dulu `gate('leakage', ..., true)`. Ia ikut
    // menentukan passedAll, yang menentukan CANDIDATE_VALIDATED.
    const gateCall = validationSource.match(/gate\(\s*'leakage'[\s\S]*?\),\n/)?.[0] ?? '';
    expect(gateCall, "gerbang 'leakage' tidak ditemukan - namanya berubah, perbarui test ini").not.toBe('');
    expect(gateCall).toContain('leakageAudit');
    expect(gateCall, 'gerbang look-ahead kembali jadi konstanta').not.toMatch(/,\s*true\s*\)/);
  });

  it('lulus hanya kalau ada baris yang benar-benar diperiksa', () => {
    const kosong: LeakageAudit = buildLeakageAudit([], config);
    expect(kosong.checked).toBe(0);
    expect(kosong.passed, 'tanpa baris apa pun, gerbang harus GAGAL - bukan lulus').toBe(false);

    const bersih = buildLeakageAudit([row(), row()], config);
    expect(bersih.checked).toBe(2);
    expect(bersih.passed).toBe(true);
  });

  it('menangkap entry yang mendahului sinyal', () => {
    const audit = buildLeakageAudit([row({ entryTimestamp: '2026-08-20T09:55:00+07:00' })], config);
    expect(audit.entryBeforeSignal).toBe(1);
    expect(audit.passed).toBe(false);
  });

  it('menangkap exit yang mendahului entry dan exit setelah batas EOD', () => {
    const mundur = buildLeakageAudit([row({ exitTimestamp: '2026-08-20T09:50:00+07:00' })], config);
    expect(mundur.exitBeforeEntry).toBe(1);
    expect(mundur.passed).toBe(false);

    const lewat = buildLeakageAudit([row({ exitTimestamp: '2026-08-20T15:55:00+07:00' })], config);
    expect(lewat.exitAfterCutoff).toBe(1);
    expect(lewat.passed).toBe(false);
  });

  it('baris tanpa stempel waktu dihitung tidak terverifikasi, bukan lolos', () => {
    const audit = buildLeakageAudit([row({ entryTimestamp: null })], config);
    expect(audit.unverifiable).toBe(1);
    expect(audit.checked).toBe(0);
    expect(audit.passed).toBe(false);
  });
});

describe('#2 koreksi multiple testing mencakup seluruh sel yang ditampilkan', () => {
  it('keluarga uji memuat bucket dan irisan, bukan horizon saja', () => {
    for (const needle of ['bucket ', 'jam ', 'likuiditas ', 'regime ']) {
      expect(validationSource, `keluarga uji kehilangan '${needle}'`).toContain(needle);
    }
    expect(validationSource).toContain('correctPValues(testFamily');
  });

  it('gerbang q_value mencocokkan label horizon PERSIS, bukan berawalan', () => {
    expect(validationSource).toContain('t.label === primaryTestLabel');
    expect(validationSource).not.toContain('t.label.startsWith(PRIMARY_HORIZON)');
  });
});

describe('#3 CI yang melintasi nol tidak boleh disebut gagal', () => {
  it('memeriksa INCONCLUSIVE sebelum titik estimasi', () => {
    const fn = validationSource.slice(validationSource.indexOf('function resolveStatus'));
    const inconclusive = fn.indexOf("return 'INCONCLUSIVE'");
    const failedByPoint = fn.indexOf('expectancy <= 0');
    expect(inconclusive).toBeGreaterThan(-1);
    expect(failedByPoint).toBeGreaterThan(-1);
    expect(
      inconclusive,
      'titik estimasi diperiksa lebih dulu - rata-rata -0,0001 dengan CI melintasi nol akan disebut GAGAL'
    ).toBeLessThan(failedByPoint);
  });
});

describe('#4 jendela fitur yang dipendekkan tercatat, bukan disembunyikan', () => {
  it('cakupan yang dihitung dari kalender cocok dengan yang benar-benar dipakai', () => {
    for (const n of [6, 7, 13, 18]) {
      const snapshot = computeIntradayComponents(bars(n))!;
      const minute = 9 * 60 + n * 5;
      const coverage = intradayLookbackCoverage(minute, DEFAULT_INTRADAY_CALENDAR.regularSessions);
      expect(coverage.completedBars, `menit ${minute}`).toBe(n);
      expect(snapshot.momentumLookbackBars).toBe(coverage.momentumLookbackBars);
      expect(snapshot.trendLookbackBars).toBe(coverage.trendLookbackBars);
      expect(snapshot.fullLookback).toBe(coverage.full);
    }
  });

  it('09:30 dan 10:00 memang belum penuh, 10:30 ke atas penuh', () => {
    const at = (m: number) => intradayLookbackCoverage(m, DEFAULT_INTRADAY_CALENDAR.regularSessions);
    expect(at(9 * 60 + 30).full).toBe(false);
    expect(at(10 * 60).full).toBe(false);
    expect(at(10 * 60 + 30).full).toBe(true);
    expect(at(15 * 60).full).toBe(true);
    // Jendela yang diniatkan, supaya angka di bawah tidak jadi angka ajaib.
    expect(at(15 * 60).momentumLookbackBars).toBe(MOMENTUM_DOC_BARS);
    expect(at(15 * 60).trendLookbackBars).toBe(TREND_DOC_BARS);
  });

  it('irisan jam sinyal membawa status jendelanya', () => {
    expect(validationSource).toContain('lookbackFull');
    expect(validationSource).toContain('intradayLookbackCoverage(Number(minute)');
  });
});

describe('#5 koreksi p-value tidak bergantung pada keunikan label', () => {
  it('dua uji berlabel sama tetap dapat nilai terkoreksi masing-masing', () => {
    const hasil = correctPValues([
      { label: 'sama', pValue: 0.001 },
      { label: 'sama', pValue: 0.9 },
    ]);
    expect(hasil).toHaveLength(2);
    expect(hasil[0]!.holm).not.toBe(hasil[1]!.holm);
    expect(hasil[0]!.holm).toBeCloseTo(0.002, 6);
    expect(hasil[1]!.holm).toBeCloseTo(0.9, 6);
  });

  it('urutan hasil mengikuti urutan masukan, termasuk saat ada pValue null', () => {
    const hasil = correctPValues([
      { label: 'a', pValue: 0.5 },
      { label: 'b', pValue: null },
      { label: 'c', pValue: 0.01 },
    ]);
    expect(hasil.map((h) => h.label)).toEqual(['a', 'b', 'c']);
    expect(hasil[1]!.holm).toBeNull();
    expect(hasil[2]!.holm!).toBeLessThan(hasil[0]!.holm!);
  });
});

describe('#6 grossReturn memakai basis mentah walau exit lewat TP/SL', () => {
  it('TP: gross adalah target yang sama di atas harga bar mentah', () => {
    const dayBars = bars(20, 9 * 60, 3);
    const signal = {
      ticker: 'TEST.JK',
      tradingDate: '2026-08-20',
      signalMinute: 9 * 60 + 30,
      signalWibIso: '2026-08-20T09:30:00+07:00',
      score: 70,
      bucket: '70-79' as const,
      components: computeIntradayComponents(bars(6))!,
    };
    const withTp = simulateIntradayOutcome(signal, dayBars, 'H60', {
      ...config,
      takeProfitPct: 0.5,
      stopLossPct: 10,
    });
    expect(withTp.exitReason).toBe('TAKE_PROFIT');
    // Gross = 0,5% persis. Sebelum perbaikan ia ikut terangkat slippage entry.
    expect(withTp.grossReturn!).toBeCloseTo(0.005, 6);
    expect(withTp.netReturn!).toBeLessThan(withTp.grossReturn!);
    expect(withTp.totalCost!).toBeCloseTo(withTp.grossReturn! - withTp.netReturn!, 9);
  });
});
