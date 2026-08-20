import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MetricBand } from '../MetricBand';

const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

describe('MetricBand', () => {
  it('merender setiap metrik dengan label dan nilainya', () => {
    const html = render(<MetricBand items={[
      { label: 'IHSG', value: '8.123,45', detail: '+0,62%', tone: 'positive' },
      { label: 'Breadth', value: '62%', detail: 'Healthy' },
    ]} />);

    expect(html).toContain('IHSG');
    expect(html).toContain('8.123,45');
    expect(html).toContain('Breadth');
    expect(html).toContain('Healthy');
  });

  it('bukan deretan kartu', () => {
    // PRD SEC.13: band, bukan empat kartu. Kalau ini berubah jadi kartu, seluruh alasan
    // primitif ini ada ikut hilang.
    const html = render(<MetricBand items={[{ label: 'IHSG', value: '8.123' }]} />);
    expect(html).not.toContain('bg-tv-card');
    expect(html).not.toMatch(/rounded-(xl|2xl)[^"]*border/);
  });

  it('memakai angka tabular supaya kolom tidak bergoyang', () => {
    const html = render(<MetricBand items={[{ label: 'IHSG', value: '8.123' }]} />);
    expect(html).toContain('lens-metric');
  });

  it('menyatakan data kosong, bukan menampilkan strip polos', () => {
    // "-" tidak memberi tahu apakah datanya belum ada atau gagal dimuat.
    const html = render(<MetricBand items={[{ label: 'Regime', value: null }]} />);
    expect(html).toContain('belum ada data');
    expect(html).not.toContain('>-<');
  });

  it('menghormati emptyHint khusus', () => {
    const html = render(<MetricBand items={[{ label: 'Regime', value: null, emptyHint: 'butuh akun Pro' }]} />);
    expect(html).toContain('butuh akun Pro');
  });

  it('mewarnai tone lewat token, bukan hex', () => {
    const html = render(<MetricBand items={[
      { label: 'A', value: '1', tone: 'positive' },
      { label: 'B', value: '2', tone: 'negative' },
      { label: 'C', value: '3', tone: 'caution' },
    ]} />);

    expect(html).toContain('text-tv-green');
    expect(html).toContain('text-tv-red');
    expect(html).toContain('text-tv-yellow');
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it('menjadi 2 kolom di ponsel dan sebaris di layar lebar', () => {
    // PRD SEC.13: mobile 2x2.
    const html = render(<MetricBand items={[
      { label: 'A', value: '1' }, { label: 'B', value: '2' },
      { label: 'C', value: '3' }, { label: 'D', value: '4' },
    ]} />);
    expect(html).toContain('grid-cols-2');
    expect(html).toMatch(/(sm|md):grid-cols-4/);
  });
});
