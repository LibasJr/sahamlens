import { describe, expect, it } from 'vitest';
import {
  MARKET_CLOSED_TTL_SEC,
  MARKET_OPEN_TTL_SEC,
  getMarketAwareTtlSec,
  isIdxMarketOpen,
  secondsUntilNextMarketOpen,
} from '../ttl-policy';

/** Jam dinding WIB (UTC+7, tanpa DST) sebagai Date absolut. */
function wib(iso: string): Date {
  return new Date(`${iso}+07:00`);
}

describe('isIdxMarketOpen', () => {
  it('buka pada hari kerja 09:00-15:59 WIB', () => {
    expect(isIdxMarketOpen(wib('2026-08-24T09:00:00'))).toBe(true);
    expect(isIdxMarketOpen(wib('2026-08-24T15:59:59'))).toBe(true);
  });

  it('tutup sebelum 09:00, sejak 16:00, dan sepanjang akhir pekan', () => {
    expect(isIdxMarketOpen(wib('2026-08-24T08:59:59'))).toBe(false);
    expect(isIdxMarketOpen(wib('2026-08-24T16:00:00'))).toBe(false);
    expect(isIdxMarketOpen(wib('2026-08-22T10:00:00'))).toBe(false); // Sabtu
    expect(isIdxMarketOpen(wib('2026-08-23T10:00:00'))).toBe(false); // Minggu
  });
});

describe('secondsUntilNextMarketOpen', () => {
  it('menghitung sisa waktu menuju 09:00 di hari yang sama', () => {
    expect(secondsUntilNextMarketOpen(wib('2026-08-24T04:00:00'))).toBe(5 * 60 * 60);
  });

  it('melompati akhir pekan', () => {
    // Jumat 16:00 -> Senin 09:00 = 65 jam
    expect(secondsUntilNextMarketOpen(wib('2026-08-21T16:00:00'))).toBe(65 * 60 * 60);
    // Sabtu 10:00 -> Senin 09:00 = 47 jam
    expect(secondsUntilNextMarketOpen(wib('2026-08-22T10:00:00'))).toBe(47 * 60 * 60);
  });

  it('sesudah penutupan menunjuk pembukaan hari kerja berikutnya', () => {
    // Senin 16:30 -> Selasa 09:00 = 16,5 jam
    expect(secondsUntilNextMarketOpen(wib('2026-08-24T16:30:00'))).toBe(16.5 * 60 * 60);
  });

  it('tidak bergantung timezone server - input UTC memberi hasil sama', () => {
    // 2026-08-24T04:00 WIB == 2026-08-23T21:00Z
    expect(secondsUntilNextMarketOpen(new Date('2026-08-23T21:00:00Z'))).toBe(5 * 60 * 60);
  });
});

describe('getMarketAwareTtlSec', () => {
  it('60 detik selama sesi berjalan', () => {
    expect(getMarketAwareTtlSec(wib('2026-08-24T10:00:00'))).toBe(MARKET_OPEN_TTL_SEC);
  });

  it('REGRESI: cache pra-bursa tidak boleh hidup melewati pembukaan', () => {
    // Kasus nyata 2026-08-24: cache teknikal ditulis 04:00 dengan TTL 6 jam dan baru
    // kedaluwarsa 10:01, sehingga jam pertama perdagangan menyajikan harga pukul 04:00.
    const ttl = getMarketAwareTtlSec(wib('2026-08-24T04:00:00'));
    expect(ttl).toBe(5 * 60 * 60);
    expect(ttl).toBeLessThan(MARKET_CLOSED_TTL_SEC);

    const expiresAt = wib('2026-08-24T04:00:00').getTime() + ttl * 1000;
    expect(expiresAt).toBe(wib('2026-08-24T09:00:00').getTime());
  });

  it('tetap 6 jam kalau pembukaan berikutnya masih jauh (malam & akhir pekan)', () => {
    expect(getMarketAwareTtlSec(wib('2026-08-24T22:00:00'))).toBe(MARKET_CLOSED_TTL_SEC);
    expect(getMarketAwareTtlSec(wib('2026-08-22T10:00:00'))).toBe(MARKET_CLOSED_TTL_SEC);
  });

  it('tepat sebelum pembukaan TTL menyusut, bukan melar', () => {
    expect(getMarketAwareTtlSec(wib('2026-08-24T08:59:00'))).toBe(60);
  });
});
