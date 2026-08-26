import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts/audit-trusted-proxy-mode.mjs');

function run(extraEnv: Record<string, string | undefined>): { code: number; stdout: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      cwd: ROOT,
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout };
  } catch (error) {
    const execError = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: execError.status ?? 1,
      stdout: (execError.stdout ?? '') + (execError.stderr ?? ''),
    };
  }
}

describe('audit-trusted-proxy-mode', () => {
  it('lolos ketika production + TRUSTED_PROXY_MODE=cloudflare', () => {
    const result = run({ NODE_ENV: 'production', TRUSTED_PROXY_MODE: 'cloudflare' });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('gagal ketika production + TRUSTED_PROXY_MODE=direct', () => {
    const result = run({ NODE_ENV: 'production', TRUSTED_PROXY_MODE: 'direct' });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('TRUSTED_PROXY_MODE=direct');
  });

  it('gagal ketika production + TRUSTED_PROXY_MODE=forwarded', () => {
    const result = run({ NODE_ENV: 'production', TRUSTED_PROXY_MODE: 'forwarded' });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('TRUSTED_PROXY_MODE=forwarded');
  });

  it('gagal ketika production tanpa TRUSTED_PROXY_MODE sama sekali', () => {
    const result = run({ NODE_ENV: 'production', TRUSTED_PROXY_MODE: undefined });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('tidak diset');
  });

  it('gagal ketika production + TRUSTED_PROXY_MODE nilai sampah', () => {
    const result = run({ NODE_ENV: 'production', TRUSTED_PROXY_MODE: 'nginx-privat' });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('tidak dikenal');
  });

  it('dilewati ketika bukan production, apapun TRUSTED_PROXY_MODE-nya', () => {
    const result = run({ NODE_ENV: 'development', TRUSTED_PROXY_MODE: 'direct' });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('dilewati');
  });

  it('dilewati ketika NODE_ENV kosong (lokal tanpa env eksplisit)', () => {
    const result = run({ NODE_ENV: undefined, TRUSTED_PROXY_MODE: undefined });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('dilewati');
  });
}, 30_000);
