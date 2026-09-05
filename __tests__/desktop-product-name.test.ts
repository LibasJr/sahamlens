import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.join(__dirname, '..');
const DESKTOP_ROOT = path.join(REPO_ROOT, 'desktop');
const TEXT_EXTENSIONS = new Set(['.html', '.json', '.md', '.rs', '.toml', '.ts', '.tsx']);
const SKIPPED_DIRECTORIES = new Set(['dist', 'node_modules', 'target']);

function listDesktopSources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED_DIRECTORIES.has(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listDesktopSources(absolute);
    return TEXT_EXTENSIONS.has(path.extname(entry.name)) ? [absolute] : [];
  });
}

const desktopSources = listDesktopSources(DESKTOP_ROOT);
const legacyBrandPattern = /SahamLens Pro|sahamlens-desktop-pro|sahamlens_desktop_pro/i;

describe('nama produk SahamLens Desktop', () => {
  it('menemukan sumber desktop untuk diperiksa', () => {
    expect(desktopSources.length).toBeGreaterThan(20);
  });

  it('tidak menyisakan nama produk lama pada sumber dan metadata desktop', () => {
    const offenders = desktopSources
      .filter((file) => legacyBrandPattern.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(REPO_ROOT, file).split(path.sep).join('/'));

    expect(offenders).toEqual([]);
  });
});
