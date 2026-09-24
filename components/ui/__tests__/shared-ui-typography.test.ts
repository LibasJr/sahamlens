import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Primitif bersama harus memakai skala peran, bukan ukuran piksel yang dikarang.
 *
 * Terukur 24 September 2026, sebelum fase 2 audit tipografi: `components/ui` memuat
 * 21 ukuran arbitrer di 10 berkas (LanguageSwitcher 5, NotificationCenter 6,
 * PriceRangeSlider 2, EmptyState 2, RadialScoreGauge 2, Select/Input/Textarea/
 * SegmentedControl/LoadingFact/Table/Toast sisanya). Angka-angka itu bukan sekadar
 * tidak rapi - lantai keterbacaan di globals.css menaikkan hampir semuanya ke 13px,
 * jadi `text-[11px]` di desktop merender 13px dan kode berhenti menggambarkan apa
 * pun yang dilihat pengguna.
 *
 * Gerbang ini menjaga jumlahnya tetap hanya pada pengecualian yang punya alasan
 * tertulis. Selama tidak ada ukuran arbitrer baru, migrasi bertahap bisa berhenti
 * kapan saja tanpa membusuk.
 */
const ROOT = path.resolve(__dirname, '../../..');
const UI_DIR = path.join(ROOT, 'components/ui');

/** CLAUDE.md SEC.2: buang komentar dulu, atau prosa bisa meluluskan gerbang ini -
 *  komentar di repo ini memang menyebut `text-[10px]` saat menjelaskan sejarahnya. */
function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function bacaPrimitif(nama: string): string {
  const full = path.join(UI_DIR, nama);
  expect(fs.existsSync(full), `${nama} hilang - pindahkan gerbangnya, jangan biarkan lulus`).toBe(true);
  return stripComments(fs.readFileSync(full, 'utf8'));
}

const BERKAS_PRIMITIF = fs
  .readdirSync(UI_DIR)
  .filter((f) => f.endsWith('.tsx'))
  .sort();

/**
 * Pengecualian sah: kotak avatar berukuran TETAP. `w-7 h-7` = 20px, dan lantai
 * keterbacaan sudah menaikkan teksnya ke 13px; `leading-none` yang membuat
 * inisialnya tetap di dalam kotak. Menggantinya dengan peran (`lens-meta`
 * menyetel line-height 1.35) justru membatalkan perbaikan itu.
 */
const PENGECUALIAN: Record<string, string> = {
  'TickerAvatar.tsx': 'kotak avatar berukuran tetap; line-height dijaga leading-none',
};

describe('tipografi primitif bersama', () => {
  it('pemindainya benar-benar membaca direktori primitif', () => {
    // Kalau daftar ini mengecil drastis, pemindainya yang rusak - bukan berarti
    // primitifnya tiba-tiba bersih.
    expect(BERKAS_PRIMITIF.length).toBeGreaterThan(20);
  });

  it('tidak ada primitif yang mengarang ukuran font', () => {
    const pelanggar: string[] = [];
    for (const nama of BERKAS_PRIMITIF) {
      if (PENGECUALIAN[nama]) continue;
      const arbitrer = bacaPrimitif(nama).match(/text-\[[0-9.]+px\]/g) ?? [];
      if (arbitrer.length > 0) pelanggar.push(`${nama}: ${arbitrer.join(', ')}`);
    }
    expect(pelanggar, `ukuran arbitrer baru di primitif bersama:\n${pelanggar.join('\n')}`).toHaveLength(0);
  });

  it('pengecualian tetap hanya berisi ukuran yang memang terkunci', () => {
    // Pengecualian yang tidak diperiksa akan menelan migrasi berikutnya.
    for (const nama of Object.keys(PENGECUALIAN)) {
      const isi = bacaPrimitif(nama);
      expect(isi, `${nama} tidak lagi memakai leading-none - pengecualiannya batal`).toContain('leading-none');
      const arbitrer = isi.match(/text-\[[0-9.]+px\]/g) ?? [];
      expect(arbitrer.length, `${nama} boleh punya tepat satu ukuran terkunci`).toBeLessThanOrEqual(1);
    }
  });

  it('jumlah ukuran arbitrer di seluruh primitif tidak bertambah', () => {
    const semua = BERKAS_PRIMITIF.reduce((n, nama) => n + (bacaPrimitif(nama).match(/text-\[[0-9.]+px\]/g)?.length ?? 0), 0);
    expect(semua, 'ukuran arbitrer bertambah di primitif bersama').toBeLessThanOrEqual(1);
  });

  it.each(['Input.tsx', 'Select.tsx', 'Textarea.tsx'])('%s memakai peran label, bukan ukuran sendiri', (nama) => {
    const isi = bacaPrimitif(nama);
    expect(isi).toContain('lens-label');
    expect(isi).not.toMatch(/text-sm font-semibold/);
  });

  it('header tabel memakai peran, bukan lens-chip di elemen struktur', () => {
    // Bug terdokumentasi: `display:inline-flex` dari .lens-chip pada tr/th/td merusak
    // lebar kolom. Header tabel harus pakai peran ukuran saja.
    const tabel = bacaPrimitif('Table.tsx');
    expect(tabel).toContain('lens-meta');
    expect(tabel).not.toContain('lens-chip');
  });

  it('lencana kanonik tetap memakai pengecualian chip', () => {
    // Badge adalah tempat `.lens-chip` memang ditujukan (12px + line-height 1).
    expect(bacaPrimitif('Badge.tsx')).toContain('lens-chip');
  });
});