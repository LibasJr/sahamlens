import { describe, it, expect } from 'vitest';
import { extendProExpiry } from '../pro-expiry.service';

function monthsFromNow(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d;
}

describe('extendProExpiry', () => {
  it('menumpuk dari tanggal berakhir kalau masa berlaku belum habis', () => {
    const belumHabis = monthsFromNow(1).toISOString();

    const hasil = new Date(extendProExpiry(belumHabis, 1));

    // 1 bulan lagi + 1 bulan = sekitar 2 bulan dari sekarang, bukan 1
    const duaBulan = monthsFromNow(2);
    expect(Math.abs(hasil.getTime() - duaBulan.getTime())).toBeLessThan(60_000);
  });

  it('menghitung dari sekarang kalau tanggal sudah lewat', () => {
    const sudahLewat = monthsFromNow(-3).toISOString();

    const hasil = new Date(extendProExpiry(sudahLewat, 1));

    const satuBulan = monthsFromNow(1);
    expect(Math.abs(hasil.getTime() - satuBulan.getTime())).toBeLessThan(60_000);
  });

  it('menghitung dari sekarang kalau belum pernah punya tanggal', () => {
    const hasil = new Date(extendProExpiry(null, 1));

    const satuBulan = monthsFromNow(1);
    expect(Math.abs(hasil.getTime() - satuBulan.getTime())).toBeLessThan(60_000);
  });

  it('12 bulan menghasilkan tahun berikutnya', () => {
    const hasil = new Date(extendProExpiry(null, 12));

    expect(hasil.getFullYear()).toBe(new Date().getFullYear() + 1);
  });

  it('mengembalikan ISO string, bukan objek Date', () => {
    expect(typeof extendProExpiry(null, 1)).toBe('string');
    expect(extendProExpiry(null, 1)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
