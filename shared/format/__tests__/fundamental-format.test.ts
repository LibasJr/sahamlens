import { describe, it, expect } from 'vitest';
import { fmtKali, fmtPersen, fmtTriliun } from '../fundamental-format';

describe('fmtKali', () => {
  it('formats a number with 2 decimals and x suffix', () => {
    expect(fmtKali(12.345)).toBe('12.35x');
  });
  it('returns N/A for null', () => {
    expect(fmtKali(null)).toBe('N/A');
  });
  it('returns N/A for undefined', () => {
    expect(fmtKali(undefined)).toBe('N/A');
  });
});

describe('fmtPersen', () => {
  it('converts fraction to percentage with 2 decimals', () => {
    expect(fmtPersen(0.1523)).toBe('15.23%');
  });
  it('returns N/A for null (not 0.00%)', () => {
    expect(fmtPersen(null)).toBe('N/A');
  });
});

describe('fmtTriliun', () => {
  it('converts raw value to triliun rupiah with 2 decimals', () => {
    expect(fmtTriliun(1.5e12)).toBe('Rp 1.50 T');
  });
  it('returns N/A for undefined (not Rp 0.00 T)', () => {
    expect(fmtTriliun(undefined)).toBe('N/A');
  });
});
