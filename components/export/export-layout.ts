/**
 * Tata letak ekspor gambar Studio.
 *
 * Kartu riset dirender pada lebar tetap 1080 px dan tingginya mengikuti isi. Untuk
 * diunggah ke TikTok/Reels kartu tidak boleh dipotong dan tidak boleh tertutup antarmuka
 * aplikasi (caption, nama akun, deretan tombol di bawah). Karena itu ekspor tidak lagi
 * menyerahkan ukuran ke kartu: ukuran kanvas ditentukan preset, dan kartu diletakkan di
 * dalam area aman preset itu. Bila kartu lebih tinggi daripada area aman, kartu diperkecil
 * (scale < 1) - tidak pernah dipotong.
 *
 * Fungsi di berkas ini murni: tidak menyentuh DOM, tidak mengambil data, tidak memakai
 * waktu kecuali bila pemanggil memberi tanggal. Jadi bisa diuji tanpa peramban.
 */

export type ExportPresetId = 'tiktok_9x16' | 'feed_4x5' | 'square_1x1';

export interface ExportPreset {
  id: ExportPresetId;
  label: string;
  note: string;
  canvasWidth: number;
  canvasHeight: number;
  /** Tinggi area atas yang tertutup antarmuka aplikasi (nama akun, tombol). */
  safeTop: number;
  /** Tinggi area bawah yang tertutup antarmuka aplikasi (caption, deretan tombol). */
  safeBottom: number;
}

export const EXPORT_PRESETS: Record<ExportPresetId, ExportPreset> = {
  tiktok_9x16: {
    id: 'tiktok_9x16',
    label: 'TikTok 9:16',
    note: 'Penuh layar, aman dari caption & tombol',
    canvasWidth: 1080,
    canvasHeight: 1920,
    safeTop: 150,
    safeBottom: 320,
  },
  feed_4x5: {
    id: 'feed_4x5',
    label: 'Feed 4:5',
    note: 'Rasio unggahan feed',
    canvasWidth: 1080,
    canvasHeight: 1350,
    safeTop: 40,
    safeBottom: 40,
  },
  square_1x1: {
    id: 'square_1x1',
    label: 'Persegi 1:1',
    note: 'Untuk balasan pesan/komentar',
    canvasWidth: 1080,
    canvasHeight: 1080,
    safeTop: 30,
    safeBottom: 30,
  },
};

export const EXPORT_PRESET_IDS = Object.keys(EXPORT_PRESETS) as ExportPresetId[];

export interface ExportLayout {
  canvasWidth: number;
  canvasHeight: number;
  /** Faktor pengecilan kartu; selalu <= 1 supaya tidak ada pembesaran yang mengaburkan teks. */
  scale: number;
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
  safeTop: number;
  safeBottom: number;
}

/**
 * Menghitung posisi kartu di dalam kanvas preset.
 *
 * @param cardWidth  lebar kartu yang dirender (px), biasanya 1080
 * @param cardHeight tinggi kartu yang dirender (px), mengikuti isi kartu
 * @param preset     preset ukuran tujuan
 * @param marginX    jarak kiri/kanan kartu dari tepi kanvas (px)
 */
export function planExportLayout(
  cardWidth: number,
  cardHeight: number,
  preset: ExportPreset,
  // Tanpa marjin horizontal: kartu selebar kanvas memang diinginkan (tanpa bingkai kosong
  // di kiri-kanan). Yang perlu diamankan hanya sisi atas dan bawah, karena di sanalah
  // antarmuka aplikasi menutupi gambar.
  marginX = 0,
): ExportLayout {
  if (!Number.isFinite(cardWidth) || !Number.isFinite(cardHeight) || cardWidth <= 0 || cardHeight <= 0) {
    throw new Error('Ukuran kartu tidak valid');
  }
  if (!Number.isFinite(marginX) || marginX < 0) {
    throw new Error('Marjin horizontal tidak valid');
  }
  const availableWidth = preset.canvasWidth - marginX * 2;
  const availableHeight = preset.canvasHeight - preset.safeTop - preset.safeBottom;
  if (availableWidth <= 0 || availableHeight <= 0) {
    throw new Error('Area aman preset tidak menyisakan ruang');
  }

  const scale = Math.min(1, availableWidth / cardWidth, availableHeight / cardHeight);
  const drawWidth = cardWidth * scale;
  const drawHeight = cardHeight * scale;

  return {
    canvasWidth: preset.canvasWidth,
    canvasHeight: preset.canvasHeight,
    scale,
    drawX: (preset.canvasWidth - drawWidth) / 2,
    drawY: preset.safeTop + (availableHeight - drawHeight) / 2,
    drawWidth,
    drawHeight,
    safeTop: preset.safeTop,
    safeBottom: preset.safeBottom,
  };
}

/** Nama berkas ekspor: SahamLens-<jenis>-<ticker>-<tanggal>-<preset>.png */
export function exportFileName(
  documentLabel: string,
  ticker: string,
  preset: ExportPreset,
  when: Date = new Date(),
): string {
  const bersih = (teks: string) => teks.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const tanggal = [
    when.getFullYear(),
    String(when.getMonth() + 1).padStart(2, '0'),
    String(when.getDate()).padStart(2, '0'),
  ].join('-');
  return `SahamLens-${bersih(documentLabel)}-${bersih(ticker.toUpperCase())}-${tanggal}-${preset.id}.png`;
}