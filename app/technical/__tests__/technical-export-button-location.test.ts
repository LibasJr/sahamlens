import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Menguji perubahan pada app/technical/[symbol]/page.tsx untuk task ini:
 *   1. Tombol `Export Kartu Teknikal` DIPINDAHKAN ke blok atas "Ringkasan cepat {symbol}"
 *      (kanan atas dekat badge "Skor & alasan bisa diaudit").
 *   2. Lokasi lama di header "Konsensus Teknikal" DIHAPUS - tepat satu tombol.
 *   3. Tidak ada fixed-height / crop / line-clamp / slice(0, 10) untuk data material
 *      di TechnicalExportCard / TechnicalExportSection.
 */

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = 'app/technical/[symbol]/page.tsx';
const EXPORT_CARD = 'components/export/TechnicalExportCard.tsx';

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function baca(file: string): string {
  const full = path.join(ROOT, file);
  expect(fs.existsSync(full), `${file} hilang - pindahtkan gerbangnya, jangan biarkan lulus`).toBe(true);
  return stripComments(fs.readFileSync(full, 'utf8'));
}

describe('pemindahan tombol Export Teknikal ke blok atas', () => {
  const pageSource = baca(PAGE);

  it('membuktikan TechnicalExportSection dipanggil di blok "Ringkasan cepat"', () => {
    // Cari blok "Ringkasan cepat"
    const ringkasanIdx = pageSource.indexOf('Ringkasan cepat');
    expect(ringkasanIdx).toBeGreaterThan(-1);

    // Di dalam blok section ringkasan, harus ada <TechnicalExportSection
    const afterRingkasan = pageSource.slice(ringkasanIdx);
    const exportSectionIdx = afterRingkasan.indexOf('<TechnicalExportSection');
    expect(exportSectionIdx).toBeGreaterThan(-1);

    // Pastikan <TechnicalExportSection muncul di area ringkasan.
    // Pakai marker JSX (kelas CSS), BUKAN teks di dalam komentar JSX yang
    // hilang setelah stripComments (lihat catatan CLAUDE.md tentang komentar).
    // Kelas "lens-page-title" ada di blok header utama (baris 795), yang
    // letaknya jauh di bawah Ringkasan cepat — jadi batas atas yang aman.
    const pageTitleIdx = afterRingkasan.indexOf('lens-page-title');
    expect(pageTitleIdx).toBeGreaterThan(-1);
    expect(exportSectionIdx).toBeLessThan(pageTitleIdx);
  });

  it('membuktikan TechnicalExportSection TIDAK dipanggil di header "Konsensus Teknikal"', () => {
    // Cari header "Konsensus Teknikal" (bukan string "Konsensus Teknikal · {total} analyzer")
    // lalu pastikan TIDAK ada <TechnicalExportSection di area konsensus
    const konsensusHeaderMatch = pageSource.match(/Konsensus Teknikal\s*·\s*\{total\}/);
    expect(konsensusHeaderMatch).not.toBeNull();
    const konsensusIdx = konsensusHeaderMatch!.index!;

    // Cari <TechnicalExportSection (JSX, bukan import) SETELAH header konsensus
    const afterKonsensus = pageSource.slice(konsensusIdx);
    const exportIdx = afterKonsensus.indexOf('<TechnicalExportSection');

    // TIDAK boleh ada <TechnicalExportSection di area konsensus
    expect(exportIdx).toBeLessThan(0);
  });

  it('membuktikan TEPAT SATU <TechnicalExportSection di halaman', () => {
    // Hanya JSX call (abaikan import statement)
    const matches = pageSource.match(/<TechnicalExportSection/g) ?? [];
    // Tepat satu pemanggilan
    expect(matches.length).toBe(1);
  });

  it('membuktikan TechnicalExportSection menerima prop extended (full report)', () => {
    // Cari <TechnicalExportSection (JSX, bukan import)
    const idx = pageSource.indexOf('<TechnicalExportSection');
    expect(idx).toBeGreaterThan(-1);

    // Ambil 3000 karakter setelahnya (JSX call cukup panjang dengan agents map)
    const after = pageSource.slice(idx, idx + 3000);

    // Harus ada prop extended yang menandakan laporan penuh
    expect(after).toContain('coveragePct');
    expect(after).toContain('researchLabel');
    expect(after).toContain('dimensions');
    expect(after).toContain('subScores');
    expect(after).toContain('ringkasan');
  });
});

describe('penghapusan fixed-height / crop / slice dari kartu ekspor teknikal', () => {
  const cardSource = baca(EXPORT_CARD);

  it('TIDAK ada fixed height (h-[..px]) di TechnicalExportCard', () => {
    expect(cardSource).not.toMatch(/h-\[?\d+px/);
    expect(cardSource).not.toContain('h-[1350px]');
  });

  it('TIDAK ada line-clamp yang memotong ringkasan/temuan', () => {
    expect(cardSource).not.toContain('line-clamp');
  });

  it('TIDAK ada .slice(0, 10) atau slice(0, N) yang membatasi analyzer', () => {
    expect(cardSource).not.toMatch(/\.slice\s*\(\s*0\s*,\s*\d+\s*\)/);
  });

  it('TIDAK ada overflow-hidden yang memotong konten utama', () => {
    // overflow-hidden di progress bar (h-4 rounded-full) BUKAN pemotong konten utama - itu wajar
    // yang dicek adalah tidak ada overflow-hidden di kontainer kartu utama
    const mainContainerMatch = cardSource.match(/className="lens-export-dark[^"]*"/)?.[0] ?? '';
    expect(mainContainerMatch).not.toContain('overflow-hidden');
    
    // Pastikan tidak ad div wrapper yang memotong isi
    expect(cardSource).not.toMatch(/className="[^"]*overflow-hidden[^"]*flex flex-col gap-8/);
  });

  it('TIDAK ada max-height yang memotong data material', () => {
    expect(cardSource).not.toMatch(/max-h-\[?\d+px/);
  });
});

describe('page.tsx passing prop extended ke export', () => {
  const pageSource = baca(PAGE);

  it('meneruskan describeUserResearchLabel / describeUserConfidenceLabel / advisoryStatus', () => {
    // Pastikan helper dipanggil dan hasilnya diteruskan
    expect(pageSource).toContain('describeUserResearchLabel');
    expect(pageSource).toContain('describeUserConfidenceLabel');
    expect(pageSource).toContain('advisoryStatus');
  });

  it('meneruskan dataTimestamp, provider, dan kesegaran', () => {
    // Ambil area sekitar <TechnicalExportSection (JSX)
    const idx = pageSource.indexOf('<TechnicalExportSection');
    const after = pageSource.slice(idx, idx + 3000);

    expect(after).toContain('dataTimestamp');
    expect(after).toContain('provider');
    expect(after).toContain('kesegaran');
  });

  it('meneruskan subSkor dan dimensi penuh', () => {
    const idx = pageSource.indexOf('<TechnicalExportSection');
    const after = pageSource.slice(idx, idx + 3000);

    // Cari prop assignment spesifik (bukan sekadar nama variabel)
    expect(after).toContain('subScores={subSkor}');
    expect(after).toContain('dimensions={dimensi.map');
    expect(after).toContain('ringkasan={ringkasan}');
  });
});
