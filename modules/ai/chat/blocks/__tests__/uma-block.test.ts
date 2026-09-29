import { describe, expect, it } from 'vitest';
import { umaBlock } from '../emiten-blocks';

describe('umaBlock', () => {
  it('returns valid block string for ticker without throwing', async () => {
    const block = await umaBlock('DGWG');
    expect(typeof block).toBe('string');
    expect(block).toContain('### DGWG');
  });

  it('handles clean ticker without .JK suffix properly', async () => {
    const block = await umaBlock('BBCA.JK');
    expect(block).toContain('### BBCA');
  });
});