import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.join(__dirname, '..');
const BRIDGE_PATH = path.join(REPO_ROOT, 'desktop-web/app/native-fetch-bridge.tsx');
const RUST_PATH = path.join(REPO_ROOT, 'desktop/src-tauri/src/lib.rs');

function source(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

describe('desktop credential boundary', () => {
  it('renderer tidak menyimpan atau mengirim bearer token', () => {
    const bridge = source(BRIDGE_PATH);

    expect(bridge).not.toMatch(/TOKEN_STORAGE_KEY/);
    expect(bridge).not.toMatch(/localStorage\.(?:getItem|setItem)\([^\n]*token/i);
    expect(bridge).not.toMatch(/\btoken\s*[,}]/);
    expect(bridge).not.toMatch(/data\.token/);
  });

  it('native request tidak menerima token dari invoke payload', () => {
    const rust = source(RUST_PATH);
    const signature = rust.match(/async fn native_api_request\([\s\S]*?\) -> Result/)?.[0] ?? '';

    expect(signature).not.toMatch(/token\s*:/);
  });

  it('login dan logout ditangani oleh command credential khusus', () => {
    const bridge = source(BRIDGE_PATH);

    expect(bridge).toContain("invoke<NativeResponse>('native_login'");
    expect(bridge).toContain("invoke<NativeResponse>('native_logout'");
  });
});
