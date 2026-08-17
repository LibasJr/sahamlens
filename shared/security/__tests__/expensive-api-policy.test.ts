import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPENSIVE_PUBLIC_API_POLICY, isSelfLimitedExpensiveApi } from '../expensive-api-policy';

describe('expensive public API policy', () => {
  it('mengenali seluruh endpoint mahal yang disebut audit S-3', () => {
    for (const pathname of [
      '/api/dcf/BBCA', '/api/intrinsic/BBCA', '/api/earnings/BBCA', '/api/compare',
      '/api/flow/BBCA', '/api/live/BBCA', '/api/news/stock/BBCA',
    ]) expect(isSelfLimitedExpensiveApi(pathname)).toBe(true);
  });
  it('setiap policy punya matcher literal di proxy.ts', () => {
    const proxy = fs.readFileSync(path.join(process.cwd(), 'proxy.ts'), 'utf8');
    for (const row of EXPENSIVE_PUBLIC_API_POLICY) {
      expect(proxy, `${row.id} belum ada di matcher proxy`).toContain(`'${row.matcher}'`);
    }
  });
});
