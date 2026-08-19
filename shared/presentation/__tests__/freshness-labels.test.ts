import { describe, expect, it } from 'vitest';
import { describeFreshness, formatJakartaTime } from '../freshness-labels';

/**
 * Kesegaran data adalah pernyataan kepercayaan, bukan hiasan. Dua invarian yang paling
 * mahal kalau hilang: data BASI harus terlihat sebagai peringatan, dan umur yang TIDAK
 * DIKETAHUI tidak boleh terbaca seperti data baru.
 */

describe('kesegaran data', () => {
  it('STALE selalu bernada caution dan menyebut dirinya tertunda', () => {
    const hasil = describeFreshness('STALE', '2026-08-17T09:32:00.000Z');
    expect(hasil.tone).toBe('text-tv-yellow');
    expect(hasil.label.toLowerCase()).toContain('tertunda');
    expect(hasil.detail).toContain('Terakhir diperbarui');
  });

  it('umur tidak diketahui dinyatakan apa adanya, bukan dianggap segar', () => {
    for (const nilai of [null, undefined, 'UNKNOWN', 'ENTAH']) {
      const hasil = describeFreshness(nilai, null);
      expect(hasil.label.toLowerCase()).toContain('tidak diketahui');
      expect(hasil.tone).not.toBe('text-tv-green');
    }
  });

  it('DELAYED dan EOD netral - keduanya keadaan normal, bukan masalah', () => {
    expect(describeFreshness('DELAYED', null).tone).toBe('text-tv-text');
    expect(describeFreshness('EOD', null).tone).toBe('text-tv-text');
  });

  it('tidak ada status yang mengklaim realtime', () => {
    // Yahoo Finance gratis tidak pernah realtime untuk IDX; klaim itu akan menyesatkan.
    for (const nilai of ['DELAYED', 'EOD', 'STALE', 'UNKNOWN']) {
      const hasil = describeFreshness(nilai, '2026-08-20T08:00:00.000Z');
      expect(`${hasil.label} ${hasil.shortLabel} ${hasil.detail}`.toLowerCase()).not.toContain('realtime');
    }
  });

  it('timestamp rusak tidak memunculkan "Invalid Date" di layar', () => {
    expect(formatJakartaTime('bukan tanggal')).toBeNull();
    expect(formatJakartaTime(null)).toBeNull();
    const hasil = describeFreshness('DELAYED', 'bukan tanggal');
    expect(hasil.shortLabel).not.toContain('Invalid');
    expect(hasil.detail).not.toContain('Invalid');
  });

  it('waktu dirender di zona Jakarta, bukan zona server', () => {
    // 2026-08-20T08:00:00Z = pukul 15 WIB (UTC+7). Pemisah jam-menit sengaja TIDAK
    // dipatok: locale id-ID memakai titik ("15.00"), dan memaksanya menjadi ":" akan
    // membuat halaman ini satu-satunya yang berbeda dari sisa aplikasi.
    const hasil = formatJakartaTime('2026-08-20T08:00:00.000Z');
    expect(hasil).toMatch(/15[.:]00/);
    expect(hasil).toContain('WIB');
    expect(hasil).toContain('Agu');
  });
});
