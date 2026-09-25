import { describe, expect, it } from 'vitest';
import {
  hitungUmurHari,
  nilaiLiveCheck,
  ringkasLiveData,
  tanggalWib,
  type AraLiveDataCheck,
} from '../ara-live-data-readiness.service';

const HARI_INI = '2026-09-25';

function check(partial: Partial<AraLiveDataCheck>): AraLiveDataCheck {
  return {
    key: 'BASIS_HARIAN',
    label: 'Basis harian',
    status: 'READY',
    lastDate: '2026-09-25',
    coverage: 900,
    minCoverage: 100,
    ageDays: 0,
    maxAgeDays: 4,
    detail: 'uji',
    ...partial,
  };
}

describe('hitungUmurHari', () => {
  it('menghitung umur kalender yang sama sebagai 0', () => {
    expect(hitungUmurHari('2026-09-25', HARI_INI)).toBe(0);
  });
  it('menghitung umur beberapa hari', () => {
    expect(hitungUmurHari('2026-09-18', HARI_INI)).toBe(7);
  });
  it('mengembalikan null untuk tanggal tidak sah', () => {
    expect(hitungUmurHari('bukan-tanggal', HARI_INI)).toBeNull();
  });
});

describe('nilaiLiveCheck', () => {
  it('READY bila data hari ini dan cakupan memadai', () => {
    expect(
      nilaiLiveCheck({ lastDate: HARI_INI, coverage: 921, minCoverage: 100, maxAgeDays: 4, todayIso: HARI_INI }),
    ).toBe('READY');
  });
  it('STALE bila lebih tua dari batas hari', () => {
    expect(
      nilaiLiveCheck({ lastDate: '2026-09-18', coverage: 921, minCoverage: 100, maxAgeDays: 4, todayIso: HARI_INI }),
    ).toBe('STALE');
  });
  it('THIN bila cakupan di bawah minimum meski segar', () => {
    expect(
      nilaiLiveCheck({ lastDate: HARI_INI, coverage: 42, minCoverage: 100, maxAgeDays: 4, todayIso: HARI_INI }),
    ).toBe('THIN');
  });
  it('MISSING bila tidak ada baris', () => {
    expect(nilaiLiveCheck({ lastDate: null, coverage: 0, minCoverage: 100, maxAgeDays: 4, todayIso: HARI_INI })).toBe(
      'MISSING',
    );
  });
  it('UNAVAILABLE bila query gagal - tidak pernah dianggap READY', () => {
    expect(
      nilaiLiveCheck({
        lastDate: HARI_INI,
        coverage: 921,
        minCoverage: 100,
        maxAgeDays: 4,
        todayIso: HARI_INI,
        error: 'koneksi putus',
      }),
    ).toBe('UNAVAILABLE');
  });
  it('UNAVAILABLE bila tanggal di masa depan (jam salah / data rusak)', () => {
    expect(
      nilaiLiveCheck({ lastDate: '2026-10-02', coverage: 900, minCoverage: 100, maxAgeDays: 4, todayIso: HARI_INI }),
    ).toBe('UNAVAILABLE');
  });
});

describe('ringkasLiveData', () => {
  const checkedAt = '2026-09-25T00:00:00.000Z';
  it('READY bila semua pemeriksaan READY', () => {
    const hasil = ringkasLiveData([check({}), check({ key: 'BAR_INTRADAY', label: 'Bar intraday' })], checkedAt);
    expect(hasil.status).toBe('READY');
    expect(hasil.problemCount).toBe(0);
  });
  it('PARTIAL bila ada satu yang STALE dan menyebutkannya di alasan', () => {
    const hasil = ringkasLiveData(
      [check({}), check({ key: 'BAR_INTRADAY', label: 'Bar intraday', status: 'STALE' })],
      checkedAt,
    );
    expect(hasil.status).toBe('PARTIAL');
    expect(hasil.reason).toContain('Bar intraday=STALE');
  });
  it('UNAVAILABLE bila SEMUA pemeriksaan gagal', () => {
    const hasil = ringkasLiveData(
      [check({ status: 'UNAVAILABLE' }), check({ key: 'BAR_INTRADAY', status: 'UNAVAILABLE' })],
      checkedAt,
    );
    expect(hasil.status).toBe('UNAVAILABLE');
  });
});

describe('tanggalWib', () => {
  it('memakai zona WIB, bukan UTC (23:00 UTC = besoknya di WIB)', () => {
    expect(tanggalWib(new Date('2026-09-24T23:30:00.000Z'))).toBe('2026-09-25');
  });
  it('tengah malam UTC masih tanggal yang sama di WIB pagi', () => {
    expect(tanggalWib(new Date('2026-09-25T00:00:00.000Z'))).toBe('2026-09-25');
  });
});