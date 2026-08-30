import { describe, expect, it } from 'vitest';

const BASE = 'http://127.0.0.1:3001';

async function head(path: string) {
  return fetch(`${BASE}${path}`, { method: 'HEAD', redirect: 'manual' });
}

describe('production security headers', () => {
  it('does not expose X-Powered-By on the homepage', async () => {
    const res = await head('/');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('serves security.txt', async () => {
    const res = await fetch(`${BASE}/.well-known/security.txt`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Contact: mailto:security@sahamlens.id');
  });
});
