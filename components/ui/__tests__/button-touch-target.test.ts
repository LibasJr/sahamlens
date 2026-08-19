import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ALASAN MIGRASI KE <Button> BUKAN KOSMETIK.
 *
 * Tombol yang dirakit tangan di repo ini rutin memakai `px-4 py-2` - tinggi efektifnya
 * sekitar 36px. Di ponsel itu di bawah target sentuh yang layak, dan tidak ada satu pun
 * berkas yang "salah": tiap orang menulis padding yang terlihat pas di layar mereka.
 * Yang memperbaikinya bukan disiplin, melainkan satu tempat yang memutuskan ukurannya.
 *
 * Nilai `min-h-11` (44px) di bawah adalah SELURUH alasan mengganti <button> mentah dengan
 * komponen ini. Kalau suatu saat ada yang merapikan tabel SIZES dan menurunkannya - mudah
 * terjadi, karena di desktop varian `sm:min-h-*` yang lebih kecil yang terlihat - maka
 * setiap tombol yang sudah dimigrasi ikut menyusut sekaligus, diam-diam. Tes ini menahan
 * justru perubahan itu.
 */

const SRC = fs.readFileSync(path.join(__dirname, '..', 'Button.tsx'), 'utf8');

/** Ambil isi tabel SIZES sebagai peta ukuran -> daftar kelas. */
function sizeTable(): Record<string, string> {
  const block = SRC.match(/const SIZES: Record<ButtonSize, string> = \{([\s\S]*?)\n\};/);
  expect(block, 'tabel SIZES hilang dari Button.tsx').not.toBeNull();
  const out: Record<string, string> = {};
  for (const line of block![1].split('\n')) {
    const m = line.match(/(\w+):\s*'([^']*)'/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

describe('target sentuh <Button>', () => {
  const sizes = sizeTable();

  it('mendefinisikan tiga ukuran', () => {
    expect(Object.keys(sizes).sort()).toEqual(['lg', 'md', 'sm']);
  });

  it.each(['sm', 'md', 'lg'])('ukuran %s minimal 44px di ponsel', (size) => {
    // Kelas TANPA awalan breakpoint berlaku dari layar terkecil. Di situlah jarinya.
    const mobile = sizes[size].split(/\s+/).filter((c) => !c.includes(':'));
    const minH = mobile.find((c) => c.startsWith('min-h-'));
    expect(minH, `ukuran ${size} tidak punya lantai tinggi di ponsel: ${sizes[size]}`).toBeDefined();
    // Skala Tailwind: min-h-11 = 2.75rem = 44px.
    const step = Number(minH!.replace('min-h-', ''));
    expect(step * 4).toBeGreaterThanOrEqual(44);
  });

  it('varian desktop boleh lebih rapat, tapi hanya lewat awalan breakpoint', () => {
    // Kalau `sm:min-h-8` kehilangan awalannya, ia menjadi lantai PONSEL 32px - persis
    // kemunduran yang tidak akan terlihat siapa pun di layar besar.
    for (const [size, cls] of Object.entries(sizes)) {
      for (const c of cls.split(/\s+/)) {
        if (!c.startsWith('min-h-')) continue;
        const step = Number(c.replace('min-h-', ''));
        expect(step * 4, `${size}: ${c} tanpa breakpoint`).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
