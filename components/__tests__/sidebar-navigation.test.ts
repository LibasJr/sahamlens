import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, isPathActive, type NavItem } from '../Sidebar';

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
