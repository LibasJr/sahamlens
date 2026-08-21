import { describe, expect, it } from 'vitest';
import { tickerLabel } from '../ticker-label';

describe('tickerLabel', () => {
  it('removes a trailing Yahoo Finance exchange suffix', () => {
    expect(tickerLabel('BBCA.JK')).toBe('BBCA');
    expect(tickerLabel('bbri.jk')).toBe('bbri');
  });

  it('does not alter symbols without the suffix', () => {
    expect(tickerLabel('BMRI')).toBe('BMRI');
    expect(tickerLabel('^JKSE')).toBe('^JKSE');
  });

  it('only removes a suffix at the end of the symbol', () => {
    expect(tickerLabel('TEST.JK.EXTRA')).toBe('TEST.JK.EXTRA');
  });
});
