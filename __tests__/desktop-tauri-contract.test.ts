import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const desktopTauri = path.join(ROOT, 'desktop', 'src-tauri');

function read(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('kontrak rilis Tauri desktop', () => {
  it('hanya memiliki satu proyek Tauri resmi di dalam workspace desktop', () => {
    expect(existsSync(path.join(ROOT, 'src-tauri')), 'src-tauri duplikat di root harus dihapus').toBe(false);
    expect(existsSync(desktopTauri), 'desktop/src-tauri resmi harus tersedia').toBe(true);
  });

  it('build CI dan skrip root menunjuk proyek Tauri yang sama', () => {
    const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const workflow = read('.github/workflows/desktop.yml');

    expect(packageJson.scripts['desktop:build']).toBe('npm --prefix desktop run tauri:build');
    expect(workflow).toContain('npm run tauri:build --prefix desktop');
    expect(workflow).toContain('desktop/src-tauri/target/release/bundle/**');
    expect(workflow).not.toMatch(/(^|\n)\s*- ['"]?src-tauri\/\*\*/);
  });

  it('mengaktifkan plugin dan izin Stronghold yang dibutuhkan lifecycle token', () => {
    const rust = read('desktop/src-tauri/src/lib.rs');
    const capability = JSON.parse(read('desktop/src-tauri/capabilities/default.json')) as {
      permissions: Array<string | { identifier: string }>;
    };
    const permissions = capability.permissions.map((permission) =>
      typeof permission === 'string' ? permission : permission.identifier,
    );

    expect(rust).toContain('tauri_plugin_stronghold');
    expect(rust).toContain('Sha256::digest(password).to_vec()');
    expect(rust).not.toMatch(/Builder::new\(\|password\|\s*password\.(?:to_vec|to_owned)/);
    expect(rust).toContain('tauri_plugin_http');
    expect(permissions).toContain('stronghold:default');
    expect(permissions).toContain('stronghold:allow-remove-store-record');
    expect(permissions).toContain('http:allow-fetch');
  });

  it('tidak menanam password vault tetap di bundle JavaScript', () => {
    const tokenStore = read('desktop/src/tokenStore.ts');
    expect(tokenStore).not.toContain('sahamlens-desktop-local-vault');
  });

  it('mengikat nama vault ke fingerprint password agar reset WebView tidak membuka snapshot lama', () => {
    const tokenStore = read('desktop/src/tokenStore.ts');
    expect(tokenStore).toContain("const vaultPasswordKey = 'sahamlens.vault-key.v3'");
    expect(tokenStore).toContain("crypto.subtle.digest('SHA-256'");
    expect(tokenStore).toContain('join(await appDataDir(), `sahamlens-${fingerprint}.hold`)');
    expect(tokenStore).toContain("import { appDataDir, join } from '@tauri-apps/api/path'");
    expect(tokenStore).not.toContain('return `sahamlens-${fingerprint}.hold`');
    expect(tokenStore).not.toContain("const vaultPath = 'sahamlens-v2.hold'");
    expect(tokenStore).not.toContain("const vaultPasswordKey = 'sahamlens.vault-key.v2'");
  });

  it('memberi error yang dapat ditindaklanjuti saat localStorage tidak dapat menyimpan kunci', () => {
    const tokenStore = read('desktop/src/tokenStore.ts');
    expect(tokenStore).toContain('Penyimpanan aman desktop tidak tersedia. Tutup aplikasi lalu buka kembali.');
  });
});
