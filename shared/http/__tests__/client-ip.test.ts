import { afterEach, describe, expect, it } from 'vitest';
import { getTrustedClientIp, maskClientIp } from '../client-ip';

const previous = process.env.TRUSTED_PROXY_MODE;
afterEach(() => {
  if (previous == null) delete process.env.TRUSTED_PROXY_MODE;
  else process.env.TRUSTED_PROXY_MODE = previous;
});

describe('trusted client IP', () => {
  it('cloudflare mode ignores forged x-forwarded-for', () => {
    process.env.TRUSTED_PROXY_MODE = 'cloudflare';
    const headers = new Headers({
      'cf-connecting-ip': '203.0.113.42',
      'x-forwarded-for': '1.2.3.4',
    });
    expect(getTrustedClientIp(headers)).toBe('203.0.113.42');
  });

  it('cloudflare mode fails closed when CF header is absent', () => {
    process.env.TRUSTED_PROXY_MODE = 'cloudflare';
    expect(getTrustedClientIp(new Headers({ 'x-forwarded-for': '1.2.3.4' }))).toBe('unknown');
  });

  it('forwarded mode accepts the first valid forwarded address', () => {
    process.env.TRUSTED_PROXY_MODE = 'forwarded';
    expect(getTrustedClientIp(new Headers({ 'x-forwarded-for': '198.51.100.20, 10.0.0.1' }))).toBe('198.51.100.20');
  });

  it('masks IPv4 for privacy logs', () => {
    expect(maskClientIp('203.0.113.42')).toBe('203.0.113.0/24');
  });
});
