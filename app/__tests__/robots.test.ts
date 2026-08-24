import { describe, expect, it } from 'vitest';
import robots from '../robots';

const rules = () => {
  const value = robots().rules;
  return Array.isArray(value) ? value : [value];
};

describe('robots.txt', () => {
  it('menutup API, admin, dan workbench untuk semua crawler', () => {
    for (const rule of rules()) {
      expect(rule.disallow).toEqual(
        expect.arrayContaining(['/api/', '/admin', '/admin-login', '/_workbench']),
      );
    }
  });

  it('tidak pernah menutup /technical - itu landing page SEO di sitemap', () => {
    for (const rule of rules()) {
      const disallow = [rule.disallow ?? []].flat();
      expect(disallow.some((path) => String(path).startsWith('/technical'))).toBe(false);
    }
  });

  it('memberi crawl-delay pada crawler Meta yang menyapu sitemap tanpa jeda', () => {
    const meta = rules().find((rule) => [rule.userAgent ?? []].flat().includes('meta-webindexer'));
    expect(meta).toBeDefined();
    expect(meta?.crawlDelay).toBeGreaterThanOrEqual(10);
  });

  it('tidak memasang crawl-delay pada aturan umum - Googlebot mengabaikannya', () => {
    const wildcard = rules().find((rule) => [rule.userAgent ?? []].flat().includes('*'));
    expect(wildcard).toBeDefined();
    expect(wildcard?.crawlDelay).toBeUndefined();
  });
});
