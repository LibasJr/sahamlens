import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

describe('security hardening baseline', () => {
  it('disables X-Powered-By in next.config.mjs', () => {
    const nextConfig = readFileSync(path.join(root, 'next.config.mjs'), 'utf8');
    expect(nextConfig).toContain('poweredByHeader: false');
  });

  it('publishes security.txt', () => {
    const securityTxt = readFileSync(path.join(root, 'public/.well-known/security.txt'), 'utf8');
    expect(securityTxt).toContain('Contact: mailto:security@sahamlens.id');
    expect(securityTxt).toContain('Canonical: https://sahamlens.id/.well-known/security.txt');
    expect(securityTxt).toContain('Policy: https://sahamlens.id/security');
  });
});
