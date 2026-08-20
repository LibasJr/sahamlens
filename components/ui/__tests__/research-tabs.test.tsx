import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResearchTabs } from '../ResearchTabs';

const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

const TABS = [
  { id: 'technical', label: 'Technical', href: '/technical/BBCA.JK' },
  { id: 'fundamental', label: 'Fundamental', href: '/fundamental?symbol=BBCA.JK' },
];

describe('ResearchTabs', () => {
  it('merender tiap tab sebagai tautan', () => {
    const html = render(<ResearchTabs tabs={TABS} activeId="technical" label="Sudut pandang BBCA" />);
    expect(html).toContain('href="/technical/BBCA.JK"');
    expect(html).toContain('Fundamental');
  });

  it('menandai tab aktif dengan aria-current, bukan hanya warna', () => {
    const html = render(<ResearchTabs tabs={TABS} activeId="fundamental" label="Sudut pandang" />);
    expect(html).toContain('aria-current="page"');
    // Yang aktif harus fundamental, bukan technical.
    const technicalSegment = html.slice(html.indexOf('/technical/BBCA.JK'), html.indexOf('Technical'));
    expect(technicalSegment).not.toContain('aria-current');
  });

  it('memenuhi lantai sentuh 44px di semua lebar', () => {
    // Tablet mewarisi ukuran kontrol desktop sementara alat masukannya tetap jari -
    // rentang itulah yang paling sering meleset saat ditekan.
    const html = render(<ResearchTabs tabs={TABS} activeId={null} label="Sudut pandang" />);
    expect(html).toContain('min-h-11');
    expect(html).not.toMatch(/(sm|md|lg):min-h-(0|8|9|10)\b/);
  });

  it('memberi nama navigasinya untuk pembaca layar', () => {
    const html = render(<ResearchTabs tabs={TABS} activeId={null} label="Sudut pandang analisis BBCA" />);
    expect(html).toContain('aria-label="Sudut pandang analisis BBCA"');
    expect(html).toContain('<nav');
  });

  it('bisa digeser horizontal di layar sempit', () => {
    const html = render(<ResearchTabs tabs={TABS} activeId={null} label="x" />);
    expect(html).toContain('overflow-x-auto');
  });

  it('tidak merender apa pun saat tidak ada tab', () => {
    expect(render(<ResearchTabs tabs={[]} activeId={null} label="x" />)).toBe('');
  });

  it('activeId yang tidak cocok berarti tidak ada tab aktif', () => {
    // Halaman alat (mis. /moat) sengaja tidak menyalakan tab mana pun.
    const html = render(<ResearchTabs tabs={TABS} activeId="tidak-ada" label="x" />);
    expect(html).not.toContain('aria-current');
  });
});
