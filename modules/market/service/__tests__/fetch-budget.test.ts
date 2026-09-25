import { describe, expect, it } from 'vitest';
import {
  anggaranHabis,
  batasBatchMs,
  denganBatasWaktu,
  mulaiAnggaran,
  sisaAnggaran,
} from '../fetch-budget';

describe('anggaran waktu batch', () => {
  it('sisa anggaran berkurang sesuai waktu berjalan', () => {
    const state = mulaiAnggaran(1000, 60_000);
    expect(sisaAnggaran(state, 1000)).toBe(60_000);
    expect(sisaAnggaran(state, 21_000)).toBe(40_000);
  });

  it('anggaran dinyatakan habis tepat pada batas (tidak negatif-panjang)', () => {
    const state = mulaiAnggaran(0, 1_000);
    expect(anggaranHabis(state, 999)).toBe(false);
    expect(anggaranHabis(state, 1_000)).toBe(true);
    expect(anggaranHabis(state, 5_000)).toBe(true);
  });

  it('batas batch tidak melebihi sisa anggaran', () => {
    const state = mulaiAnggaran(0, 10_000);
    expect(batasBatchMs(state, 8_000, 30_000)).toBe(2_000);
  });

  it('batas batch tidak melebihi batas per batch saat anggaran masih longgar', () => {
    const state = mulaiAnggaran(0, 300_000);
    expect(batasBatchMs(state, 0, 45_000)).toBe(45_000);
  });

  it('batas batch tidak pernah nol atau negatif', () => {
    const state = mulaiAnggaran(0, 1_000);
    expect(batasBatchMs(state, 5_000, 45_000)).toBe(1);
  });
});

describe('denganBatasWaktu', () => {
  it('mengembalikan hasil asli bila selesai sebelum batas', async () => {
    await expect(denganBatasWaktu(Promise.resolve('selesai'), 50, 'cadangan')).resolves.toBe('selesai');
  });

  it('mengembalikan nilai cadangan bila janji menggantung (bukan menggantung ikut)', async () => {
    const menggantung = new Promise<string>(() => {});
    const hasil = await denganBatasWaktu(menggantung, 10, 'cadangan');
    expect(hasil).toBe('cadangan');
  });

  it('meneruskan galat asli apa adanya', async () => {
    await expect(denganBatasWaktu(Promise.reject(new Error('gagal asli')), 50, 'cadangan')).rejects.toThrow(
      'gagal asli',
    );
  });
});