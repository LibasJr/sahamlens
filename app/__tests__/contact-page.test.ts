import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Test fokus halaman /contact — membuktikan halaman, link footer,
 * email, SLA, jam layanan, dan peringatan keamanan hadir.
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

describe('halaman /contact', () => {
  it('memiliki page.tsx yang komponen client', () => {
    const source = read('contact/page.tsx');
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('memiliki layout.tsx dengan metadata SEO', () => {
    const source = stripComments(read('contact/layout.tsx'));
    expect(source).toContain("canonical: '/contact'");
    expect(source).toMatch(/title\s*:/);
    expect(source).toMatch(/description\s*:/);
  });

  it('memuat judul Hubungi Kami', () => {
    const source = read('contact/page.tsx');
    expect(source).toContain('contactPage.heroTitle');
    expect(readI18n('id')).toContain("heroTitle: 'Hubungi Kami'");
  });

  it('memuat email support@sahamlens.id', () => {
    const source = read('contact/page.tsx');
    expect(source).toContain('support@sahamlens.id');
  });

  it('memakai mailto dengan subject Bantuan SahamLens', () => {
    const source = read('contact/page.tsx');
    expect(source).toContain("t('contactPage.ctaHref')");
    expect(readI18n('id')).toContain('mailto:support@sahamlens.id?subject=Bantuan%20SahamLens');
  });

  it('memuat target balasan 1 hari kerja', () => {
    const source = read('contact/page.tsx');
    expect(source).toContain('contactPage.responseTarget');
    expect(readI18n('id')).toContain('Target balasan: 1 hari kerja');
  });

  it('memuat jam layanan Senin–Jumat 09.00–17.00 WIB', () => {
    const source = read('contact/page.tsx');
    expect(source).toContain('contactPage.serviceHours');
    expect(readI18n('id')).toContain('Senin–Jumat, 09.00–17.00 WIB');
  });

  it('memuat peringatan keamanan tentang data sensitif', () => {
    const source = read('contact/page.tsx');
    expect(source).toContain("t('contactPage.securityWarning')");
    const idSource = readI18n('id');
    expect(idSource).toContain('password');
    expect(idSource).toContain('OTP');
    expect(idSource).toContain('PIN');
  });

  it('memuat instruksi laporan', () => {
    const source = read('contact/page.tsx');
    expect(source).toContain('contactPage.reportTitle');
    expect(source).toContain('contactPage.reportItems.account');
    expect(source).toContain('contactPage.reportItems.page');
    expect(source).toContain('contactPage.reportItems.device');
    expect(source).toContain('contactPage.reportItems.steps');
    expect(source).toContain('contactPage.reportItems.time');
    expect(source).toContain('contactPage.reportItems.error');
    expect(source).toContain('contactPage.reportItems.ticker');
  });

  it('tidak memuat status dinamis palsu seperti Support Aktif', () => {
    const source = read('contact/page.tsx');
    expect(source).not.toContain('Support Aktif');
    expect(source).not.toContain('support aktif');
  });
});

describe('link /contact dari navigasi', () => {
  it('footer memuat link ke /contact', () => {
    const source = stripComments(
      fs.readFileSync(path.join(process.cwd(), 'components', 'SiteFooter.tsx'), 'utf8'),
    );
    expect(source).toContain('href="/contact"');
    expect(source).toContain("t('footer.contact')");
  });
});

describe('sitemap', () => {
  it('/contact terdaftar di sitemap', () => {
    const source = read('sitemap.ts');
    expect(source).toContain("'contact'");
  });
});
