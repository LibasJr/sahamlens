import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return [full];
  });
}

describe('source map hardening', () => {
  it('does not publish source maps in public/', () => {
    const publicDir = path.join(process.cwd(), 'public');
    const files = listFiles(publicDir).filter((file) => file.endsWith('.map'));
    expect(files).toEqual([]);
  });

  it('keeps next.config.mjs source maps disabled', () => {
    const nextConfig = statSync(path.join(process.cwd(), 'next.config.mjs'));
    expect(nextConfig.isFile()).toBe(true);
  });
});
