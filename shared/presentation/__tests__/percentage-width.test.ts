import { describe, expect, it } from 'vitest';
import {
  percentageHeightClass,
  percentageLeftClass,
  percentageWidthClass,
} from '../percentage-width';

describe('percentageWidthClass', () => {
  it('maps percentages to bounded, statically generated classes', () => {
    expect(percentageWidthClass(0)).toBe('lens-w-0');
    expect(percentageWidthClass(41.6)).toBe('lens-w-42');
    expect(percentageWidthClass(100)).toBe('lens-w-100');
  });

  it('clamps invalid and out-of-range inputs', () => {
    expect(percentageWidthClass(-10)).toBe('lens-w-0');
    expect(percentageWidthClass(Number.NaN)).toBe('lens-w-0');
    expect(percentageWidthClass(800)).toBe('lens-w-100');
  });

  it('uses the same bounded scale for positioning and height', () => {
    expect(percentageLeftClass(12.5)).toBe('lens-left-13');
    expect(percentageHeightClass(97.6)).toBe('lens-h-98');
  });
});
