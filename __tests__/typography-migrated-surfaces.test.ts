import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../scripts/lib/strip-comments.mjs';

const ROOT = path.resolve(__dirname, '..');
const DAFTAR = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'typography-migrated.json'), 'utf8'));

const ARBITRARY_RE = /text-\[(\d+(?:\.\d+)?)px\]/g;

// Tipe kembalian ditulis eksplisit: `stripComments` berasal dari berkas .mjs tanpa tipe,
// dan tanpa ini seluruh baris di bawahnya menjadi `any` diam-diam.
const baca = (relatif: string): string =>
  stripComments(fs.readFileSync(path.join(ROOT, relatif), 'utf8')) as string;

describe('permukaan yang sudah dimigrasikan tidak menerima ukuran piksel lagi', () => {
  it('daftarnya masuk akal (penjaga pemindai)', () => {
    // Kalau angka ini jatuh mendekati nol, yang rusak adalah daftarnya - bukan berarti
    // seluruh aplikasi sudah bersih.
    expect(DAFTAR.bersih.length).toBeGreaterThanOrEqual(30);
    expect(DAFTAR.pengecualian.length).toBeGreaterThanOrEqual(1);
  });

  it('setiap berkas dalam daftar masih ada di path itu', () => {
    // Gerbang yang menunjuk path lama tidak gagal - ia lulus tanpa memeriksa apa pun,
    // dan itu lebih buruk daripada merah. Kasus ini pernah terjadi di repo ini.
    const hilang = DAFTAR.bersih.filter((relatif: string) => !fs.existsSync(path.join(ROOT, relatif)));
    expect(hilang, 'berkas dipindah tanpa memindahkan entri di config/typography-migrated.json').toEqual([]);
  });

  it.each(DAFTAR.bersih as string[])('%s tidak memakai ukuran piksel acak', (relatif) => {
    const temuan = [...baca(relatif).matchAll(ARBITRARY_RE)].map((m) => m[0]);
    expect(temuan, `${relatif} kembali memakai ukuran piksel - pakai peran .lens-*`).toEqual([]);
  });

  it('pengecualian tetap memakai alasan yang menyebabkannya dikecualikan', () => {
    for (const { file, ukuran } of DAFTAR.pengecualian as { file: string; ukuran: string[] }[]) {
      const isi = baca(file);
      const dipakai = [...isi.matchAll(ARBITRARY_RE)].map((m) => m[0]).sort();
      // Isinya boleh bergeser, tapi tidak boleh bertambah: pengecualian yang tumbuh
      // diam-diam adalah cara paling rapi menghapus sebuah gerbang.
      expect(dipakai, `${file} menambah ukuran piksel di luar pengecualian`).toEqual([...ukuran].sort());
      // Tanpa leading-none, alasan pengecualiannya hilang: kotak avatar tetap, tinggi
      // baris warisan body membuat teksnya mendesak keluar lingkaran.
      expect(isi, `${file} kehilangan leading-none - alasan pengecualiannya tidak berlaku lagi`).toContain('leading-none');
    }
  });
});

describe('jebakan yang sudah terdokumentasi: lens-chip pada elemen tabel', () => {
  const STRUCT = /<(tr|td|th|thead|tbody)\b/;

  it('tidak ada elemen struktur tabel yang memakai lens-chip', () => {
    const berkas: string[] = [];
    for (const dir of ['app', 'components']) {
      const telusuri = (relatif: string) => {
        for (const entry of fs.readdirSync(path.join(ROOT, relatif), { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          const anak = `${relatif}/${entry.name}`;
          if (entry.isDirectory()) {
            telusuri(anak);
            continue;
          }
          if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
          if (/Export(Card|Sheet|Image)?\.tsx?$/.test(entry.name)) continue;
          berkas.push(anak);
        }
      };
      telusuri(dir);
    }

    const pelanggar = berkas.flatMap((relatif) =>
      baca(relatif)
        .split('\n')
        .map((baris, index) => ({ baris, index: index + 1 }))
        .filter(({ baris }) => STRUCT.test(baris) && baris.includes('lens-chip'))
        .map(({ baris, index }) => `${relatif}:${index + 1}: ${baris.trim().slice(0, 120)}`),
    );

    expect(pelanggar).toEqual([]);
    // Penjaga pemindai: 20 berkas pertama saja sudah banyak yang memuat elemen tabel.
    expect(berkas.length).toBeGreaterThan(200);
  });
});