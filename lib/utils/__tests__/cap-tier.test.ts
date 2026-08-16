import { describe, it, expect } from 'vitest';
import { classifyCapTier } from '../cap-tier';

// BARU (2026-08-14, brainstorm lanjutan review eksternal - opsi A: badge Blue-chip/
// Small-cap, TIDAK mengubah parameter teknikal).
//
// REVISI (2026-08-16, bug report pengguna: PACK.JK - saham kecil naik +8%/hari dengan
// data BASI - berlabel "Blue-chip"). Ambang market cap/ADV20 REAL-TIME lama diganti
// keanggotaan indeks LQ45 (lib/utils/blue-chip-index.ts) - lihat cap-tier.ts.
describe('classifyCapTier', () => {
  it('BLUE_CHIP kalau ticker konstituen LQ45 dan data market cap/likuiditas tersedia', () => {
    expect(classifyCapTier('BBCA.JK', 900_000_000_000_000, 200_000_000_000)).toBe('BLUE_CHIP');
  });

  it('BLUE_CHIP menerima ticker tanpa suffix .JK dan tanpa peduli huruf besar/kecil', () => {
    expect(classifyCapTier('bbca', 900_000_000_000_000, 200_000_000_000)).toBe('BLUE_CHIP');
  });

  it('SMALL_CAP kalau ticker BUKAN konstituen LQ45 - walaupun market cap & likuiditas besar (kasus PACK.JK: jangan sampai pump/gorengan bikin lolos)', () => {
    expect(classifyCapTier('PACK.JK', 15_000_000_000_000, 6_000_000_000)).toBe('SMALL_CAP');
  });

  it('SMALL_CAP kalau ticker bukan konstituen LQ45 dan datanya kecil', () => {
    expect(classifyCapTier('PACK.JK', 500_000_000_000, 100_000_000)).toBe('SMALL_CAP');
  });

  it('null kalau salah satu data market cap/likuiditas tidak tersedia - tidak menebak, walaupun ticker-nya konstituen LQ45', () => {
    expect(classifyCapTier('BBCA.JK', null, 6_000_000_000)).toBeNull();
    expect(classifyCapTier('BBCA.JK', 15_000_000_000_000, null)).toBeNull();
    expect(classifyCapTier('BBCA.JK', undefined, undefined)).toBeNull();
  });

  it('null kalau ticker kosong/null tapi data market cap/likuiditas ada - tetap butuh identitas emiten untuk cek keanggotaan indeks', () => {
    expect(classifyCapTier(null, 15_000_000_000_000, 6_000_000_000)).toBe('SMALL_CAP');
    expect(classifyCapTier('', 15_000_000_000_000, 6_000_000_000)).toBe('SMALL_CAP');
  });
});
