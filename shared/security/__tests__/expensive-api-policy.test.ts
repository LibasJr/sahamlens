import { describe, expect, it } from 'vitest';
import { EXPENSIVE_PUBLIC_API_POLICY, isSelfLimitedExpensiveApi } from '../expensive-api-policy';
import { config, isProxyExemptPath } from '../../../proxy';

describe('expensive public API policy', () => {
  it('mengenali seluruh endpoint mahal yang disebut audit S-3', () => {
    for (const pathname of [
      '/api/dcf/BBCA', '/api/intrinsic/BBCA', '/api/earnings/BBCA', '/api/compare',
      '/api/flow/BBCA', '/api/live/BBCA', '/api/news/stock/BBCA',
    ]) expect(isSelfLimitedExpensiveApi(pathname)).toBe(true);
  });
  /**
   * DULU tes ini menuntut setiap policy punya string matcher LITERAL di proxy.ts. Itu
   * pertanyaan yang tepat selama matcher berupa daftar-IZIN: satu entri terlupa berarti
   * endpoint mahal itu tidak pernah tersentuh proxy.
   *
   * Sejak matcher dibalik menjadi `/api/:path*` (2026-08-19), pertanyaannya berubah -
   * cakupan sekarang otomatis, dan yang bisa salah adalah KEBALIKANNYA: sebuah endpoint
   * mahal tidak sengaja masuk daftar pengecualian dan kehilangan seluruh perlindungan
   * proxy tanpa satu pun sinyal. Itulah yang diperiksa sekarang.
   *
   * Syarat kedua - limiter milik route sendiri - tidak dilonggarkan sama sekali; ia tetap
   * dijaga scripts/audit-risk-controls.mjs (S-3).
   */
  it('tidak ada endpoint mahal yang masuk daftar pengecualian proxy', () => {
    for (const row of EXPENSIVE_PUBLIC_API_POLICY) {
      const sample = 'exact' in row ? row.exact : `${row.prefix}BBCA`;
      expect(isProxyExemptPath(sample), `${row.id} dibebaskan dari proxy`).toBe(false);
    }
  });

  it('seluruh permukaan API tercakup satu pola matcher', () => {
    expect(config.matcher).toContain('/api/:path*');
  });
});
