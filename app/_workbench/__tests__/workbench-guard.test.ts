import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Rute internal yang "dimaksudkan hanya untuk dev" adalah cara paling lazim permukaan
 * debug bocor ke produksi. Niat tidak menggerbang apa pun; tiga hal di bawah yang
 * menggerbang, dan ketiganya harus tetap ada.
 */
const ROOT = path.resolve(__dirname, '../../..');

function baca(rel: string): string {
  const full = path.join(ROOT, rel);
  expect(fs.existsSync(full), `${rel} hilang - pindahkan gerbangnya, jangan biarkan lulus`).toBe(true);
  return fs.readFileSync(full, 'utf8');
}

describe('penjaga rute workbench', () => {
  const page = baca('app/_workbench/page.tsx');

  it('menolak diri sendiri di produksi', () => {
    expect(page).toContain("process.env.NODE_ENV === 'production'");
    expect(page).toContain('notFound()');
  });

  it('menandai dirinya noindex', () => {
    expect(page).toContain('noindex');
  });

  it('dilarang lewat robots.txt', () => {
    expect(baca('app/robots.ts')).toContain('/_workbench');
  });

  it('tidak masuk sitemap', () => {
    // sitemap.ts memakai allowlist, jadi ini menegaskan tidak ada yang menambahkannya.
    expect(baca('app/sitemap.ts')).not.toContain('_workbench');
  });

  it('merender setiap primitif V3', () => {
    // Kalau sebuah primitif tidak ada di workbench, ia tidak pernah terpotret - dan
    // ketidakkonsistenannya baru ketahuan setelah tersebar ke sepuluh halaman.
    for (const primitif of ['SectionHeader', 'MetricBand', 'InsightRow', 'StatusMeta', 'ResearchTabs']) {
      expect(page, `${primitif} tidak dirender di workbench`).toContain(primitif);
    }
  });
});
