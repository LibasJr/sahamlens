import { describe, expect, it } from 'vitest';
import { percentageWidthClass } from '../percentage-width';

describe('percentageWidthClass', () => {
  it('maps percentages to bounded, statically generated classes', () => {
    expect(percentageWidthClass(0)).toBe('w-[0%]');
    expect(percentageWidthClass(41.6)).toBe('w-[42%]');
    expect(percentageWidthClass(100)).toBe('w-[100%]');
  });

  it('clamps invalid and out-of-range inputs', () => {
    expect(percentageWidthClass(-10)).toBe('w-[0%]');
    expect(percentageWidthClass(Number.NaN)).toBe('w-[0%]');
    expect(percentageWidthClass(800)).toBe('w-[100%]');
  });
});
