import { describe, expect, it } from 'vitest';
import { isMarketOpen, getMarketStatus } from '../market';

describe('market status and holiday calendar', () => {
  it('17 Agustus (Hari Kemerdekaan RI) adalah libur bursa walau hari Senin jam 10:00 WIB', () => {
    const holidayDate = new Date('2026-08-17T03:00:00.000Z'); // 10:00 WIB
    expect(isMarketOpen(holidayDate)).toBe(false);
    const status = getMarketStatus(holidayDate);
    expect(status.isOpen).toBe(false);
    expect(status.holidayName).toBe('Hari Kemerdekaan Republik Indonesia');
    expect(status.label).toBe('Libur Bursa (Hari Kemerdekaan Republik Indonesia)');
  });

  it('Hari kerja normal di jam bursa (Selasa 10:00 WIB) mengembalikan Bursa Buka', () => {
    const tradingDate = new Date('2026-08-18T03:00:00.000Z'); // 10:00 WIB
    expect(isMarketOpen(tradingDate)).toBe(true);
    const status = getMarketStatus(tradingDate);
    expect(status.isOpen).toBe(true);
    expect(status.label).toBe('Bursa Buka');
    expect(status.holidayName).toBeNull();
  });

  it('Akhir pekan (Sabtu) mengembalikan Libur Akhir Pekan', () => {
    const saturday = new Date('2026-08-22T03:00:00.000Z');
    expect(isMarketOpen(saturday)).toBe(false);
    const status = getMarketStatus(saturday);
    expect(status.isOpen).toBe(false);
    expect(status.label).toBe('Libur Akhir Pekan');
  });

  it('Hari kerja di luar jam bursa (Selasa 20:00 WIB) mengembalikan Bursa Tutup', () => {
    const evening = new Date('2026-08-18T13:00:00.000Z'); // 20:00 WIB
    expect(isMarketOpen(evening)).toBe(false);
    const status = getMarketStatus(evening);
    expect(status.isOpen).toBe(false);
    expect(status.label).toBe('Bursa Tutup');
  });
});
