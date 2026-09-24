import { describe, expect, it } from 'vitest';
import { jakartaTodayIso, pickNewestCsv } from '../route';

describe('idx-ic-sync helpers', () => {
  it('memilih CSV hari ini bila ada', () => {
    const files = ['idx-ic-2026-09-20.csv', 'idx-ic-2026-09-25.csv', 'idx-ic-2026-09-24.csv'];
    expect(pickNewestCsv(files, '2026-09-25')).toBe('idx-ic-2026-09-25.csv');
  });

  it('jatuh ke CSV terbaru yang ada bila hari ini belum turun', () => {
    const files = ['idx-ic-2026-09-20.csv', 'idx-ic-2026-09-24.csv'];
    expect(pickNewestCsv(files, '2026-09-25')).toBe('idx-ic-2026-09-24.csv');
  });

  it('mengabaikan berkas yang bukan pola CSV klasifikasi', () => {
    expect(pickNewestCsv(['catatan.txt', 'idx-ic-baru.csv'], '2026-09-25')).toBeNull();
    expect(pickNewestCsv([], '2026-09-25')).toBeNull();
  });

  it('menghitung tanggal WIB, bukan UTC (00:30 WIB masih hari yang sama)', () => {
    // 2026-09-24T17:30:00Z === 2026-09-25T00:30 WIB
    expect(jakartaTodayIso(new Date('2026-09-24T17:30:00Z'))).toBe('2026-09-25');
    // 2026-09-25T16:59:00Z === 2026-09-25T23:59 WIB
    expect(jakartaTodayIso(new Date('2026-09-25T16:59:00Z'))).toBe('2026-09-25');
  });
});
