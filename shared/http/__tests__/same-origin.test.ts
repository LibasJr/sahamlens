import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../server-origin', () => ({ getTrustedAppOrigin: () => 'https://sahamlens.id' }));

import { assertTrustedSameOrigin } from '../same-origin';
import { ForbiddenError } from '../../errors/app-error';

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://sahamlens.id/api/admin/test', { method: 'POST', headers });
}

describe('assertTrustedSameOrigin', () => {
  const originalOrigins = process.env.TRUSTED_APP_ORIGINS;
  beforeEach(() => { vi.clearAllMocks(); delete process.env.TRUSTED_APP_ORIGINS; });
  afterEach(() => {
    if (originalOrigins === undefined) delete process.env.TRUSTED_APP_ORIGINS;
    else process.env.TRUSTED_APP_ORIGINS = originalOrigins;
  });

  it('menerima Origin production yang persis sama', () => {
    expect(() => assertTrustedSameOrigin(req({ origin: 'https://sahamlens.id' }))).not.toThrow();
  });


  it('menerima origin alias yang eksplisit di TRUSTED_APP_ORIGINS', () => {
    process.env.TRUSTED_APP_ORIGINS = 'https://www.sahamlens.id';
    expect(() => assertTrustedSameOrigin(req({ origin: 'https://www.sahamlens.id' }))).not.toThrow();
  });

  it('menolak origin lintas situs', () => {
    expect(() => assertTrustedSameOrigin(req({ origin: 'https://evil.example' }))).toThrow(ForbiddenError);
  });

  it('menolak sibling subdomain walaupun browser menyebut same-site', () => {
    expect(() => assertTrustedSameOrigin(req({ 'sec-fetch-site': 'same-site' }))).toThrow(ForbiddenError);
  });

  it('menerima CLI/server call tanpa Origin dan tanpa Sec-Fetch-Site', () => {
    expect(() => assertTrustedSameOrigin(req())).not.toThrow();
  });

  it('menerima Sec-Fetch-Site none untuk navigasi/tool yang bukan cross-site', () => {
    expect(() => assertTrustedSameOrigin(req({ 'sec-fetch-site': 'none' }))).not.toThrow();
  });
});
