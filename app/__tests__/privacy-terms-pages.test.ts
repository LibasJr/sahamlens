import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'path';

/**
 * Test fokus halaman /privacy dan /terms — membuktikan section penting,
 * email, tanggal update, heading semantic, disclaimer investasi/keamanan,
 * retensi yang terbukti, dan footer links.
 */

const APP_DIR = path.join(process.cwd(), 'app');
const I18N_DIR = path.join(process.cwd(), 'lib', 'i18n', 'locales');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(APP_DIR, relativePath), 'utf8');
}

function readI18n(lang: string): string {
  return fs.readFileSync(path.join(I18N_DIR, `${lang}.ts`), 'utf8');
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('halaman /privacy', () => {
  it('memiliki page.tsx yang komponen client', () => {
    const source = read('privacy/page.tsx');
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('memiliki layout.tsx dengan metadata SEO dan canonical', () => {
    const source = stripComments(read('privacy/layout.tsx'));
    expect(source).toContain("canonical: '/privacy'");
    expect(source).toMatch(/title\s*:/);
    expect(source).toMatch(/description\s*:/);
  });

  it('memuat judul Kebijakan Privasi', () => {
    const source = read('privacy/page.tsx');
    expect(source).toContain('privacyPage.heroTitle');
    expect(readI18n('id')).toContain("heroTitle: 'Kebijakan Privasi'");
  });

  it('memuat tanggal terakhir diperbarui', () => {
    const source = read('privacy/page.tsx');
    expect(source).toContain('privacyPage.lastUpdated');
    expect(readI18n('id')).toContain('Terakhir diperbarui');
  });

  it('memuat email support@sahamlens.id', () => {
    const source = read('privacy/page.tsx');
    expect(source).toContain('support@sahamlens.id');
  });

  it('memuat section akun, retensi, dan penghapusan', () => {
    const source = read('privacy/page.tsx');
    expect(source).toContain('key: \'sectionAccount\'');
    expect(source).toContain('key: \'sectionRetention\'');
    expect(source).toContain('key: \'sectionDeletion\'');
  });

  it('memuat disclaimer jangan bagikan data sensitif', () => {
    const source = read('privacy/page.tsx');
    expect(source).toContain('privacyPage.sensitiveWarningTitle');
    const idSource = readI18n('id');
    expect(idSource).toContain('password');
    expect(idSource).toContain('OTP');
    expect(idSource).toContain('API key');
  });

  it('memuat angka retensi terbukti (90, 180, 365 hari)', () => {
    const idSource = readI18n('id');
    expect(idSource).toContain('90 hari');
    expect(idSource).toContain('180 hari');
    expect(idSource).toContain('365 hari');
  });

  it('tidak memuat klaim yurisdiksi/sengketa di privacy/terms', () => {
    const id = stripComments(readI18n('id'));
    const en = stripComments(readI18n('en'));
    const privacyTermsId = id.split('privacyPage:')[1].split('termsPage:')[0];
    const privacyTermsEn = en.split('privacyPage:')[1].split('termsPage:')[0];
    expect(privacyTermsId.toLowerCase()).not.toContain('yurisdiksi');
    expect(privacyTermsEn.toLowerCase()).not.toContain('jurisdiction');
    expect(privacyTermsEn.toLowerCase()).not.toContain('dispute resolution');
  });

  it('footer memuat link /privacy yang tidak duplikat', () => {
    const source = stripComments(
      fs.readFileSync(path.join(process.cwd(), 'components', 'SiteFooter.tsx'), 'utf8'),
    );
    const matches = source.match(/href="\/privacy"/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe('halaman /terms', () => {
  it('memiliki page.tsx yang komponen client', () => {
    const source = read('terms/page.tsx');
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('memiliki layout.tsx dengan metadata SEO dan canonical', () => {
    const source = stripComments(read('terms/layout.tsx'));
    expect(source).toContain("canonical: '/terms'");
    expect(source).toMatch(/title\s*:/);
    expect(source).toMatch(/description\s*:/);
  });

  it('memuat judul Ketentuan Penggunaan', () => {
    const source = read('terms/page.tsx');
    expect(source).toContain('termsPage.heroTitle');
    expect(readI18n('id')).toContain("heroTitle: 'Ketentuan Penggunaan'");
  });

  it('memuat tanggal terakhir diperbarui', () => {
    const source = read('terms/page.tsx');
    expect(source).toContain('termsPage.lastUpdated');
    expect(readI18n('id')).toContain('Terakhir diperbarui');
  });

  it('memuat email support@sahamlens.id', () => {
    const source = read('terms/page.tsx');
    expect(source).toContain('support@sahamlens.id');
  });

  it('memuat disclaimer bukan penasihat investasi', () => {
    const source = read('terms/page.tsx');
    expect(source).toContain("key: 'sectionTool'");
    const idSource = readI18n('id');
    expect(idSource).toContain('alat riset');
    expect(idSource).toContain('bukan penasihat investasi');
  });

  it('memuat section tanggung jawab pengguna', () => {
    const source = read('terms/page.tsx');
    expect(source).toContain("key: 'sectionResponsibility'");
    expect(source).toContain("key: 'sectionProhibited'");
  });

  it('memuat batasan tanggung jawab', () => {
    const source = read('terms/page.tsx');
    expect(source).toContain("key: 'sectionLiability'");
    const idSource = readI18n('id');
    expect(idSource.toLowerCase()).toContain('batasan tanggung jawab');
  });

  it('memuat TPM/CL, ownership flow, LensAI bukan jaminan', () => {
    const idSource = readI18n('id');
    expect(idSource).toContain('TP/CL');
    expect(idSource).toContain('ownership flow');
    expect(idSource).toContain('LensAI');
  });

  it('tidak memuat klaim yurisdiksi/sengketa tanpa review legal', () => {
    const id = stripComments(readI18n('id'));
    const en = stripComments(readI18n('en'));
    const termsId = id.split('termsPage:').pop() ?? '';
    const termsEn = en.split('termsPage:').pop() ?? '';
    expect(termsId.toLowerCase()).not.toContain('yurisdiksi');
    expect(termsEn.toLowerCase()).not.toContain('jurisdiction');
    expect(termsEn.toLowerCase()).not.toContain('dispute');
  });

  it('footer memuat link /terms yang tidak duplikat', () => {
    const source = stripComments(
      fs.readFileSync(path.join(process.cwd(), 'components', 'SiteFooter.tsx'), 'utf8'),
    );
    const matches = source.match(/href="\/terms"/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe('sitemap', () => {
  it('/privacy dan /terms terdaftar di sitemap', () => {
    const source = read('sitemap.ts');
    expect(source).toContain("'privacy'");
    expect(source).toContain("'terms'");
  });
});

describe('frasa terlarang — tidak boleh tampil di UI', () => {
  const forbiddenPatterns: Array<[string, RegExp]> = [
    ['bukan pengganti tinjauan hukum', /bukan pengganti tinjauan hukum/i],
    ['tidak pernah melebihi (liability cap)', /tidak pernah melebihi/i],
    ['12 bulan sebelum klaim', /12 bulan sebelum klaim/i],
    ['penggunaan berkelanjutan.*menerima', /penggunaan berkelanjutan.*menerima/i],
    ['tidak menjanjikan pengembalian dana', /tidak menjanjikan pengembalian dana/i],
  ];

  it.each(forbiddenPatterns)('i18n id tidak mengandung "%s"', (_label, pattern) => {
    const id = stripComments(readI18n('id'));
    expect(id).not.toMatch(pattern);
  });

  it.each(forbiddenPatterns)('i18n en tidak mengandung "%s"', (_label, pattern) => {
    const en = stripComments(readI18n('en'));
    expect(en).not.toMatch(pattern);
  });

  it('privacy/page.tsx tidak merender noteDisclaimer', () => {
    const source = read('privacy/page.tsx');
    expect(source).not.toContain('noteDisclaimer');
  });

  it('terms/page.tsx tidak merender noteDisclaimer', () => {
    const source = read('terms/page.tsx');
    expect(source).not.toContain('noteDisclaimer');
  });

  it('privacy sectionSecurityBody tidak memakai jaminan absolut "Yang kami jamin"', () => {
    const id = stripComments(readI18n('id'));
    expect(id).not.toContain('Yang kami jamin');
  });

  it('privacy sectionRightsBody memakai "menargetkan respons awal"', () => {
    const id = stripComments(readI18n('id'));
    expect(id).toContain('menargetkan respons awal dalam 1 hari kerja');
  });
});
