import { describe, expect, it } from 'vitest';
import { LENS_SCORE_WEIGHTS, LENS_SCORE_TOTAL_WEIGHT } from '../lens-score-weights';

// Panel admin /admin/calibration menyuruh admin mengubah LENS_SCORE_WEIGHTS lalu menjalankan
// `npm test`. Test inilah yang dijanjikan langkah tersebut - tanpanya, instruksi di layar
// menyuruh orang memverifikasi memakai sesuatu yang tidak ada.
describe('LENS_SCORE_WEIGHTS', () => {
  it('berjumlah tepat 100 - skor akhir memakai jumlah ini sebagai penyebut', () => {
    expect(LENS_SCORE_TOTAL_WEIGHT).toBe(100);
  });

  it('LENS_SCORE_TOTAL_WEIGHT benar-benar dihitung, bukan angka 100 yang ditulis ulang', () => {
    const manual = LENS_SCORE_WEIGHTS.technical + LENS_SCORE_WEIGHTS.fundamental + LENS_SCORE_WEIGHTS.flow;
    expect(LENS_SCORE_TOTAL_WEIGHT).toBe(manual);
  });

  it('tiap komponen positif - bobot 0 berarti komponennya mati diam-diam', () => {
    expect(LENS_SCORE_WEIGHTS.technical).toBeGreaterThan(0);
    expect(LENS_SCORE_WEIGHTS.fundamental).toBeGreaterThan(0);
    expect(LENS_SCORE_WEIGHTS.flow).toBeGreaterThan(0);
  });
});
