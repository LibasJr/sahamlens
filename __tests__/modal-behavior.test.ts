import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SEMUA DIALOG MEMAKAI SATU PERILAKU YANG SAMA - dijaga tes, bukan disiplin.
 *
 * Blok Escape + focus trap yang identik pernah hidup sebagai LIMA salinan verbatim
 * (PaywallModal, PromoUpgradeModal, StockNewsModal, UserProfileModal, CommandPalette),
 * sampai ke pilihan selektor dan `setTimeout(..., 30)`-nya. Salinan itu tidak salah -
 * masalahnya, dua kekurangan yang sama hilang di KELIMA-limanya sekaligus (kunci gulir
 * latar dan pengembalian fokus), dan dialog keenam (konfirmasi insert di admin) bahkan
 * tidak menyalin apa pun sehingga tidak punya jalan keluar Escape sama sekali. Itulah
 * bentuk kegagalan yang ditimbulkan duplikasi: bukan satu salinan yang rusak, tapi
 * perbaikan yang harus ditemukan ulang enam kali dan tidak pernah ditemukan.
 *
 * Tes ini memeriksa dua hal yang bisa diperiksa tanpa DOM - repo ini sengaja tidak
 * memasang jsdom/testing-library, dan menambahkannya demi satu hook bukan pertukaran
 * yang sepadan:
 *
 *   1. Setiap komponen yang menjanjikan `aria-modal="true"` benar-benar memasang
 *      useModalBehavior. Janji itu memberi tahu pembaca layar bahwa isi di luar dialog
 *      tidak ada; hook inilah yang menepatinya.
 *   2. Tidak ada berkas yang menumbuhkan kembali focus trap-nya sendiri.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components'];
const HOOK_PATH = path.join('lib', 'hooks', 'useModalBehavior.ts');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...walk(full));
    } else if (entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

const files = SCAN_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)))
  .map((file) => ({ rel: path.relative(ROOT, file).replaceAll('\\', '/'), text: fs.readFileSync(file, 'utf8') }));

describe('perilaku dialog', () => {
  const dialogs = files.filter((f) => f.text.includes('aria-modal="true"'));

  it('ada dialog yang terpindai (penjaga ini tidak boleh lolos karena kosong)', () => {
    // Tanpa baris ini, selektor yang salah ketik membuat seluruh tes di bawah lulus
    // dengan memeriksa nol berkas.
    expect(dialogs.length).toBeGreaterThanOrEqual(6);
  });

  it.each(dialogs.map((f) => f.rel))('%s memasang useModalBehavior', (rel) => {
    const file = dialogs.find((f) => f.rel === rel)!;
    expect(file.text, `${rel} memakai aria-modal tapi tidak memasang hook-nya`).toContain('useModalBehavior');
  });

  it('tidak ada focus trap yang ditulis ulang di luar hook', () => {
    const offenders = files
      .filter((f) => f.text.includes("e.key !== 'Tab'"))
      .map((f) => f.rel);
    expect(
      offenders,
      'focus trap hanya boleh hidup di lib/hooks/useModalBehavior.ts',
    ).toEqual([]);
  });

  it('hook mengurus kunci gulir dan pengembalian fokus, bukan cuma trap', () => {
    const hook = fs.readFileSync(path.join(ROOT, HOOK_PATH), 'utf8');
    // Ketiganya adalah alasan hook ini ada; kehilangan salah satunya mengembalikan
    // keadaan sebelum ekstraksi tanpa satu pun berkas lain ikut berubah.
    expect(hook, 'kunci gulir latar').toContain("document.body.style.overflow = 'hidden'");
    expect(hook, 'kompensasi lebar scrollbar').toContain('paddingRight');
    expect(hook, 'pengembalian fokus setelah tutup').toContain('previouslyFocused');
    expect(hook, 'Escape sebagai jalan keluar').toContain("e.key === 'Escape'");
  });
});
