import { describe, expect, it } from 'vitest';
import { hitungUmurJam, putuskanSegarkan, stempelTerbaru } from '../helpers';

const SEKARANG = new Date('2026-09-25T00:00:00.000Z');
const SEMINGGU = 24 * 7;

function putuskan(over: Partial<Parameters<typeof putuskanSegarkan>[0]> = {}) {
  return putuskanSegarkan({ aktif: 0, terakhirSelesaiIso: null, sekarang: SEKARANG, maxUmurJam: SEMINGGU, ...over });
}

describe('putuskanSegarkan', () => {
  it('memicu run bila belum pernah ada run', () => {
    expect(putuskan().action).toBe('CATAT');
    expect(putuskan().reason).toBe('BELUM_PERNAH_ADA_RUN');
  });

  it('memicu run bila hasil terakhir sudah kedaluwarsa (> 7 hari)', () => {
    const hasil = putuskan({ terakhirSelesaiIso: '2026-09-10T00:00:00.000Z' });
    expect(hasil.action).toBe('CATAT');
    expect(hasil.reason).toBe('SUDAH_KEDALUWARSA');
    expect(hasil.umurJam).toBeCloseTo(360, 1);
  });

  it('melewati run bila hasil terakhir masih segar (< 7 hari)', () => {
    const hasil = putuskan({ terakhirSelesaiIso: '2026-09-22T00:00:00.000Z' });
    expect(hasil.action).toBe('LEWATI');
    expect(hasil.reason).toBe('MASIH_SEGAR');
  });

  it('melewati run bila masih ada run aktif - tidak menumpuk antrean', () => {
    const hasil = putuskan({ aktif: 1, terakhirSelesaiIso: '2026-08-01T00:00:00.000Z' });
    expect(hasil.action).toBe('LEWATI');
    expect(hasil.reason).toBe('SEDANG_DIPROSES');
  });

  it('memicu run bila stempel terakhir tidak terbaca', () => {
    expect(putuskan({ terakhirSelesaiIso: 'bukan-tanggal' }).reason).toBe('TANGGAL_TERAKHIR_TIDAK_TERBACA');
  });

  it('tidak memicu run bila stempel ada di masa depan', () => {
    const hasil = putuskan({ terakhirSelesaiIso: '2026-10-01T00:00:00.000Z' });
    expect(hasil.action).toBe('LEWATI');
    expect(hasil.reason).toBe('TANGGAL_TERAKHIR_DI_MASA_DEPAN');
  });

  it('batas tepat 7 hari tetap memicu run (bukan segar)', () => {
    expect(putuskan({ terakhirSelesaiIso: '2026-09-18T00:00:00.000Z' }).action).toBe('CATAT');
  });
});

describe('hitungUmurJam', () => {
  it('null bila tidak ada stempel', () => {
    expect(hitungUmurJam(null, SEKARANG)).toBeNull();
  });

  it('null bila stempel tidak valid', () => {
    expect(hitungUmurJam('x', SEKARANG)).toBeNull();
  });

  it('menghitung umur dalam jam', () => {
    expect(hitungUmurJam('2026-09-24T00:00:00.000Z', SEKARANG)).toBe(24);
  });
});

describe('stempelTerbaru', () => {
  it('mengambil stempel paling baru dari status yang dihitung selesai', () => {
    const runs = [
      { selesaiIso: '2026-09-01T00:00:00.000Z', status: 'SUCCEEDED' },
      { selesaiIso: '2026-09-20T00:00:00.000Z', status: 'FAILED' },
      { selesaiIso: null, status: 'SUCCEEDED' },
      { selesaiIso: '2026-09-30T00:00:00.000Z', status: 'QUEUED' },
    ];
    expect(stempelTerbaru(runs, ['SUCCEEDED', 'FAILED'])).toBe('2026-09-20T00:00:00.000Z');
  });

  it('null bila tidak ada run yang cocok', () => {
    expect(stempelTerbaru([{ selesaiIso: '2026-09-20T00:00:00.000Z', status: 'RUNNING' }], ['SUCCEEDED'])).toBeNull();
  });

  it('null bila daftar kosong', () => {
    expect(stempelTerbaru([], ['SUCCEEDED'])).toBeNull();
  });
});