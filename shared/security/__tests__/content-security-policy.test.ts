import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, createCspNonce } from '../content-security-policy';

describe('content security policy', () => {
  it('removes unsafe-inline from production script execution and keeps Cloudflare analytics allowed', () => {
    const csp = buildContentSecurityPolicy('nonce-value', true);
    const scriptDirective = csp.split('; ').find((part) => part.startsWith('script-src '));

    expect(scriptDirective).toContain("'nonce-nonce-value'");
    expect(scriptDirective).toContain('https://static.cloudflareinsights.com');
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(scriptDirective).not.toContain("'unsafe-eval'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('allows unsafe-eval only in development for Next.js tooling', () => {
    const csp = buildContentSecurityPolicy('dev-nonce', false);
    const scriptDirective = csp.split('; ').find((part) => part.startsWith('script-src '));

    expect(scriptDirective).toContain("'unsafe-eval'");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('restricts style elements by nonce and isolates the temporary attribute exception', () => {
    const csp = buildContentSecurityPolicy('style-nonce', true);
    const directives = Object.fromEntries(
      csp.split('; ').map((directive) => {
        const [name, ...sources] = directive.split(' ');
        return [name, sources];
      }),
    );

    expect(directives['style-src']).toEqual(["'self'", "'nonce-style-nonce'"]);
    expect(directives['style-src-elem']).toEqual(["'self'", "'nonce-style-nonce'"]);
    expect(directives['style-src']).not.toContain("'unsafe-inline'");
    expect(directives['style-src-elem']).not.toContain("'unsafe-inline'");
    expect(directives['style-src-attr']).toEqual(["'unsafe-inline'"]);
  });

  it('generates a fresh non-empty nonce source value', () => {
    const first = createCspNonce();
    const second = createCspNonce();

    expect(first.length).toBeGreaterThan(16);
    expect(second.length).toBeGreaterThan(16);
    expect(second).not.toBe(first);
  });
});
