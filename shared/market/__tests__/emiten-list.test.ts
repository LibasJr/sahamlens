import { describe, it, expect } from 'vitest';
import { loadEmitenList, getEmitenSymbolSet } from '../emiten-list';

describe('loadEmitenList', () => {
  it('memuat daftar emiten dari CSV + lib/tickers.ts', () => {
    const list = loadEmitenList();
    expect(list.length).toBeGreaterThan(500);
    expect(list.every((e) => e.symbol && e.name)).toBe(true);
  });

  it('mengandung emiten nyata yang dikenal (BJBR, BBCA)', () => {
    const list = loadEmitenList();
    const symbols = new Set(list.map((e) => e.symbol));
    expect(symbols.has('BJBR')).toBe(true);
    expect(symbols.has('BBCA')).toBe(true);
  });
});

describe('getEmitenSymbolSet', () => {
  it('mengembalikan Set berisi kode saham asli tanpa suffix .JK', () => {
    const set = getEmitenSymbolSet();
    expect(set.has('BJBR')).toBe(true);
    expect(set.has('BJBR.JK')).toBe(false);
  });

  it('tidak mengandung kode yang bukan emiten sungguhan', () => {
    const set = getEmitenSymbolSet();
    expect(set.has('GILA')).toBe(false);
    expect(set.has('ABCD')).toBe(false);
  });
});
