import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InsightRow } from '../InsightRow';

const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

describe('InsightRow', () => {
  it('merender judul dan penjelasannya', () => {
    const html = render(<InsightRow direction="BULLISH" title="Momentum membaik" detail="Harga bertahan di atas MA20." />);
    expect(html).toContain('Momentum membaik');
    expect(html).toContain('Harga bertahan di atas MA20.');
  });

  it('tidak pernah menyampaikan arah hanya lewat warna', () => {
    // WCAG 1.4.1 dan PRD SEC.24: status tidak boleh dibedakan warna saja. Panah adalah
    // bentuk, dan teks sr-only menamainya untuk pembaca layar.
    const bullish = render(<InsightRow direction="BULLISH" title="A" />);
    const bearish = render(<InsightRow direction="BEARISH" title="B" />);

    expect(bullish).toContain('↑');
    expect(bearish).toContain('↓');
    expect(bullish).toContain('sr-only');
    expect(bullish).toContain('condong positif');
    expect(bearish).toContain('condong negatif');
  });

  it('memakai token warna untuk tiap arah', () => {
    expect(render(<InsightRow direction="BULLISH" title="A" />)).toContain('text-tv-green');
    expect(render(<InsightRow direction="BEARISH" title="A" />)).toContain('text-tv-red');
    expect(render(<InsightRow direction="NEUTRAL" title="A" />)).toContain('text-tv-muted');
  });

  it('menampilkan sumber sebagai metadata, bukan judul kedua', () => {
    const html = render(<InsightRow direction="NEUTRAL" title="Valuasi tinggi" source="Analyzer PER" />);
    expect(html).toContain('Analyzer PER');
    expect(html).toContain('lens-meta');
  });

  it('bukan kartu', () => {
    // Tiga sampai lima temuan berturut-turut sebagai kartu akan menjadi dinding kotak.
    const html = render(<InsightRow direction="BULLISH" title="A" detail="B" />);
    expect(html).not.toContain('bg-tv-card');
  });

  it('menghilangkan detail dan sumber saat tidak ada', () => {
    const html = render(<InsightRow direction="NEUTRAL" title="Hanya judul" />);
    expect(html).toContain('Hanya judul');
    expect(html).not.toContain('lens-meta');
  });
});
