import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('desktop diagnostics privacy boundary', () => {
  it('constructs diagnostics in native code from a fixed allowlist', () => {
    const source = read('desktop/src-tauri/src/diagnostics.rs');
    for (const field of ['application_version', 'os_family', 'route_class', 'status_code', 'latency_bucket', 'timestamp_unix_seconds']) {
      expect(source).toContain(field);
    }
    for (const forbidden of ['authorization:', 'cookie:', 'body:', 'email:', 'portfolio:', 'watchlist:', 'prompt:']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('exposes only a local envelope builder and no upload command', () => {
    const app = read('desktop/src-tauri/src/lib.rs');
    expect(app).toContain('native_build_diagnostic');
    expect(app).not.toMatch(/native_(?:upload|send)_diagnostic/);
  });

  it('does not install telemetry or crash-upload plugins', () => {
    const cargo = read('desktop/src-tauri/Cargo.toml');
    const app = read('desktop/src-tauri/src/lib.rs');
    expect(cargo).not.toMatch(/sentry|telemetry|analytics|tauri-plugin-log/i);
    expect(app).not.toMatch(/plugin_(?:log|upload|analytics)/i);
  });
});
