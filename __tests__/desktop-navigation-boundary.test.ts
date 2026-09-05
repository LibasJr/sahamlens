import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');

function text(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('desktop navigation boundary', () => {
  it('validates external links and deep links in Rust, not in the renderer', () => {
    const navigation = stripComments(text('desktop/src-tauri/src/navigation.rs'));

    expect(navigation).toContain('fn validate_external_url');
    expect(navigation).toContain('fn parse_deep_link');
    // Kalau daftar host hilang, seluruh gerbang ini berhenti memeriksa apa pun.
    expect(navigation).toContain('ALLOWED_EXTERNAL_HOSTS');
    expect(navigation.match(/"[a-z.]+\.(id|co\.id|go\.id)"/g)?.length ?? 0).toBeGreaterThan(3);
  });

  it('exposes external opening only through a validating native command', () => {
    const lib = stripComments(text('desktop/src-tauri/src/lib.rs'));

    expect(lib).toContain('fn native_open_external');
    expect(lib).toContain('navigation::validate_external_url');
    expect(lib).toContain('native_resolve_deep_link');
    expect(lib).toContain('navigation::parse_deep_link');
  });

  it('never lets the renderer open external URLs directly', () => {
    const bridge = stripComments(text('desktop-web/app/native-navigation-bridge.tsx'));

    expect(bridge).toContain('native_open_external');
    expect(bridge).not.toMatch(/window\.open\s*\(/);
    expect(bridge).not.toMatch(/plugin-opener/);
  });

  it('keeps capabilities free of blanket opener permissions', () => {
    const capabilities = JSON.parse(text('desktop/src-tauri/capabilities/default.json')) as {
      windows: string[];
      permissions: string[];
    };

    expect(capabilities.windows).toEqual(['main']);
    expect(capabilities.permissions).not.toContain('opener:default');
    expect(capabilities.permissions.some((entry) => entry.startsWith('opener:allow-open-url'))).toBe(
      false,
    );
  });
});
