import { afterEach, describe, expect, it, vi } from 'vitest';
import { technicalResearchPath } from '../technical-route';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('technicalResearchPath', () => {
  it('keeps the public stock-detail URL on the website', () => {
    expect(technicalResearchPath('bbca.jk')).toBe('/technical/BBCA.JK');
  });

  it('uses the static LensTechnical workspace inside Tauri', () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });

    expect(technicalResearchPath('bbca.jk')).toBe('/dashboard?symbol=BBCA.JK');
    expect(technicalResearchPath('ihsg')).toBe('/dashboard?symbol=IHSG');
  });
});
