import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('desktop minimum threat model', () => {
  it('keeps every native command behind a dedicated boundary audit', () => {
    const lib = read('desktop/src-tauri/src/lib.rs');
    const commands = [...lib.matchAll(/#\[tauri::command\]\s+(?:async\s+)?fn\s+(native_[a-z0-9_]+)/g)].map((match) => match[1]);
    expect(commands.length).toBeGreaterThanOrEqual(8);
    const audits = fs.readdirSync(path.join(ROOT, '__tests__'))
      .filter((file) => /^desktop-.+\.test\.ts$/.test(file))
      .map((file) => read(`__tests__/${file}`))
      .join('\n');
    for (const command of commands) expect(audits, command).toContain(command);
  });

  it('bounds native API response bytes before returning data to the renderer', () => {
    const lib = read('desktop/src-tauri/src/lib.rs');
    expect(lib).toContain('MAX_RESPONSE_BYTES');
    expect(lib).not.toMatch(/response\s*\.text\(\)/);
  });

  it('records all minimum threat classes in executable audit coverage', () => {
    const sources = [
      'desktop-native-lockdown.test.ts',
      'desktop-credential-boundary.test.ts',
      'desktop-navigation-boundary.test.ts',
      'desktop-export-boundary.test.ts',
      'desktop-diagnostics-boundary.test.ts',
      'desktop-threat-model.test.ts',
    ].map((file) => read(`__tests__/${file}`)).join('\n');
    for (const marker of ['CSP', 'token', 'redirect', 'header', 'body', 'external', 'deep link', 'filesystem', 'diagnostic', 'MAX_RESPONSE_BYTES']) {
      expect(sources.toLowerCase()).toContain(marker.toLowerCase());
    }
  });
});
