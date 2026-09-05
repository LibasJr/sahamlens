import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('desktop export boundary', () => {
  it('writes exports only after a native save dialog selects the destination', () => {
    const source = read('desktop/src-tauri/src/export.rs');
    expect(source).toContain('blocking_save_file');
    expect(source).toContain('sanitize_export_filename');
    expect(source).toContain('MAX_EXPORT_BYTES');
    expect(source).not.toContain('canonicalize');
  });

  it('does not grant renderer-level dialog or filesystem permissions', () => {
    const capability = JSON.parse(read('desktop/src-tauri/capabilities/default.json')) as { permissions: string[] };
    expect(capability.permissions.some((permission) => permission.startsWith('dialog:'))).toBe(false);
    expect(capability.permissions.some((permission) => permission.startsWith('fs:'))).toBe(false);
  });

  it('routes text export through the validating native command', () => {
    const helper = read('shared/browser/save-text-export.ts');
    expect(helper).toMatch(/invoke(?:<boolean>)?\('native_save_text_export'/);
    expect(helper).not.toContain('@tauri-apps/plugin-dialog');
    expect(helper).not.toContain('@tauri-apps/plugin-fs');
  });

  it('routes image exports through the same native-owned save boundary', () => {
    const helper = read('shared/browser/save-binary-export.ts');
    const button = read('components/export/ExportImageButton.tsx');
    expect(helper).toMatch(/invoke(?:<boolean>)?\('native_save_binary_export'/);
    expect(button).toContain('saveBinaryExport');
    expect(button).not.toMatch(/\.download\s*=/);
  });

  it('centralizes clipboard access outside the shared helper', () => {
    const featureFiles = [
      'app/compare/page.tsx',
      'components/PaywallModal.tsx',
      'components/PositionSizingCalculator.tsx',
      'components/ui/ApiErrorHint.tsx',
    ];
    for (const file of featureFiles) {
      const source = read(file);
      expect(source, file).not.toMatch(/navigator\.clipboard|document\.execCommand\(['"]copy/);
    }
  });
});
