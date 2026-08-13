import { describe, it, expect } from 'vitest';
import { resolvePreviousClose } from '../previous-close';

// Timestamp tengah hari WIB supaya konversi zona tidak menggeser tanggal bursa.
function wibNoon(dateIso: string): number {
  return Math.floor(new Date(`${dateIso}T05:00:00Z`).getTime() / 1000); // 12:00 WIB
}

describe('resolvePreviousClose', () => {
  // Kasus nyata yang memicu perbaikan ini - laporan pengguna 2026-08-13.
  it('memakai penutupan sesi sebelumnya dari riwayat, bukan meta yang melewati satu sesi', () => {
    const result = resolvePreviousClose({
      timestamps: [wibNoon('2026-08-11'), wibNoon('2026-08-12'), wibNoon('2026-08-13')],
      closes: [6267.88, 6373.85, 6295.52],
      metaPreviousClose: 6267.88, // penutupan 11 Agu - MELEWATI 12 Agu
    });

    expect(result.previousClose).toBe(6373.85);
    expect(result.source).toBe('daily-history');
    expect(result.metaDisagrees).toBe(true);
    expect(result.metaValue).toBe(6267.88);

    // Arah perubahan yang dihasilkan harus MINUS, bukan plus seperti versi lama.
    const change = ((6295.52 - result.previousClose!) / result.previousClose!) * 100;
    expect(change).toBeLessThan(0);
    expect(change).toBeCloseTo(-1.23, 2);
  });

  it('tidak menandai selisih pembulatan kecil sebagai ketidakcocokan', () => {
    const result = resolvePreviousClose({
      timestamps: [wibNoon('2026-08-12'), wibNoon('2026-08-13')],
      closes: [6373.85, 6295.52],
      metaPreviousClose: 6373.849,
    });
    expect(result.previousClose).toBe(6373.85);
    expect(result.metaDisagrees).toBe(false);
  });

  it('melewati bar ganda pada tanggal bursa yang sama', () => {
    const result = resolvePreviousClose({
      timestamps: [
        wibNoon('2026-08-12'),
        Math.floor(new Date('2026-08-13T02:00:00Z').getTime() / 1000), // 09:00 WIB
        Math.floor(new Date('2026-08-13T08:00:00Z').getTime() / 1000), // 15:00 WIB
      ],
      closes: [6373.85, 6310.0, 6295.52],
    });
    // Bukan 6310 (hari yang sama), melainkan penutupan 12 Agu.
    expect(result.previousClose).toBe(6373.85);
  });

  // Laporan pengguna 2026-08-14, bentuk data ^JKSE persis saat itu: bar hari berjalan
  // SUDAH ADA tapi close-nya masih null (Yahoo belum memfinalkan sesi). Versi pertama
  // fungsi ini membuang bar null lebih dulu, sehingga bar kemarin dikira "hari ini" dan
  // acuannya mundur satu sesi terlalu jauh - IHSG tampil +0,54% padahal -1,13%.
  it('tidak mundur satu sesi saat bar hari berjalan masih berclose null', () => {
    const result = resolvePreviousClose({
      timestamps: [
        wibNoon('2026-08-07'),
        wibNoon('2026-08-10'),
        wibNoon('2026-08-11'),
        wibNoon('2026-08-12'),
        wibNoon('2026-08-13'), // sesi berjalan, belum difinalkan
      ],
      closes: [6409.65, 6365.37, 6267.88, 6373.85, null],
    });

    // Acuan yang benar adalah penutupan 12 Agu, BUKAN 11 Agu.
    expect(result.previousClose).toBe(6373.85);
    expect(result.source).toBe('daily-history');

    // Harga berjalan datang dari meta (6301,765), bukan dari bar yang masih null.
    const change = ((6301.765 - result.previousClose!) / result.previousClose!) * 100;
    expect(change).toBeLessThan(0);
    expect(change).toBeCloseTo(-1.13, 2);
  });

  it('mengabaikan bar dengan close null (hari libur di larik Yahoo)', () => {
    const result = resolvePreviousClose({
      timestamps: [wibNoon('2026-08-11'), wibNoon('2026-08-12'), wibNoon('2026-08-13')],
      closes: [6267.88, null, 6295.52],
    });
    expect(result.previousClose).toBe(6267.88);
    expect(result.source).toBe('daily-history');
  });

  it('jatuh ke meta kalau riwayat terlalu pendek - mis. emiten baru IPO', () => {
    const result = resolvePreviousClose({
      timestamps: [wibNoon('2026-08-13')],
      closes: [1200],
      metaPreviousClose: 1150,
    });
    expect(result.previousClose).toBe(1150);
    expect(result.source).toBe('meta');
    expect(result.metaDisagrees).toBe(false);
  });

  it('memakai chartPreviousClose kalau previousClose tidak ada', () => {
    const result = resolvePreviousClose({
      metaChartPreviousClose: 980,
    });
    expect(result.previousClose).toBe(980);
    expect(result.source).toBe('meta');
  });

  it('null kalau tidak ada satu pun sumber yang bisa dipakai', () => {
    expect(resolvePreviousClose({}).previousClose).toBeNull();
    expect(resolvePreviousClose({}).source).toBe('none');
    expect(resolvePreviousClose({ closes: [0, -5], timestamps: [1, 2] }).previousClose).toBeNull();
  });

  it('menolak nilai meta yang tidak masuk akal (nol/negatif/bukan angka)', () => {
    expect(resolvePreviousClose({ metaPreviousClose: 0 }).previousClose).toBeNull();
    expect(resolvePreviousClose({ metaPreviousClose: -10 }).previousClose).toBeNull();
    expect(resolvePreviousClose({ metaPreviousClose: '6267.88' }).previousClose).toBeNull();
  });
});
