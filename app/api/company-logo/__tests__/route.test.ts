import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../route';

function makeRequest(domain?: string): Request {
  const url = domain ? `http://localhost/api/company-logo?domain=${domain}` : 'http://localhost/api/company-logo';
  return new Request(url);
}

describe('GET /api/company-logo', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns 400 when domain param is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it('proxies upstream image bytes with same content-type when upstream succeeds', async () => {
    const fakeBytes = new Uint8Array([1, 2, 3, 4]).buffer;
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => fakeBytes,
    });

    const res = await GET(makeRequest('telkom.co.id'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    const body = await res.arrayBuffer();
    expect(new Uint8Array(body)).toEqual(new Uint8Array(fakeBytes));
  });

  // Google favicon service mengembalikan HTTP 404 (bukan hanya gagal fetch) untuk domain
  // tanpa favicon terdaftar - route ini HARUS meneruskan 404 (bukan menampilkan gambar
  // generik seolah itu logo asli, lihat komentar route.ts).
  it('returns 404 when upstream responds not-ok (no real favicon found)', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false });

    const res = await GET(makeRequest('domain-tanpa-favicon.example'));
    expect(res.status).toBe(404);
  });

  it('returns 502 when upstream fetch throws (network/timeout error)', async () => {
    (global.fetch as any).mockRejectedValue(new Error('network error'));

    const res = await GET(makeRequest('telkom.co.id'));
    expect(res.status).toBe(502);
  });
});
