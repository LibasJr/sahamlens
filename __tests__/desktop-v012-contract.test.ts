import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const main = read('desktop/src/main.tsx');
const navigation = read('desktop/src/components/AppNavigation.tsx');
const watchlist = read('desktop/src/components/Watchlist.tsx');
const intelligence = read('desktop/src/components/OperationsWorkspace.tsx');
const lensAI = read('desktop/src/components/LensAIDrawer.tsx');
const header = read('desktop/src/components/GlobalHeader.tsx');
const rust = read('desktop/src-tauri/src/lib.rs');

 describe('Desktop v0.1.2 contract', () => {
  it('menjaga metadata versi desktop selaras', () => {
    expect(JSON.parse(read('desktop/package.json')).version).toBe('0.1.2');
    expect(JSON.parse(read('desktop/src-tauri/tauri.conf.json')).version).toBe('0.1.2');
    expect(read('desktop/src-tauri/Cargo.toml')).toContain('version = "0.1.2"');
  });

  it('memakai struktur navigasi tunggal tanpa menu Radar, Signal, Breadth, atau Watchlist ganda', () => {
    expect(navigation).toContain("{ id: 'market', label: 'Pasar Hari Ini'");
    expect(navigation).toContain("{ id: 'intelligence', label: 'Market Intelligence'");
    expect(navigation).not.toMatch(/label: '(Radar|Signal|Market Breadth|Watchlist)'/);
    expect(navigation).toContain("{ id: 'admin', label: 'Admin Panel'");
    expect(navigation).toContain('nav-bottom');
  });

  it('menjaga Daftar Pantau manual dan rekomendasi sistem terpisah', () => {
    expect(watchlist).toContain('Cari kode atau nama emiten');
    expect(watchlist).toContain('REKOMENDASI UNTUK DIPANTAU');
    expect(watchlist).toContain('Batal hapus');
    expect(watchlist).toContain('Belum ada emiten di Daftar Pantau');
    expect(main).toContain('removeDesktopWatchlist(symbol)');
    expect(main).not.toContain('setWatchlist(rows); setRecommendations(rows)');
  });

  it('menempatkan Radar, Signal, Breadth, dan insight sebagai tab Market Intelligence', () => {
    for (const label of ['Breadth', 'Radar', 'Signal', 'Insight Pasar']) expect(intelligence).toContain(label);
  });

  it('menyediakan Lens AI kontekstual berbasis API nyata dan fail closed', () => {
    expect(lensAI).toContain('getAIInsights(symbol)');
    expect(lensAI).toContain('getFundamentalSnapshot(symbol)');
    expect(lensAI).toContain('Data Lens AI tidak tersedia');
    expect(lensAI).toContain('SahamLens adalah alat riset');
    expect(lensAI).toContain('Consensus Agent');
    expect(main).toContain('<LensAIDrawer');
  });

  it('memakai ikon koneksi bertooltip, bukan teks API Terhubung', () => {
    expect(header).not.toContain('API Terhubung');
    expect(header).toContain('Sumber: sahamlens.id');
    expect(header).toContain('Pemeriksaan:');
  });

  it('menyimpan state posisi dan ukuran jendela secara native', () => {
    expect(rust).toContain('tauri_plugin_window_state::Builder::default().build()');
    expect(read('desktop/src-tauri/Cargo.toml')).toContain('tauri-plugin-window-state');
  });

  it('memakai Research Tools hanya untuk alat unik dan menyediakan submenu riset', () => {
    expect(main).toContain("const researchTabs = ['analysis', 'consensus', 'bandarmology', 'tools']");
    expect(main).toContain("const toolTabs = ['compare', 'checklist', 'position-sizing', 'dividend', 'risk']");
  });

  it('mencantumkan seluruh modul admin web dan mempertahankan pengecekan role', () => {
    expect(navigation).toContain("isAdmin && item({ id: 'admin'");
    expect(intelligence.match(/'\/admin\//g)?.length ?? 0).toBeGreaterThan(10);
    expect(intelligence).toContain('validasi role, konfirmasi perubahan, dan audit tetap satu dengan web');
  });
});
