import { describe, it, expect } from 'vitest';
import { fmtDer, fmtKali, fmtPersen, fmtTriliun } from '../fundamental-format';

describe('fmtKali', () => {
  it('formats a number with 2 decimals and x suffix', () => {
    expect(fmtKali(12.345)).toBe('12.35x');
  });
  it('returns N/A for null', () => {
    expect(fmtKali(null)).toBe('N/A');
  });
  it('returns N/A for undefined', () => {
    expect(fmtKali(undefined)).toBe('N/A');
  });
});

describe('fmtPersen', () => {
  it('converts fraction to percentage with 2 decimals', () => {
    expect(fmtPersen(0.1523)).toBe('15.23%');
  });
  it('returns N/A for null (not 0.00%)', () => {
    expect(fmtPersen(null)).toBe('N/A');
  });
});

describe('fmtTriliun', () => {
  it('converts raw value to triliun rupiah with 2 decimals', () => {
    expect(fmtTriliun(1.5e12)).toBe('Rp 1.50 T');
  });
  it('returns N/A for undefined (not Rp 0.00 T)', () => {
    expect(fmtTriliun(undefined)).toBe('N/A');
  });
});

describe('fmtDer', () => {
  // Temuan H-01 (audit 2026-08-19): provider mengirim DER dalam PERSEN (47.2 = 0,47x).
  // FundamentalMoatEarningsExportCard3D dulu merendernya lewat fmtKali() sehingga
  // kartu ekspor menampilkan "47.20x" untuk neraca yang sehat.
  it('mengubah persen provider menjadi rasio', () => {
    expect(fmtDer(47.2)).toBe('0.47x');
    expect(fmtDer(250)).toBe('2.50x');
    expect(fmtDer(0)).toBe('0.00x');
  });

  it('berbeda dari fmtKali - selisih inilah isi bug H-01', () => {
    expect(fmtDer(47.2)).not.toBe(fmtKali(47.2));
    expect(fmtKali(47.2)).toBe('47.20x');
  });

  it('data hilang tetap N/A, bukan 0.00x', () => {
    expect(fmtDer(null)).toBe('N/A');
    expect(fmtDer(undefined)).toBe('N/A');
    expect(fmtDer(Number.NaN)).toBe('N/A');
  });
});
