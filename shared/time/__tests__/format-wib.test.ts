import { describe, expect, it } from 'vitest';
import { formatIsoTimestampsToWib, formatWibDateTime } from '../format-wib';

describe('formatWibDateTime', () => {
  it('mengubah ISO UTC ke waktu Asia/Jakarta dengan label WIB', () => {
    expect(formatWibDateTime('2026-08-28T09:02:00.000Z')).toBe('28 Agu 2026, 16:02 WIB');
  });

  it('menangani pergantian hari setelah konversi UTC -> WIB', () => {
    expect(formatWibDateTime('2026-08-28T20:30:00.000Z')).toBe('29 Agu 2026, 03:30 WIB');
  });

  it('fail closed untuk timestamp kosong atau tidak valid', () => {
    expect(formatWibDateTime(null)).toBeNull();
    expect(formatWibDateTime('not-a-date')).toBeNull();
  });
});

describe('formatIsoTimestampsToWib', () => {
  it('mengganti timestamp ISO di teks tanpa mengubah tanggal as-of polos', () => {
    const input = 'As-of 2026-08-28. Timestamp bar terakhir: 2026-08-28T09:02:00.000Z';
    expect(formatIsoTimestampsToWib(input)).toBe(
      'As-of 2026-08-28. Timestamp bar terakhir: 28 Agu 2026, 16:02 WIB',
    );
  });

  it('mengganti lebih dari satu timestamp dalam satu blok', () => {
    const input = 'A=2026-08-28T09:02:00Z; B=2026-08-28T20:30:00.000Z';
    expect(formatIsoTimestampsToWib(input)).toBe('A=28 Agu 2026, 16:02 WIB; B=29 Agu 2026, 03:30 WIB');
  });
});
