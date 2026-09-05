import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.join(__dirname, '..');
const text = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('desktop-native presentation', () => {
  it('packages the SahamLens logo used by shell and auth pages', () => {
    expect(fs.existsSync(path.join(root, 'desktop-web/public/sahamlens-logo.png'))).toBe(true);
  });

  it('renders dedicated desktop chrome instead of the web shell alone', () => {
    const layout = text('desktop-web/app/layout.tsx');
    expect(layout).toContain('DesktopChrome');
    expect(layout).toContain('<DesktopChrome>');
  });

  it('uses the custom desktop title bar', () => {
    const config = JSON.parse(text('desktop/src-tauri/tauri.conf.json'));
    expect(config.app.windows[0].decorations).toBe(false);
    const chrome = text('desktop-web/app/desktop-chrome.tsx');
    expect(chrome).toContain('data-tauri-drag-region');
    expect(chrome).toContain('getCurrentWindow');
    expect(chrome).toContain('SahamLens Desktop');
  });
});
