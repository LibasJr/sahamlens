import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatusMeta } from '../StatusMeta';

const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

describe('StatusMeta', () => {
  it('merender tiap keterangan dipisah pemisah', () => {
    const html = render(<StatusMeta items={[
      { label: 'Diperbarui 16:15 WIB' },
      { label: 'Coverage 92%' },
    ]} />);

    expect(html).toContain('Diperbarui 16:15 WIB');
    expect(html).toContain('Coverage 92%');
    expect(html).toContain('·');
  });

  it('menandai keterangan caution dengan token amber', () => {
    // STALE harus tetap terbaca sebagai peringatan, bukan sekadar teks abu-abu.
    const html = render(<StatusMeta items={[{ label: 'Data mungkin tertunda', tone: 'caution' }]} />);
    expect(html).toContain('text-tv-yellow');
  });

  it('meneruskan title sebagai penjelasan hover', () => {
    const html = render(<StatusMeta items={[{ label: 'Tertunda', tone: 'caution', title: 'Bar terakhir 18 Agu 16:15 WIB' }]} />);
    expect(html).toContain('title="Bar terakhir 18 Agu 16:15 WIB"');
  });

  it('tidak merender apa pun saat daftarnya kosong', () => {
    // Baris pemisah yang menggantung di bawah judul terlihat seperti kerusakan.
    expect(render(<StatusMeta items={[]} />)).toBe('');
  });

  it('memakai peran metadata, bukan ukuran arbitrer', () => {
    const html = render(<StatusMeta items={[{ label: 'Coverage 92%' }]} />);
    expect(html).toContain('lens-meta');
    expect(html).not.toMatch(/text-\[\d/);
  });

  it('pemisah tidak dibacakan pembaca layar', () => {
    const html = render(<StatusMeta items={[{ label: 'A' }, { label: 'B' }]} />);
    expect(html).toMatch(/aria-hidden="true"[^>]*>·/);
  });
});
