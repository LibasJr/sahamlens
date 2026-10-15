import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/modules/technical/controller/stock-analysis.controller', () => ({
  handleGetStockAnalysis: vi.fn(async (_req, code) => {
    if (code === 'BBCA') {
      return { status: 200, body: { symbol: 'BBCA.JK', price: 9500 } };
    }
    if (code === 'BBRI') {
      return { status: 200, body: { symbol: 'BBRI.JK', price: 5000 } };
    }
    return { status: 404, body: { error: 'Not found' } };
  }),
}));

import { GET } from '../route';

describe('GET /api/stock/batch', () => {
  it('menolak request tanpa parameter symbols', async () => {
    const req = new NextRequest('http://localhost/api/stock/batch');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('symbols wajib diisi');
  });

  it('menolak simbol saham yang tidak valid', async () => {
    const req = new NextRequest('http://localhost/api/stock/batch?symbols=INVALID$$$');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('tidak valid');
  });

  it('mengembalikan batch analisis untuk simbol valid', async () => {
    const req = new NextRequest('http://localhost/api/stock/batch?symbols=BBCA,BBRI');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requestedCount).toBe(2);
    expect(body.resolvedCount).toBe(2);
    expect(body.data['BBCA.JK']).toEqual({ symbol: 'BBCA.JK', price: 9500 });
    expect(body.data['BBRI.JK']).toEqual({ symbol: 'BBRI.JK', price: 5000 });
  });
});
