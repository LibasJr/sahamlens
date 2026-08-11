import { describe, expect, it } from 'vitest';
import { isPeakCycleSignature, peakCycleSeverity, resolveSectorProfile } from '../sector-classifier.service';

/**
 * Fase 4 #16: penjaga puncak siklus tidak lagi tebing biner.
 *
 * Sampai perbaikan ini, `per < 8 && roe > 25` memotong valuasi ke 40% di satu sisi dan
 * tidak memotong sama sekali di sisi lain. PER 7,9/ROE 25,1 dan PER 8,1/ROE 24,9 nyaris
 * tidak berbeda secara fundamental tetapi diperlakukan sejauh mungkin berbeda.
 */

const energi = resolveSectorProfile('Energy', 'Thermal Coal');
const bank = resolveSectorProfile('Financial Services', 'Banks - Regional');

describe('peakCycleSeverity', () => {
  it('hanya berlaku untuk sektor siklikal', () => {
    expect(energi.cyclical).toBe(true);
    expect(bank.cyclical).toBe(false);
    // Bank dengan PER 5 dan ROE 30 bukan puncak siklus komoditas - itu bank murah.
    expect(peakCycleSeverity(bank, 5, 30)).toBe(0);
    expect(peakCycleSeverity(energi, 5, 30)).toBeGreaterThan(0);
  });

  it('data hilang atau PER non-positif tidak menghasilkan tuduhan', () => {
    expect(peakCycleSeverity(energi, null, 30)).toBe(0);
    expect(peakCycleSeverity(energi, 5, null)).toBe(0);
    // Emiten rugi: PER negatif tidak punya makna valuasi, apalagi makna puncak siklus.
    expect(peakCycleSeverity(energi, -4, 30)).toBe(0);
  });

  it('TIDAK ADA TEBING: dua emiten yang hampir sama diperlakukan hampir sama', () => {
    // Inilah kegagalan yang diperbaiki. Di aturan lama, selisih kedua titik ini adalah
    // 0 vs pemotongan penuh.
    const tepatDiBawah = peakCycleSeverity(energi, 7.9, 25.1);
    const tepatDiAtas = peakCycleSeverity(energi, 8.1, 24.9);
    expect(Math.abs(tepatDiBawah - tepatDiAtas)).toBeLessThan(0.05);
  });

  it('titik ambang lama (PER 8, ROE 25) berada di tengah, bukan di ujung', () => {
    expect(peakCycleSeverity(energi, 8, 25)).toBeCloseTo(0.5, 6);
  });

  it('tanda tangan ekstrem tetap dipotong penuh seperti aturan lama', () => {
    expect(peakCycleSeverity(energi, 3, 40)).toBe(1);
    expect(peakCycleSeverity(energi, 4, 32)).toBe(1);
  });

  it('di luar kedua ramp, keparahannya nol', () => {
    expect(peakCycleSeverity(energi, 12, 40)).toBe(0);
    expect(peakCycleSeverity(energi, 3, 18)).toBe(0);
  });

  it('KONJUNGSI: PER murah saja atau ROE tinggi saja bukan puncak siklus', () => {
    // PER 4 (sangat murah) tapi ROE 19 (biasa saja) -> hampir tidak ada tanda tangan.
    expect(peakCycleSeverity(energi, 4, 19)).toBeLessThan(0.1);
    // ROE 40 (sangat tinggi) tapi PER 11 (biasa saja) -> juga hampir tidak ada.
    expect(peakCycleSeverity(energi, 11, 40)).toBeLessThan(0.2);
  });

  it('monoton: makin murah PER pada ROE tetap, keparahan tidak pernah turun', () => {
    let sebelumnya = -1;
    for (const per of [12, 10, 8, 6, 4, 2]) {
      const severity = peakCycleSeverity(energi, per, 32);
      expect(severity).toBeGreaterThanOrEqual(sebelumnya);
      sebelumnya = severity;
    }
  });

  it('monoton: makin tinggi ROE pada PER tetap, keparahan tidak pernah turun', () => {
    let sebelumnya = -1;
    for (const roe of [18, 22, 25, 28, 32, 45]) {
      const severity = peakCycleSeverity(energi, 4, roe);
      expect(severity).toBeGreaterThanOrEqual(sebelumnya);
      sebelumnya = severity;
    }
  });

  it('keparahan selalu di dalam [0,1]', () => {
    for (const per of [0.1, 1, 4, 8, 12, 50, 500]) {
      for (const roe of [-50, 0, 18, 25, 32, 100]) {
        const severity = peakCycleSeverity(energi, per, roe);
        expect(severity).toBeGreaterThanOrEqual(0);
        expect(severity).toBeLessThanOrEqual(1);
      }
    }
  });

  it('isPeakCycleSignature tetap konsisten dengan keparahannya', () => {
    expect(isPeakCycleSignature(energi, 5, 30)).toBe(true);
    expect(isPeakCycleSignature(energi, 20, 10)).toBe(false);
    expect(isPeakCycleSignature(bank, 5, 30)).toBe(false);
  });
});
