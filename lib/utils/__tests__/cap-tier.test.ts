import { describe, it, expect } from 'vitest';
import { classifyCapTier } from '../cap-tier';

// BARU (2026-08-14, brainstorm lanjutan review eksternal - opsi A: badge Blue-chip/
// Small-cap, TIDAK mengubah parameter teknikal). Ambang [HYPOTHESIS]: market cap >=
// Rp 10T DAN ADV20 >= Rp 5M/hari.
describe('classifyCapTier', () => {
  it('BLUE_CHIP kalau market cap DAN likuiditas keduanya di atas ambang', () => {
    expect(classifyCapTier(15_000_000_000_000, 6_000_000_000)).toBe('BLUE_CHIP');
  });

  it('SMALL_CAP kalau market cap besar tapi likuiditas tipis - keduanya harus lolos', () => {
    expect(classifyCapTier(50_000_000_000_000, 500_000_000)).toBe('SMALL_CAP');
  });

  it('SMALL_CAP kalau likuiditas tinggi tapi market cap kecil', () => {
    expect(classifyCapTier(1_000_000_000_000, 10_000_000_000)).toBe('SMALL_CAP');
  });

  it('SMALL_CAP kalau keduanya di bawah ambang', () => {
    expect(classifyCapTier(500_000_000_000, 100_000_000)).toBe('SMALL_CAP');
  });

  it('tepat di ambang (>=) dihitung BLUE_CHIP, bukan SMALL_CAP', () => {
    expect(classifyCapTier(10_000_000_000_000, 5_000_000_000)).toBe('BLUE_CHIP');
  });

  it('null kalau salah satu data tidak tersedia - tidak menebak', () => {
    expect(classifyCapTier(null, 6_000_000_000)).toBeNull();
    expect(classifyCapTier(15_000_000_000_000, null)).toBeNull();
    expect(classifyCapTier(undefined, undefined)).toBeNull();
  });
});
