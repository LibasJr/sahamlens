import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SectionHeader } from '../SectionHeader';

/**
 * Repo ini tidak punya jsdom, tapi render ke string sudah cukup untuk menegakkan
 * invarian markup - dan jauh lebih bernilai daripada `expect(Komponen).toBeDefined()`,
 * yang lulus bahkan ketika komponennya merender halaman kosong.
 */
const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

describe('SectionHeader', () => {
  it('merender judul sebagai heading', () => {
    const html = render(<SectionHeader title="Arus dana asing" />);
    expect(html).toContain('<h2');
    expect(html).toContain('Arus dana asing');
  });

  it('menghilangkan eyebrow dan lede saat tidak diberikan', () => {
    const html = render(<SectionHeader title="Judul" />);
    expect(html).not.toContain('lens-eyebrow');
    expect(html).not.toContain('lens-body');
  });

  it('menampilkan eyebrow dan lede saat diberikan', () => {
    const html = render(<SectionHeader eyebrow="Flow" title="Arus dana asing" lede="Net asing dan partisipasi." />);
    expect(html).toContain('Flow');
    expect(html).toContain('Net asing dan partisipasi.');
  });

  it('memakai peran tipografi, bukan ukuran arbitrer', () => {
    // Kalau seseorang mengganti ini dengan text-[15px], skala tipe berhenti jadi kontrak.
    const html = render(<SectionHeader eyebrow="Flow" title="Judul" lede="Lede." />);
    expect(html).toContain('lens-eyebrow');
    expect(html).toContain('lens-section-title');
    expect(html).toContain('lens-body-sm');
    expect(html).not.toMatch(/text-\[\d/);
  });

  it('menghormati as="h3" untuk sub-bagian', () => {
    const html = render(<SectionHeader title="Sub" as="h3" />);
    expect(html).toContain('<h3');
    expect(html).not.toContain('<h2');
  });

  it('menautkan id ke heading supaya jangkar mendarat di judul', () => {
    // Jangkar yang mendarat di pembungkus membuat judulnya tertutup header sticky.
    const html = render(<SectionHeader title="Arus dana" id="lens-flow" />);
    expect(html).toMatch(/<h2[^>]*id="lens-flow"/);
  });

  it('merender action di sisi kanan tanpa membungkusnya jadi kartu', () => {
    const html = render(<SectionHeader title="Judul" action={<a href="/x">Lihat semua</a>} />);
    expect(html).toContain('Lihat semua');
    expect(html).not.toContain('rounded-xl border');
  });
});
