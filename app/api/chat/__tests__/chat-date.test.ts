import { describe, expect, it } from 'vitest';
import { resolveChatDate } from '../chat-date';

describe('historical date detection', () => {
  it('mendeteksi ISO date', () => {
    expect(resolveChatDate('analisis fundamental ADRO 2025-04-30').requestedAsOf).toBe('2025-04-30');
  });

  it('mendeteksi tanggal Indonesia case-insensitive', () => {
    expect(resolveChatDate('ADRO per 30 April 2025').requestedAsOf).toBe('2025-04-30');
    expect(resolveChatDate('BREN tanggal 30 april 2025').requestedAsOf).toBe('2025-04-30');
  });

  it('menolak tanggal kalender palsu dan tidak jatuh ke current', () => {
    const result = resolveChatDate('ADRO 31 Februari 2025');
    expect(result.mode).toBe('HISTORICAL');
    expect(result.requestedAsOf).toBeNull();
    expect(result.invalidDate).toBe('31 februari 2025');
  });

  it('tidak menganggap angka tahun saja sebagai requested_as_of', () => {
    expect(resolveChatDate('buat investasi 1 tahun sampai 2027').mode).toBe('CURRENT');
  });

  it('bulan+tahun tanpa hari ditandai incomplete, bukan ditebak akhir bulan', () => {
    const result = resolveChatDate('kalau per April 2025 gimana?');
    expect(result.mode).toBe('HISTORICAL');
    expect(result.requestedAsOf).toBeNull();
    expect(result.incompleteDate).toBe('april 2025');
  });

  it('follow-up sehari sebelumnya memakai tanggal historical terakhir', () => {
    const result = resolveChatDate('kalau sehari sebelumnya?', [
      { role: 'user', content: 'ADRO per 30 April 2025 gimana?' },
      { role: 'assistant', content: '...' },
    ]);
    expect(result.requestedAsOf).toBe('2025-04-29');
    expect(result.source).toBe('relative');
  });

  it('follow-up contextual mewarisi tanggal historical terakhir', () => {
    const result = resolveChatDate('kenapa ROE-nya kecil?', [
      { role: 'user', content: 'ADRO per 30 April 2025 gimana?' },
      { role: 'assistant', content: '...' },
    ]);
    expect(result.mode).toBe('HISTORICAL');
    expect(result.requestedAsOf).toBe('2025-04-30');
    expect(result.source).toBe('context');
  });

  it('marker sekarang memutus inheritance historical secara eksplisit', () => {
    const result = resolveChatDate('teknikalnya sekarang?', [
      { role: 'user', content: 'ADRO per 30 April 2025 gimana?' },
      { role: 'assistant', content: '...' },
    ]);
    expect(result.mode).toBe('CURRENT');
    expect(result.requestedAsOf).toBeNull();
  });

  it('permintaan sebelum laporan tanpa tanggal pasti tidak dianggap current', () => {
    const result = resolveChatDate('kalau sebelum laporan Q1 keluar bagaimana?');
    expect(result.mode).toBe('HISTORICAL');
    expect(result.requestedAsOf).toBeNull();
    expect(result.incompleteDate).toContain('publikasi laporan');
  });

});
