import { describe, expect, it } from 'vitest';
import { classifyCapTier } from '../cap-tier';

describe('classifyCapTier - kondisi pasar, bukan identitas blue-chip', () => {
  it('large & liquid current kalau market cap DAN likuiditas di atas ambang', () => {
    expect(classifyCapTier(15_000_000_000_000, 6_000_000_000)).toBe('LARGE_LIQUID_CURRENT');
  });
  it('thin current kalau market cap besar tapi likuiditas tipis', () => {
    expect(classifyCapTier(50_000_000_000_000, 500_000_000)).toBe('SMALL_OR_THIN_CURRENT');
  });
  it('thin current kalau likuiditas tinggi tapi market cap kecil', () => {
    expect(classifyCapTier(1_000_000_000_000, 10_000_000_000)).toBe('SMALL_OR_THIN_CURRENT');
  });
  it('thin current kalau keduanya di bawah ambang', () => {
    expect(classifyCapTier(500_000_000_000, 100_000_000)).toBe('SMALL_OR_THIN_CURRENT');
  });
  it('tepat di ambang termasuk large & liquid current', () => {
    expect(classifyCapTier(10_000_000_000_000, 5_000_000_000)).toBe('LARGE_LIQUID_CURRENT');
  });
  it('fail closed kalau salah satu data tidak tersedia', () => {
    expect(classifyCapTier(null, 6_000_000_000)).toBeNull();
    expect(classifyCapTier(15_000_000_000_000, null)).toBeNull();
    expect(classifyCapTier(undefined, undefined)).toBeNull();
  });
});
