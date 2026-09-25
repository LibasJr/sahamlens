import { describe, expect, it } from 'vitest';
import {
  EXPORT_PRESETS,
  EXPORT_PRESET_IDS,
  exportFileName,
  planExportLayout,
  type ExportPreset,
} from '../export-layout';

// Kartu riset diekspor sebagai GAMBAR dan diunggah apa adanya. Yang dikunci di sini:
// kartu tidak boleh dipotong, tidak boleh melebar melewati kanvas, tidak boleh masuk ke
// area yang tertutup antarmuka aplikasi (caption / nama akun / deretan tombol), dan tidak
// boleh diperbesar sampai teksnya kabur. Ukuran kartu memakai tinggi kartu Studio yang
// sebenarnya (1080 x ~1420) dan tinggi kartu panjang (1080 x 2600) supaya jalur pengecilan
// ikut teruji.

const KARTU_NORMAL = { width: 1080, height: 1420 };
const KARTU_PANJANG = { width: 1080, height: 2600 };

describe('planExportLayout', () => {
  it('menyediakan preset TikTok 9:16, feed 4:5, dan persegi 1:1', () => {
    expect(EXPORT_PRESET_IDS).toEqual(['tiktok_9x16', 'feed_4x5', 'square_1x1']);
    expect(EXPORT_PRESETS.tiktok_9x16.canvasHeight / EXPORT_PRESETS.tiktok_9x16.canvasWidth).toBeCloseTo(16 / 9, 3);
    expect(EXPORT_PRESETS.feed_4x5.canvasHeight / EXPORT_PRESETS.feed_4x5.canvasWidth).toBeCloseTo(5 / 4, 3);
    expect(EXPORT_PRESETS.square_1x1.canvasHeight).toBe(EXPORT_PRESETS.square_1x1.canvasWidth);
  });

  it.each(EXPORT_PRESET_IDS)('%s: kanvas tetap 1080 lebar dan kartu tidak terpotong', (id) => {
    const preset = EXPORT_PRESETS[id];
    const tata = planExportLayout(KARTU_NORMAL.width, KARTU_NORMAL.height, preset);

    expect(tata.canvasWidth).toBe(preset.canvasWidth);
    expect(tata.canvasHeight).toBe(preset.canvasHeight);
    // Kartu selalu masuk utuh: lebar dan tingginya tidak melebihi area gambarnya.
    expect(tata.drawWidth).toBeLessThanOrEqual(preset.canvasWidth + 1e-9);
    expect(tata.drawHeight).toBeLessThanOrEqual(
      preset.canvasHeight - preset.safeTop - preset.safeBottom + 1e-9,
    );
    // Tidak ada pembesaran: teks yang sudah dirender 1080 px tidak dikaburkan.
    expect(tata.scale).toBeLessThanOrEqual(1);
    // Seluruh kartu berada di dalam kanvas.
    expect(tata.drawX).toBeGreaterThanOrEqual(0);
    expect(tata.drawY).toBeGreaterThanOrEqual(preset.safeTop - 1e-9);
    expect(tata.drawX + tata.drawWidth).toBeLessThanOrEqual(preset.canvasWidth + 1e-9);
    expect(tata.drawY + tata.drawHeight).toBeLessThanOrEqual(
      preset.canvasHeight - preset.safeBottom + 1e-9,
    );
  });

  it('9:16 mengecilkan kartu panjang alih-alih memotongnya atau menabrak area aman', () => {
    const preset = EXPORT_PRESETS.tiktok_9x16;
    const tata = planExportLayout(KARTU_PANJANG.width, KARTU_PANJANG.height, preset);
    const areaAman = preset.canvasHeight - preset.safeTop - preset.safeBottom;

    expect(tata.scale).toBeLessThan(1);
    expect(tata.drawHeight).toBeLessThanOrEqual(areaAman + 1e-9);
    expect(tata.drawHeight / tata.drawWidth).toBeCloseTo(KARTU_PANJANG.height / KARTU_PANJANG.width, 6);
    // Kartu panjang tetap diletakkan di dalam area aman, bukan di tepi kanvas.
    expect(tata.drawY).toBeGreaterThanOrEqual(preset.safeTop - 1e-9);
    expect(tata.drawY + tata.drawHeight).toBeLessThanOrEqual(preset.canvasHeight - preset.safeBottom + 1e-9);
  });

  it('4:5 dan 1:1 membiarkan kartu pada ukuran aslinya selama masih muat', () => {
    const muat = [
      { id: 'feed_4x5' as const, tinggi: 1200 },
      { id: 'square_1x1' as const, tinggi: 1000 },
    ];
    for (const { id, tinggi } of muat) {
      const preset = EXPORT_PRESETS[id];
      const tata = planExportLayout(KARTU_NORMAL.width, tinggi, preset);
      expect(tata.scale, `${id} seharusnya tidak diperkecil`).toBe(1);
      expect(tata.drawWidth).toBe(KARTU_NORMAL.width);
      expect(tata.drawY + tata.drawHeight).toBeLessThanOrEqual(preset.canvasHeight - preset.safeBottom + 1e-9);
    }
  });

  it('menempatkan kartu di tengah secara horizontal', () => {
    const preset = EXPORT_PRESETS.tiktok_9x16;
    const tata = planExportLayout(800, 1200, preset);
    expect(tata.drawX).toBeCloseTo((preset.canvasWidth - tata.drawWidth) / 2, 9);
  });

  it('menolak ukuran kartu dan preset yang tidak masuk akal', () => {
    expect(() => planExportLayout(0, 100, EXPORT_PRESETS.tiktok_9x16)).toThrow();
    expect(() => planExportLayout(1080, Number.NaN, EXPORT_PRESETS.tiktok_9x16)).toThrow();
    expect(() => planExportLayout(1080, 1420, EXPORT_PRESETS.tiktok_9x16, -1)).toThrow();
    const presetRusak: ExportPreset = { ...EXPORT_PRESETS.square_1x1, safeTop: 600, safeBottom: 600 };
    expect(() => planExportLayout(1080, 1420, presetRusak)).toThrow();
  });
});

describe('exportFileName', () => {
  it('memuat jenis kartu, ticker, tanggal, dan preset', () => {
    const nama = exportFileName('Investment-Snapshot-360', 'bbca', EXPORT_PRESETS.tiktok_9x16, new Date('2026-09-25T09:00:00Z'));
    expect(nama).toBe('SahamLens-Investment-Snapshot-360-BBCA-2026-09-25-tiktok_9x16.png');
  });

  it('membersihkan karakter yang tidak sah di nama berkas', () => {
    const nama = exportFileName('Technical/Research: Catatan', 'TLKM', EXPORT_PRESETS.feed_4x5, new Date('2026-01-02T00:00:00Z'));
    expect(nama).toBe('SahamLens-Technical-Research-Catatan-TLKM-2026-01-02-feed_4x5.png');
    expect(nama).not.toMatch(/[\\/:*?"<>|]/);
  });
});