import { describe, expect, it } from 'vitest';
import { compareValues, parseFormattedNumber } from '../screener-model';

describe('parseFormattedNumber', () => {
  it('normalizes percentage, multiple, sign, and Indonesian decimal formatting', () => {
    expect(parseFormattedNumber('+12,5%')).toBe(12.5);
    expect(parseFormattedNumber('-4.25%')).toBe(-4.25);
    expect(parseFormattedNumber('0.80x')).toBe(0.8);
  });

  it('keeps finite numbers and rejects non-numeric values', () => {
    expect(parseFormattedNumber(42)).toBe(42);
    expect(parseFormattedNumber(Number.NaN)).toBeNull();
    expect(parseFormattedNumber('N/A')).toBeNull();
    expect(parseFormattedNumber(undefined)).toBeNull();
  });
});

describe('compareValues', () => {
  it('sorts numeric values in both directions', () => {
    expect(compareValues(10, 20, 'asc')).toBeLessThan(0);
    expect(compareValues(10, 20, 'desc')).toBeGreaterThan(0);
  });

  it('sorts strings with Indonesian locale semantics', () => {
    expect(compareValues('ADRO', 'BBCA', 'asc')).toBeLessThan(0);
    expect(compareValues('ADRO', 'BBCA', 'desc')).toBeGreaterThan(0);
  });

  it('keeps missing values at the end for both directions', () => {
    expect(compareValues(null, 10, 'asc')).toBeGreaterThan(0);
    expect(compareValues(null, 10, 'desc')).toBeGreaterThan(0);
    expect(compareValues(10, null, 'desc')).toBeLessThan(0);
  });
});
