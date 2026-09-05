import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');

function text(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function json(relativePath: string): unknown {
  return JSON.parse(text(relativePath));
}

describe('desktop native security lockdown', () => {
  it('enforces a non-null restrictive CSP', () => {
    const config = json('desktop/src-tauri/tauri.conf.json') as {
      app: { security: { csp: string | null } };
    };
    const csp = config.app.security.csp;

    expect(csp).toBeTypeOf('string');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).not.toContain('https:');
    expect(csp).not.toContain('*');
  });

  it('scopes renderer capability to the main window without shell or notification access', () => {
    const capability = json('desktop/src-tauri/capabilities/default.json') as {
      windows: string[];
      permissions: string[];
    };

    expect(capability.windows).toEqual(['main']);
    expect(capability.permissions.some((permission) => permission.startsWith('shell:'))).toBe(false);
    expect(capability.permissions.some((permission) => permission.startsWith('notification:'))).toBe(false);
  });

  it('does not initialize unused privileged plugins', () => {
    const rust = text('desktop/src-tauri/src/lib.rs');
    const cargo = text('desktop/src-tauri/Cargo.toml');
    const desktopPackage = text('desktop/package.json');

    expect(rust).not.toMatch(/tauri_plugin_(?:shell|notification)::init/);
    expect(cargo).not.toMatch(/tauri-plugin-(?:shell|notification)/);
    expect(desktopPackage).not.toMatch(/@tauri-apps\/plugin-(?:shell|notification)/);
  });
});
