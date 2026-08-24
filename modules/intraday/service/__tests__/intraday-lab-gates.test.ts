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
  DEFAULT_INTRADAY_COMPONENT_MAPPING,
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

describe('#7 pemetaan volumeSurge berpusat pada sebaran fiturnya', () => {
  /**
   * Diukur dari 26.606 sinyal produksi (60 emiten, 57 hari bursa, 2 Juni - 21 Agustus
   * 2026): median rasio volumeSurge 0,7169, dan 1,0 justru di persentil 67,7. Pemetaan
   * lama berpusat di 1,0, jadi observasi MEDIAN berskor ~41 - bias turun sistematis yang
   * menular ke setiap skor.
   *
   * Yang dikunci di sini BENTUK pemetaannya, bukan hasilnya: rasio yang sama dengan
   * pusat harus berskor tepat 50, dan pusatnya tidak boleh diam-diam kembali ke 1,0.
   */
  const mapping = DEFAULT_INTRADAY_COMPONENT_MAPPING;
  const N = 18;

  /**
   * Bar dengan volumeSurge yang diketahui persis.
   * surge = mean(3 bar terakhir) / mean(seluruh bar). Dengan `a` untuk (N-3) bar awal
   * dan `b` untuk 3 bar akhir: b = surge(N-3) / (N - 3*surge).
   */
  function barsWithSurge(surge: number) {
    const b = (surge * (N - 3)) / (N - 3 * surge);
    return Array.from({ length: N }, (_, i) => ({
      ticker: 'T.JK', tradingDate: '2026-08-20', unixSeconds: 0,
      wibMinute: 9 * 60 + i * 5,
      open: 100, high: 100, low: 100, close: 100,
      volume: (i < N - 3 ? 1 : b) * 1000,
    })) as never[];
  }

  function snapshot(surge: number) {
    return computeIntradayComponents(barsWithSurge(surge), mapping)!;
  }

  it('konstruksi barnya benar-benar menghasilkan rasio yang diminta', () => {
    // Penjaga: kalau helper ini meleset, seluruh test di bawah menguji hal lain.
    for (const s of [0.3, 0.72, 1.0, 2.0, 4.0]) {
      expect(snapshot(s).raw.volumeSurge, `surge ${s}`).toBeCloseTo(s, 4);
    }
  });

  it('pusatnya diukur, bukan diasumsikan 1,0', () => {
    expect(mapping.volumeSurgeCenter).toBeCloseTo(0.72, 6);
    expect(mapping.volumeSurgeCenter, 'pusat kembali ke asumsi lama 1,0').not.toBe(1);
    expect(mapping.volumeSurgeSpan, 'span kembali menyempit').toBeGreaterThan(2.5);
  });

  it('rasio tepat di pusat berskor 50', () => {
    expect(snapshot(mapping.volumeSurgeCenter).scored.volumeSurge).toBeCloseTo(50, 1);
  });

  it('rasio 1,0 berskor DI ATAS 50 - ia memang di atas median, bukan netral', () => {
    const s = snapshot(1.0).scored.volumeSurge;
    expect(s).toBeGreaterThan(50);
    // Pemetaan lama memberi tepat 50 di sini; itu yang membuat median jadi ~41.
    expect(s).toBeLessThan(70);
  });

  it('skor naik monoton terhadap rasio volume', () => {
    const nilai = [0.2, 0.5, 0.72, 1.0, 2.0, 4.0].map((x) => snapshot(x).scored.volumeSurge);
    for (let i = 1; i < nilai.length; i++) {
      expect(nilai[i]!, `tidak monoton di indeks ${i}: ${nilai.join(', ')}`).toBeGreaterThanOrEqual(nilai[i - 1]!);
    }
    expect(nilai[0]!).toBeLessThan(50);
    expect(nilai[nilai.length - 1]!).toBeGreaterThan(50);
  });
});

describe('#8 protokol OOS beku menyebut pemetaan apa adanya', () => {
  /**
   * Protokol beku adalah artefak yang paling lama hidup di modul ini - ia dibaca
   * berbulan-bulan kemudian oleh orang yang tidak membuka kode. Sampai 24 Agustus 2026
   * deskripsi volumeSurge-nya hanya menyebut span, sehingga pembacanya wajar
   * menyimpulkan skalanya berpusat di 1,0 - persis asumsi yang ternyata salah.
   *
   * Angkanya sendiri memang ikut dibekukan lewat `componentMapping`, jadi tidak ada yang
   * hilang. Yang diperbaiki adalah kalimatnya, supaya bukti numerik dan penjelasannya
   * tidak saling membantah.
   */
  const researchSource = stripComments(
    readFileSync(path.join(ROOT, 'modules/intraday/service/intraday-research.service.ts'), 'utf8')
  );

  it('deskripsi volumeSurge menyebut pusat skalanya, bukan hanya span', () => {
    const baris = researchSource.match(/volumeSurge: `[^`]*`/)?.[0] ?? '';
    expect(baris, 'deskripsi volumeSurge di protokol tidak ditemukan').not.toBe('');
    expect(baris, 'pusat skala tidak disebut - pembaca akan mengira 1,0').toContain('volumeSurgeCenter');
    expect(baris).toContain('volumeSurgeSpan');
  });

  it('jendela momentum dan tren tidak diklaim tetap', () => {
    expect(researchSource).toContain('MOMENTUM_DOC_BARS');
    expect(researchSource).toContain('TREND_DOC_BARS');
    expect(researchSource, 'panjang jendela ditulis sebagai angka mati').not.toMatch(/return 30 menit dipetakan/);
    expect(researchSource).toContain('lookbackCaveat');
  });

  it('componentMapping tetap dibekukan sebagai angka, bukan hanya kalimat', () => {
    expect(researchSource).toContain('componentMapping: config.componentMapping');
  });
});
