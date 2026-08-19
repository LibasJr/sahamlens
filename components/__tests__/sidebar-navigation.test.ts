import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, balikGrup, grupTerbuka, kelasIsiGrup, isPathActive, type NavItem } from '../Sidebar';

/**
 * Arsitektur navigasi adalah salah satu syarat selesai redesign v2 (PRD §7). Ia gampang
 * rusak diam-diam: menambah satu kemampuan berarti menambah satu baris di daftar, dan
 * tidak ada yang memaksa baris itu masuk kelompok yang benar - atau memaksa kelompoknya
 * tetap ada sama sekali.
 */

const semuaItem = NAV_GROUPS.flatMap((group) => group.items);

describe('kelompok navigasi', () => {
  it('tepat empat kelompok, dengan urutan Utama / Riset / Tools / Intelligence', () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(['Utama', 'Riset', 'Tools', 'Intelligence']);
  });

  it('tidak ada kemampuan yang hilang dari navigasi', () => {
    // Tujuannya menurunkan perceived complexity, BUKAN memotong kemampuan. Kalau angka
    // ini turun, seseorang menyembunyikan fitur alih-alih mengelompokkannya.
    expect(semuaItem.length).toBeGreaterThanOrEqual(22);
  });

  it('id item unik - id ganda membuat React memakai key yang sama untuk dua baris', () => {
    const ids = semuaItem.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('LensAI berada di kelompok Intelligence', () => {
    const intelligence = NAV_GROUPS.find((group) => group.label === 'Intelligence');
    expect(intelligence?.items.map((item) => item.id)).toContain('lensai');
  });
});

describe('item beraksi (panel, bukan halaman)', () => {
  const actionItems = semuaItem.filter((item) => item.action);

  it('ada minimal satu - LensAI', () => {
    expect(actionItems.map((item) => item.id)).toContain('lensai');
  });

  it('tidak punya rute, jadi tidak boleh dianggap aktif di halaman mana pun', () => {
    // JEBAKANNYA: `path` mereka string kosong, dan `pathname.startsWith('')` bernilai
    // benar untuk SETIAP halaman. Tanpa penjaga di isPathActive, LensAI akan tampil
    // aktif di seluruh aplikasi sekaligus dan grupnya terbuka paksa tiap navigasi.
    for (const item of actionItems) {
      for (const pathname of ['/', '/screener', '/technical/BBCA.JK', '/fundamental']) {
        expect(isPathActive(pathname, item), `${item.id} @ ${pathname}`).toBe(false);
      }
    }
  });
});

describe('penanda aktif untuk item bertautan', () => {
  const beranda = semuaItem.find((item) => item.id === 'home') as NavItem;
  const technical = semuaItem.find((item) => item.id === 'dashboard') as NavItem;

  it('Beranda hanya aktif di "/" - bukan di setiap halaman', () => {
    expect(isPathActive('/', beranda)).toBe(true);
    expect(isPathActive('/screener', beranda)).toBe(false);
  });

  it('rute bersarang menyalakan induknya', () => {
    expect(isPathActive('/dashboard', technical)).toBe(true);
    expect(isPathActive('/dashboard/detail', technical)).toBe(true);
    // Tapi bukan rute yang kebetulan berawalan sama.
    expect(isPathActive('/dashboards', technical)).toBe(false);
  });
});

/**
 * Kepala grup bisa diklik untuk menutup dan membuka isinya. Tiga cacat yang saling
 * menutupi membuatnya tidak berfungsi sama sekali, dan semuanya senyap - chevron tetap
 * berputar, jadi tombolnya tampak hidup padahal isinya tidak berubah.
 */
describe('buka-tutup kelompok navigasi', () => {
  it('nilai awal: Utama & Riset terbuka, sisanya tertutup', () => {
    expect(grupTerbuka('overview', {})).toBe(true);
    expect(grupTerbuka('research', {})).toBe(true);
    expect(grupTerbuka('tools', {})).toBe(false);
    expect(grupTerbuka('intelligence', {})).toBe(false);
  });

  it('sekali klik menutup grup yang default-nya terbuka', () => {
    // Cacat lama: toggle memakai `!pilihan[id]`, dan untuk grup ini nilainya masih
    // undefined - `!undefined` = true, jadi klik pertama menyetelnya terbuka lagi.
    const sesudah = balikGrup('overview', {});
    expect(sesudah.overview).toBe(false);
    expect(grupTerbuka('overview', sesudah)).toBe(false);
  });

  it('klik kedua mengembalikannya seperti semula', () => {
    const tutup = balikGrup('overview', {});
    const buka = balikGrup('overview', tutup);
    expect(grupTerbuka('overview', buka)).toBe(true);
  });

  it('grup yang memuat halaman aktif TETAP bisa ditutup', () => {
    // Cacat lama: `groupHasActiveItem` di-OR ke keadaan terbuka, sehingga justru grup
    // yang sedang dipakai - yang paling sering ingin ditutup - tidak pernah bisa ditutup.
    // Keaktifan halaman tidak lagi menjadi masukan fungsi ini sama sekali.
    expect(grupTerbuka('overview', { overview: false })).toBe(false);
  });

  it('mode rail menampilkan isi grup lewat CSS, bukan dengan memaksa keadaan terbuka', () => {
    // Di rail kepala grup tidak dirender, jadi grup tertutup harus tetap tampil sebagai
    // ikon - kalau tidak, ia mustahil dibuka lagi. Tapi keadaan pilihan pengguna TIDAK
    // ikut diubah, supaya HP tidak ikut terkunci (lihat kasus di bawah).
    expect(grupTerbuka('tools', { tools: false })).toBe(false);
    expect(kelasIsiGrup(false, true)).toBe('hidden md:block');
  });

  it('sidebar ciut yang tersimpan dari desktop TIDAK mengunci grup di ponsel', () => {
    // Cacat lama: isCollapsed dibaca sebagai boolean mentah di JS, padahal seluruh
    // pemakaian visualnya digandeng `md:`. Di HP drawer selalu lebar penuh, tapi setiap
    // grup ikut dipaksa terbuka - tombol tutup mati total di ponsel.
    //
    // Penjaganya sekarang di CSS pada breakpoint yang sama: `hidden` berlaku di ponsel,
    // `md:block` hanya menghidupkannya kembali di lebar tempat rail benar-benar ada.
    expect(kelasIsiGrup(false, true).startsWith('hidden')).toBe(true);
    expect(kelasIsiGrup(true, true)).toBe('');
    expect(kelasIsiGrup(false, false)).toBe('hidden');
  });
});

describe('Intelligence - grup terakhir, tidak diperlakukan berbeda', () => {
  /** Tiruan useEffect pembuka otomatis di Sidebar: hanya berlaku kalau grupnya belum
   *  pernah disentuh pengguna. */
  const bukaOtomatis = (id: string, pilihan: Record<string, boolean>) =>
    id in pilihan ? pilihan : { ...pilihan, [id]: true };

  it('tertutup di awal, lalu klik membuka dan klik lagi menutup', () => {
    let s: Record<string, boolean> = {};
    expect(grupTerbuka('intelligence', s)).toBe(false);

    s = balikGrup('intelligence', s);
    expect(grupTerbuka('intelligence', s)).toBe(true);

    s = balikGrup('intelligence', s);
    expect(grupTerbuka('intelligence', s)).toBe(false);
  });

  it('saat berada di halaman DI DALAM Intelligence, tetap bisa ditutup dan tidak menganga lagi', () => {
    // Buka /news -> pembuka otomatis menyalakannya karena belum pernah disentuh.
    let s = bukaOtomatis('intelligence', {});
    expect(grupTerbuka('intelligence', s)).toBe(true);

    // Pengguna menutupnya.
    s = balikGrup('intelligence', s);
    expect(grupTerbuka('intelligence', s)).toBe(false);

    // Lalu pindah ke /calendar - masih di grup yang sama. Versi lama membuka paksa lagi
    // di sini; sekarang pilihan pengguna bertahan.
    s = bukaOtomatis('intelligence', s);
    expect(grupTerbuka('intelligence', s)).toBe(false);
  });

  it('perlakuannya identik dengan Tools - keduanya tertutup di awal', () => {
    expect(grupTerbuka('intelligence', {})).toBe(grupTerbuka('tools', {}));
    expect(balikGrup('intelligence', {}).intelligence).toBe(balikGrup('tools', {}).tools);
  });
});
