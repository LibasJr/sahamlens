import { describe, it, expect } from 'vitest';
import { isBlueChipConstituent, LQ45_CONSTITUENTS } from '../blue-chip-index';

// BARU (2026-08-16, bug report pengguna: PACK.JK berlabel "Blue-chip" karena definisi
// lama murni market cap + ADV20 real-time - gampang digelembungkan pump/gorengan).
describe('isBlueChipConstituent', () => {
  it('true untuk ticker yang ada di daftar LQ45, dengan suffix .JK', () => {
    expect(isBlueChipConstituent('BBCA.JK')).toBe(true);
  });

  it('true untuk ticker tanpa suffix .JK', () => {
    expect(isBlueChipConstituent('BBRI')).toBe(true);
  });

  it('tidak peduli huruf besar/kecil', () => {
    expect(isBlueChipConstituent('bbca.jk')).toBe(true);
    expect(isBlueChipConstituent('Bbca')).toBe(true);
  });

  it('false untuk ticker yang bukan konstituen LQ45 (kasus PACK.JK)', () => {
    expect(isBlueChipConstituent('PACK.JK')).toBe(false);
  });

  it('false untuk input kosong/null/undefined - tidak melempar error', () => {
    expect(isBlueChipConstituent('')).toBe(false);
    expect(isBlueChipConstituent(null)).toBe(false);
    expect(isBlueChipConstituent(undefined)).toBe(false);
    expect(isBlueChipConstituent('   ')).toBe(false);
  });

  it('daftar tidak berisi duplikat', () => {
    expect(new Set(LQ45_CONSTITUENTS).size).toBe(LQ45_CONSTITUENTS.length);
  });
});
