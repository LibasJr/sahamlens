import { describe, expect, it } from 'vitest';
import {
  assessDataTimestamp,
  isTimestampUnusable,
  CLOCK_SKEW_TOLERANCE_MINUTES,
} from '../data-timestamp-guard';

const NOW = new Date('2026-09-14T10:00:00+07:00');

function minutesFromNow(m: number): string {
  return new Date(NOW.getTime() + m * 60_000).toISOString();
}

describe('002 - lima kasus timestamp yang ditetapkan V2', () => {
  it('1. timestamp normal -> VALID dengan umur positif', () => {
    const r = assessDataTimestamp(minutesFromNow(-30), NOW);
    expect(r.validity).toBe('VALID');
    expect(r.ageMinutes).toBeCloseTo(30, 5);
    expect(r.reason).toBeNull();
    expect(isTimestampUnusable(r)).toBe(false);
  });

  it('2. timestamp stale -> tetap VALID, umurnya besar (kesegaran bukan urusan guard ini)', () => {
    // Pembagian tugas: guard ini menilai KEABSAHAN, bukan kesegaran. Data lama
    // adalah data sah yang kebetulan tua - pemanggil yang memutuskan ambangnya.
    const r = assessDataTimestamp(minutesFromNow(-5000), NOW);
    expect(r.validity).toBe('VALID');
    expect(r.ageMinutes).toBeGreaterThan(4000);
  });

  it('3. timestamp invalid -> UNPARSEABLE, umur null', () => {
    for (const bad of ['bukan-tanggal', '', '   ', null, undefined]) {
      const r = assessDataTimestamp(bad as string, NOW);
      expect(r.validity).toBe('UNPARSEABLE');
      expect(r.ageMinutes).toBeNull();
      expect(isTimestampUnusable(r)).toBe(true);
    }
  });

  it('4. timestamp masa depan -> FUTURE, umur null, TIDAK dianggap segar', () => {
    // Inti butir 002. Sebelum perbaikan, ini menghasilkan umur 0 menit.
    const r = assessDataTimestamp(minutesFromNow(60), NOW);
    expect(r.validity).toBe('FUTURE');
    expect(r.ageMinutes).toBeNull();
    expect(r.reason).toContain('MASA DEPAN');
    expect(isTimestampUnusable(r)).toBe(true);
  });

  it('5. clock skew dalam toleransi -> tetap VALID', () => {
    // Drift NTP wajar tidak boleh membuat guard ini berisik.
    const r = assessDataTimestamp(minutesFromNow(CLOCK_SKEW_TOLERANCE_MINUTES - 0.5), NOW);
    expect(r.validity).toBe('VALID');
    expect(isTimestampUnusable(r)).toBe(false);
  });
});

describe('002 - batas toleransi diperiksa tepat, bukan kira-kira', () => {
  it('tepat di batas toleransi masih VALID', () => {
    expect(assessDataTimestamp(minutesFromNow(CLOCK_SKEW_TOLERANCE_MINUTES), NOW).validity)
      .toBe('VALID');
  });

  it('sedikit di luar toleransi sudah FUTURE', () => {
    expect(assessDataTimestamp(minutesFromNow(CLOCK_SKEW_TOLERANCE_MINUTES + 0.1), NOW).validity)
      .toBe('FUTURE');
  });

  it('umur negatif kecil TIDAK dijepit ke nol - pemanggil melihat keadaan sebenarnya', () => {
    const r = assessDataTimestamp(minutesFromNow(1), NOW);
    expect(r.validity).toBe('VALID');
    expect(r.ageMinutes).toBeLessThan(0);
  });
});
