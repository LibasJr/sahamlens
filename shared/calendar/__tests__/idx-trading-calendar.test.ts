import { describe, expect, it } from 'vitest';
import { getAiPickScanWindow } from '../idx-trading-calendar';

// Input Date dibuat dalam UTC agar ekspektasi WIB deterministik (WIB = UTC+7).
describe('getAiPickScanWindow', () => {
  it('mengizinkan sesi reguler Senin-Kamis', () => {
    expect(getAiPickScanWindow(new Date('2026-08-06T02:00:00Z'))).toBe('REGULAR_SESSION'); // Thu 09:00 WIB
    expect(getAiPickScanWindow(new Date('2026-08-06T06:30:00Z'))).toBe('REGULAR_SESSION'); // Thu 13:30 WIB
    expect(getAiPickScanWindow(new Date('2026-08-06T08:45:00Z'))).toBe('REGULAR_SESSION'); // Thu 15:45 WIB
  });

  it('skip jeda siang Senin-Kamis', () => {
    expect(getAiPickScanWindow(new Date('2026-08-06T05:15:00Z'))).toBe('CLOSED'); // Thu 12:15 WIB
    expect(getAiPickScanWindow(new Date('2026-08-06T06:15:00Z'))).toBe('CLOSED'); // Thu 13:15 WIB
  });

  it('mengikuti jam Jumat yang berbeda', () => {
    expect(getAiPickScanWindow(new Date('2026-08-07T04:15:00Z'))).toBe('REGULAR_SESSION'); // Fri 11:15 WIB
    expect(getAiPickScanWindow(new Date('2026-08-07T04:30:00Z'))).toBe('CLOSED'); // Fri 11:30 WIB
    expect(getAiPickScanWindow(new Date('2026-08-07T07:00:00Z'))).toBe('REGULAR_SESSION'); // Fri 14:00 WIB
  });

  it('mengizinkan satu final close sekitar 16:15 WIB', () => {
    expect(getAiPickScanWindow(new Date('2026-08-07T09:15:00Z'))).toBe('FINAL_CLOSE'); // Fri 16:15 WIB
    expect(getAiPickScanWindow(new Date('2026-08-07T09:30:00Z'))).toBe('CLOSED'); // Fri 16:30 WIB
  });

  it('tidak scan pada akhir pekan', () => {
    expect(getAiPickScanWindow(new Date('2026-08-08T03:00:00Z'))).toBe('CLOSED'); // Sat 10:00 WIB
  });
});
