import { describe, expect, it } from 'vitest';
import { safeInternalPath } from '../safe-internal-path';

describe('safeInternalPath', () => {
  it('mengizinkan path internal termasuk query dan hash', () => {
    expect(safeInternalPath('/fundamental?symbol=BBCA#valuation')).toBe('/fundamental?symbol=BBCA#valuation');
  });

  it.each([
    undefined,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/%2F%2Fevil.example',
    '/%252F%252Fevil.example',
    '/%5Cevil.example',
    '/%ZZ',
  ])('menolak tujuan eksternal atau malformed: %s', (value) => {
    expect(safeInternalPath(value)).toBe('/');
  });
});
