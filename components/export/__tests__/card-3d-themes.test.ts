import { describe, expect, it } from 'vitest';
import { CARD_3D_THEMES, THEME_KEYS, THEME_MENU, getThemeById, type Card3DTheme } from '../card-3d-themes';
import { ACCENT_BY_THEME, PAPER, SHEET, accentOf } from '../research-paper';

// Tema kartu ekspor menyusut jadi SATU warna aksen di atas kertas terang. Dua kesalahan
// yang pernah terjadi di repo ini dan dikunci di sini:
//
//   1. tema ada di pemilih Studio tetapi tidak punya warna aksen -> laporan jatuh ke aksen
//      bawaan dan dua tema berbeda tampil identik;
//   2. aksen terlalu terang untuk kertas putih -> teks aksen hilang saat kartu dicetak
//      sebagai gambar di layar ponsel.
//
// Ambang kontras memakai WCAG 2.1 untuk teks normal (4,5:1). Ini angka minimum yang sama
// yang dipakai audit tipografi repo, bukan ambang karangan.

function kanalRelatif(nilai: number): number {
  const s = nilai / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminansi(warna: string): number {
  const bersih = warna.replace('#', '');
  const r = Number.parseInt(bersih.slice(0, 2), 16);
  const g = Number.parseInt(bersih.slice(2, 4), 16);
  const b = Number.parseInt(bersih.slice(4, 6), 16);
  return 0.2126 * kanalRelatif(r) + 0.7152 * kanalRelatif(g) + 0.0722 * kanalRelatif(b);
}

function kontras(warnaA: string, warnaB: string): number {
  const a = luminansi(warnaA);
  const b = luminansi(warnaB);
  const terang = Math.max(a, b);
  const gelap = Math.min(a, b);
  return (terang + 0.05) / (gelap + 0.05);
}

const FIELD_WAJIB: Array<keyof (typeof CARD_3D_THEMES)[string]> = [
  'id', 'name', 'sectorLabel', 'badgeLabel',
  'bgBase', 'outerBorder', 'specularLine', 'cardBorder', 'cardBg', 'glassTileBg',
  'accentText', 'accentTextSecondary', 'accentBg', 'accentBorder', 'accentGradient',
  'accentShadow', 'buttonGrad', 'orbTop', 'orbMid', 'orbBottom', 'gridDotColor',
];

describe('registri tema kartu ekspor', () => {
  it('setiap tema punya seluruh bidang terisi dan tidak ada id kembar', () => {
    const idTerlihat = new Set<string>();
    for (const key of THEME_KEYS) {
      const tema = CARD_3D_THEMES[key];
      expect(tema, `tema ${key} tidak ditemukan`).toBeTruthy();
      expect(tema.id).toBe(key);
      expect(idTerlihat.has(tema.id)).toBe(false);
      idTerlihat.add(tema.id);
      for (const bidang of FIELD_WAJIB) {
        expect(String(tema[bidang]).length, `${key}.${bidang} kosong`).toBeGreaterThan(0);
      }
    }
    expect(idTerlihat.size).toBe(THEME_KEYS.length);
  });

  it('setiap tema punya warna aksen sendiri, dan tidak ada aksen yatim', () => {
    for (const key of THEME_KEYS) {
      expect(ACCENT_BY_THEME[key], `tema ${key} tidak punya aksen`).toBeTruthy();
    }
    for (const key of Object.keys(ACCENT_BY_THEME)) {
      expect(CARD_3D_THEMES[key], `aksen ${key} tidak punya tema`).toBeTruthy();
    }
  });

  it('seluruh aksen punya kontras minimal 4,5:1 di atas kertas maupun sel', () => {
    for (const [key, aksen] of Object.entries(ACCENT_BY_THEME)) {
      expect(kontras(aksen, PAPER), `${key} di atas PAPER`).toBeGreaterThanOrEqual(4.5);
      expect(kontras(aksen, SHEET), `${key} di atas SHEET`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('pemilih tema Studio hanya memuat tema yang benar-benar ada dan tidak kembar', () => {
    const idMenu = THEME_MENU.map((t) => t.id);
    expect(new Set(idMenu).size).toBe(idMenu.length);
    for (const id of idMenu) {
      expect(CARD_3D_THEMES[id], `menu ${id} tanpa tema`).toBeTruthy();
      expect(ACCENT_BY_THEME[id], `menu ${id} tanpa aksen`).toBeTruthy();
    }
    // Setiap tema harus bisa dipilih - kalau tidak, tema itu tidak pernah dipakai.
    for (const key of THEME_KEYS) {
      expect(idMenu).toContain(key);
    }
  });

  it('menyediakan tema untuk konten berita, terminal data, dan regulator', () => {
    for (const id of ['breaking-news', 'bloomberg-amber', 'regulator-navy']) {
      expect(CARD_3D_THEMES[id], `tema ${id} belum ada`).toBeTruthy();
      expect(THEME_MENU.map((t) => t.id)).toContain(id);
    }
  });
});
describe('tema sampai ke kartu', () => {
  // Ketiga kartu ekspor memakai `accentOf(activeTheme)` untuk seluruh garis, batang, dan
  // label aksen. Kalau sebuah tema tidak punya aksen, `accentOf` diam-diam mengembalikan
  // aksen bawaan - tema itu tercetak tetapi tidak terlihat, dan itu jenis kegagalan yang
  // tidak bisa dilihat dari daftar tema.

  it('accentOf menyalurkan aksen tema yang benar untuk setiap tema', () => {
    for (const key of THEME_KEYS) {
      expect(accentOf(getThemeById(key)), `tema ${key}`).toBe(ACCENT_BY_THEME[key]);
    }
    // Rantai cadangan dikunci di sini supaya penambahan tema baru tidak diam-diam mengubah
    // tema cadangan: id tidak dikenal -> tema obsidian-cyber; tema tanpa aksen -> aksen
    // dokumen bawaan.
    expect(getThemeById('tema-yang-tidak-ada').id).toBe('obsidian-cyber');
    expect(accentOf({ id: 'tema-tanpa-aksen' } as Card3DTheme)).toBe('#1B3A6B');
  });

  it('tema konten baru tidak jatuh ke aksen bawaan dan berbeda satu sama lain', () => {
    const bawaan = '#1B3A6B';
    const aksen = ['bloomberg-amber', 'breaking-news', 'regulator-navy'].map((id) => accentOf(getThemeById(id)));
    expect(new Set(aksen).size).toBe(aksen.length);
    for (const [i, warna] of aksen.entries()) {
      expect(warna, `aksen ke-${i}`).not.toBe(bawaan);
    }
  });
});
