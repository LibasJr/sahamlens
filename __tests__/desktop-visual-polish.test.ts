import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');
const polish = read('desktop/src/visual-polish.css');
const main = read('desktop/src/main.tsx');
const modal = read('desktop/src/components/AccountModal.tsx');
const vite = read('desktop/vite.config.ts');

describe('desktop visual polish contract', () => {
  it('memusatkan token visual dan memakai cyan untuk interaksi UI', () => {
    for (const token of ['--ui-accent:#38bdf8', '--ui-accent-strong:#0284c7', '--ui-muted:#9aabba', '--radius-md:10px', '--focus-ring:']) {
      expect(polish).toContain(token);
    }
    expect(polish).toContain('--ui-brand-navy:#14213d');
    expect(polish).toContain('--ui-brand-indigo:#3730a3');
    expect(polish).toContain('.nav-brand{background:linear-gradient(145deg,var(--ui-brand-navy),var(--ui-brand-indigo))');
    expect(polish).toContain('.mode-switch button.active,.workspace-tabs button.active');
  });

  it('mencadangkan hijau dan merah untuk makna pasar', () => {
    expect(polish).toContain('--market-positive:#22c55e');
    expect(polish).toContain('--market-negative:#f05252');
    expect(polish).toContain('.positive{color:var(--market-positive)!important}');
    expect(polish).toContain('.negative{color:var(--market-negative)!important}');
    expect(polish).not.toContain('background:#22c55e');
  });

  it('menjaga teks metadata minimum 12px dan kontras sekunder', () => {
    expect(polish).toMatch(/\.desktop-app :is\([\s\S]*\)\{font-size:12px\}/);
    expect(polish).toContain('--ui-muted:#9aabba');
  });

  it('menyederhanakan layout dan menyembunyikan insight pada viewport sempit', () => {
    expect(polish).toContain('@media(max-width:1240px)');
    expect(polish).toContain('>.research-panel');
    expect(polish).toContain('display:none');
    expect(polish).toContain('@media(max-width:1100px)');
  });

  it('mengimpor polish terakhir dan menampilkan versi dari package desktop', () => {
    expect(main).toContain("import './visual-polish.css'");
    expect(vite).toContain('__APP_VERSION__');
    expect(vite).toContain('packageJson.version');
    expect(modal).toContain('SahamLens Desktop v{__APP_VERSION__}');
  });
});
