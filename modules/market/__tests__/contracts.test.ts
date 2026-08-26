import { describe, expect, it } from 'vitest';
import { parseBreakoutCache } from '../contracts';

describe('parseBreakoutCache', () => {
  it('mengembalikan null untuk raw null/undefined (cache belum pernah terisi)', () => {
    expect(parseBreakoutCache(null)).toBeNull();
    expect(parseBreakoutCache(undefined)).toBeNull();
  });

  it('mem-parse payload baru { data, crossSignals, lastUpdate } yang valid', () => {
    const raw = {
      data: [
        { symbol: 'BBCA.JK', price: 9500, change: '+1.5', score: 82, rr: '2.1', tp1: 9800, tp2: 10000, cl1: 9300, cl2: 9200 },
      ],
      crossSignals: {
        golden: [{ symbol: 'TLKM.JK', price: 3200, change: '+0.8', atr: 45, rr: '1.8' }],
        dead: [],
      },
      lastUpdate: '2026-08-26T00:00:00.000Z',
    };
    const parsed = parseBreakoutCache(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.data?.[0]?.symbol).toBe('BBCA.JK');
    expect(parsed?.crossSignals?.golden[0]?.symbol).toBe('TLKM.JK');
    expect(parsed?.lastUpdate).toBe('2026-08-26T00:00:00.000Z');
  });

  it('mem-parse bentuk lama (array polos, tanpa pembungkus)', () => {
    const raw = [{ symbol: 'BBRI.JK', price: 4500, change: '-0.5', score: 60, rr: '1.2' }];
    const parsed = parseBreakoutCache(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.data?.[0]?.symbol).toBe('BBRI.JK');
  });

  it('menolak (null) payload dengan field wajib hilang, bukan meneruskan data korup', () => {
    const raw = { data: [{ symbol: 'BBCA.JK', price: 'bukan-angka', change: '+1.5', score: 82, rr: '2.1' }] };
    expect(parseBreakoutCache(raw)).toBeNull();
  });

  it('menolak array lama yang berisi entri korup', () => {
    const raw = [{ symbol: 'XXXX.JK' }]; // price/change/score/rr hilang
    expect(parseBreakoutCache(raw)).toBeNull();
  });

  it('default golden/dead ke array kosong kalau tidak ada di payload baru', () => {
    const raw = { data: [], crossSignals: {}, lastUpdate: '2026-08-26T00:00:00.000Z' };
    const parsed = parseBreakoutCache(raw);
    expect(parsed?.crossSignals?.golden).toEqual([]);
    expect(parsed?.crossSignals?.dead).toEqual([]);
  });
});
