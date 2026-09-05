import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/desktop-pro.yml'), 'utf8');

describe('Windows installer lifecycle gate', () => {
  it('installs and removes the NSIS package silently on Windows CI', () => {
    expect(workflow).toContain('Smoke-test NSIS install lifecycle');
    expect(workflow).toContain('/S');
    expect(workflow).toContain('Uninstall.exe');
    expect(workflow).toContain('Test-Path');
  });

  it('verifies the installed executable can launch and exit cleanly', () => {
    expect(workflow).toContain('Start-Process');
    expect(workflow).toContain('WaitForInputIdle');
    expect(workflow).toContain('CloseMainWindow');
    expect(workflow).toContain('HasExited');
  });

  it('always cleans up the installed application', () => {
    expect(workflow).toContain('if: ${{ always() }}');
    expect(workflow).toContain('Cleanup NSIS smoke install');
  });
});
