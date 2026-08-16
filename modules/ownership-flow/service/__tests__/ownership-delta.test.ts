import { describe, expect, it } from 'vitest';
import { computeDelta, computeDeltaSet, computePreviousPeriodChange, diffCalendarDays, shiftDays } from '../ownership-delta';
import type { ObservationPoint } from '../ownership-delta';

// Delta adalah tempat paling mudah menyelinapkan angka palsu: "tidak ada
// pembanding" sangat mudah tertulis sebagai 0, dan 0 terbaca sebagai "kepemilikan
// stabil" - sebuah klaim yang tidak pernah diukur. Test di bawah menjaga batas itu.

const daily: ObservationPoint[] = [
  { observedDate: '2026-07-16', foreignPct: 41.43 },
  { observedDate: '2026-08-08', foreignPct: 42.24 },
  { observedDate: '2026-08-14', foreignPct: 42.61 },
  { observedDate: '2026-08-15', foreignPct: 42.75 },
];

describe('helper tanggal', () => {
  it('menghitung selisih hari kalender', () => {
    expect(diffCalendarDays('2026-08-14', '2026-08-15')).toBe(1);
    expect(diffCalendarDays('2026-07-16', '2026-08-15')).toBe(30);
  });

  it('menggeser tanggal melewati batas bulan', () => {
    expect(shiftDays('2026-08-15', -30)).toBe('2026-07-16');
    expect(shiftDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('computeDelta', () => {
  it('memakai observasi tepat pada batas horizon', () => {
    const delta = computeDelta(daily, 1);
    expect(delta.pp).toBeCloseTo(0.14, 10);
    expect(delta.basisObservedDate).toBe('2026-08-14');
    expect(delta.actualGapDays).toBe(1);
  });

  it('memakai observasi TERDEKAT SEBELUM batas ketika tanggal persisnya tidak ada', () => {
    // Batas 7 hari dari 2026-08-15 adalah 2026-08-08 - kebetulan ada. Untuk
    // horizon 5 hari, batasnya 2026-08-10 dan observasi terdekat yang masih
    // <= batas adalah 2026-08-08 (7 hari lalu), bukan 2026-08-14.
    const delta = computeDelta(daily, 5);
    expect(delta.basisObservedDate).toBe('2026-08-08');
    // Jarak SEBENARNYA dilaporkan apa adanya - label horizon tidak boleh
    // menyembunyikan bahwa pembandingnya berumur 7 hari, bukan 5.
    expect(delta.actualGapDays).toBe(7);
    expect(delta.pp).toBeCloseTo(0.51, 10);
  });

  it('mengembalikan null - BUKAN 0 - ketika histori belum mencapai horizon', () => {
    const shortHistory: ObservationPoint[] = [
      { observedDate: '2026-08-14', foreignPct: 42.61 },
      { observedDate: '2026-08-15', foreignPct: 42.75 },
    ];
    const delta = computeDelta(shortHistory, 30);
    expect(delta.pp).toBeNull();
    expect(delta.pp).not.toBe(0);
    expect(delta.basisObservedDate).toBeNull();
    expect(delta.actualGapDays).toBeNull();
  });

  it('mengembalikan null ketika hanya ada satu observasi', () => {
    expect(computeDelta([{ observedDate: '2026-08-15', foreignPct: 42.75 }], 1).pp).toBeNull();
  });

  it('mengembalikan null ketika histori kosong', () => {
    expect(computeDelta([], 1).pp).toBeNull();
  });

  it('melewati observasi yang foreignPct-nya null dan mencari yang lebih tua', () => {
    const withGap: ObservationPoint[] = [
      { observedDate: '2026-08-01', foreignPct: 40.0 },
      { observedDate: '2026-08-10', foreignPct: null },
      { observedDate: '2026-08-15', foreignPct: 42.75 },
    ];
    const delta = computeDelta(withGap, 1);
    expect(delta.basisObservedDate).toBe('2026-08-01');
    expect(delta.pp).toBeCloseTo(2.75, 10);
  });

  it('mengembalikan null ketika observasi terkini tidak punya foreignPct', () => {
    const noCurrent: ObservationPoint[] = [
      { observedDate: '2026-08-01', foreignPct: 40.0 },
      { observedDate: '2026-08-15', foreignPct: null },
    ];
    expect(computeDelta(noCurrent, 1).pp).toBeNull();
  });

  it('TIDAK PERNAH membandingkan observasi dengan dirinya sendiri', () => {
    // Duplikat tanggal (mis. dua sumber pada hari yang sama) tidak boleh
    // menghasilkan delta 0 yang terbaca sebagai "stabil".
    const duplicated: ObservationPoint[] = [
      { observedDate: '2026-08-15', foreignPct: 42.75 },
      { observedDate: '2026-08-15', foreignPct: 42.75 },
    ];
    expect(computeDelta(duplicated, 1).pp).toBeNull();
  });

  it('menghitung penurunan sebagai nilai negatif', () => {
    const falling: ObservationPoint[] = [
      { observedDate: '2026-08-14', foreignPct: 43.0 },
      { observedDate: '2026-08-15', foreignPct: 42.0 },
    ];
    expect(computeDelta(falling, 1).pp).toBeCloseTo(-1, 10);
  });
});

describe('computeDeltaSet - sumber bercadence bulanan', () => {
  // Kasus nyata kalau sumber ternyata bulanan: delta 1D dan 7D memang TIDAK ADA,
  // dan itu harus terlihat sebagai null, bukan sebagai 0 pp yang menenangkan.
  const monthly: ObservationPoint[] = [
    { observedDate: '2026-05-31', foreignPct: 40.0 },
    { observedDate: '2026-06-30', foreignPct: 41.0 },
    { observedDate: '2026-07-31', foreignPct: 42.0 },
  ];

  it('menghasilkan null untuk horizon yang lebih pendek dari cadence', () => {
    const set = computeDeltaSet(monthly);
    expect(set.d1.pp).toBeCloseTo(1, 10);
    // d1: batas 2026-07-30, observasi terdekat sebelumnya 2026-06-30 (31 hari).
    expect(set.d1.actualGapDays).toBe(31);
    expect(set.d30.basisObservedDate).toBe('2026-06-30');
  });

  it('melaporkan jarak sebenarnya supaya label horizon tidak berbohong', () => {
    const set = computeDeltaSet(monthly);
    expect(set.d7.actualGapDays).toBe(31);
    expect(set.d30.actualGapDays).toBe(31);
  });
});


describe('computePreviousPeriodChange', () => {
  it('membandingkan snapshot terbaru dengan snapshot sebelumnya dan menghitung asing + lokal', () => {
    const result = computePreviousPeriodChange([
      { observedDate: '2026-06-30', foreignPct: 41.2, localPct: 58.8, scriplessPct: 100 },
      { observedDate: '2026-07-31', foreignPct: 41.65, localPct: 58.35, scriplessPct: 100 },
    ]);
    expect(result.basisObservedDate).toBe('2026-06-30');
    expect(result.actualGapDays).toBe(31);
    expect(result.foreignPp).toBeCloseTo(0.45, 10);
    expect(result.localPp).toBeCloseTo(-0.45, 10);
    expect(result.scriplessPp).toBe(0);
  });

  it('melewati duplikat tanggal terbaru dan tidak membuat delta 0 palsu', () => {
    const result = computePreviousPeriodChange([
      { observedDate: '2026-06-30', foreignPct: 40, localPct: 60 },
      { observedDate: '2026-07-31', foreignPct: 41, localPct: 59 },
      { observedDate: '2026-07-31', foreignPct: 41, localPct: 59 },
    ]);
    expect(result.basisObservedDate).toBe('2026-06-30');
    expect(result.foreignPp).toBe(1);
  });

  it('mengembalikan null ketika belum ada snapshot pembanding', () => {
    const result = computePreviousPeriodChange([
      { observedDate: '2026-07-31', foreignPct: 41, localPct: 59 },
    ]);
    expect(result.basisObservedDate).toBeNull();
    expect(result.foreignPp).toBeNull();
    expect(result.localPp).toBeNull();
  });
});
