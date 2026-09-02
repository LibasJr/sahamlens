import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');
const feature = read('desktop/src/components/FeatureWorkspace.tsx');
const main = read('desktop/src/main.tsx');
const header = read('desktop/src/components/GlobalHeader.tsx');

describe('policy desktop selama masa testing', () => {
  it('menampilkan teaser Pro tetapi tidak pernah memanggil endpoint Pro', () => {
    expect(feature).toContain("if (feature.access === 'pro') { setError('PRO_DISABLED_TESTING'); return; }");
    expect(feature).toContain("feature.access !== 'pro'");
    expect(feature).toContain('Akses Pro belum diaktifkan untuk akun mana pun.');
    expect(feature).toContain('Segera hadir setelah masa testing');
  });

  it('guest melihat CTA akun tanpa request privat otomatis', () => {
    expect(feature).toContain("feature.access === 'account' && !authenticated");
    expect(feature).toContain('(feature.access !== \'account\' || authenticated)');
    expect(feature).toContain('Daftar / Masuk');
    expect(main).toContain('onRequestAuth={() => setAccountOpen(true)}');
  });

  it('meneruskan policy akun melalui satu helper ke seluruh FeatureWorkspace', () => {
    expect(main.match(/<FeatureWorkspace/g)).toHaveLength(1);
    expect(main).not.toContain('featureWorkspace(radarTab)');
    expect(main).toContain('featureWorkspace(analysisTab)');
    expect(main).toContain('featureWorkspace(toolTab)');
    expect(main).toContain('featureWorkspace(calendarTab)');
    expect(main).toContain("workspace === 'intelligence'");
  });

  it('mengganti mode tampilan Pro menjadi Expert dan memigrasikan preferensi lama', () => {
    expect(header).toContain("'guided' | 'focus' | 'expert'");
    expect(header).not.toContain("'guided' | 'focus' | 'pro'");
    expect(header).toContain("'Expert'");
    expect(main).toContain("saved === 'pro' ? 'expert'");
  });
});
