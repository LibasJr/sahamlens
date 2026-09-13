import { describe, expect, it } from 'vitest';
import {
  compareFundamentalField,
  crossCheckFundamentals,
  relativeGap,
} from '../fundamental-cross-check.service';

describe('compareFundamentalField', () => {
  it('menyebut setuju saat dua metodologi berbeda tipis', () => {
    // Yahoo memakai trailing twelve months, XBRL memakai tahun buku auditan. Selisih
    // kecil adalah keadaan normal, bukan temuan.
    const r = compareFundamentalField('per', 12.4, 13.1);
    expect(r.verdict).toBe('AGREE');
    expect(r.implausible).toBeNull();
  });

  it('menyebut berbeda saat selisihnya melampaui toleransi field', () => {
    const r = compareFundamentalField('per', 12.4, 31.0);
    expect(r.verdict).toBe('DIVERGE');
    expect(r.relativeGap).toBeGreaterThan(0.15);
  });

  // Inti P1: satu sumber tanpa pembanding tidak pernah ketahuan rusak.
  it('menandai sisi Yahoo yang mustahil, bukan menyebutnya sekadar berbeda', () => {
    const r = compareFundamentalField('per', 12.4, 2000);
    expect(r.verdict).toBe('DIVERGE');
    expect(r.implausible).toBe('YAHOO');
  });

  it('menandai PER nyaris nol - keluarga bug 0.0005x', () => {
    const r = compareFundamentalField('per', 14.2, 0.0005);
    expect(r.implausible).toBe('YAHOO');
  });

  it('tidak memihak: XBRL yang mustahil ikut ditandai', () => {
    const r = compareFundamentalField('per', 9_999, 14.2);
    expect(r.implausible).toBe('XBRL');
  });

  it('membedakan hanya-XBRL dari hanya-Yahoo, bukan menyamakannya jadi hilang', () => {
    expect(compareFundamentalField('roe', 18.2, null).verdict).toBe('XBRL_ONLY');
    expect(compareFundamentalField('roe', null, 18.2).verdict).toBe('YAHOO_ONLY');
    expect(compareFundamentalField('roe', null, null).verdict).toBe('BOTH_MISSING');
  });

  it('menandai nilai mustahil meski sisi lain tidak ada pembandingnya', () => {
    const r = compareFundamentalField('per', null, 2000);
    expect(r.verdict).toBe('YAHOO_ONLY');
    expect(r.implausible).toBe('YAHOO');
  });

  // Beda satuan adalah salah-baca yang paling mungkin: der rasio (0.4) vs persen (40).
  it('tidak menyamakan rasio dengan persen', () => {
    expect(compareFundamentalField('der', 0.4, 40).verdict).toBe('DIVERGE');
    expect(compareFundamentalField('der', 0.4, 0.42).verdict).toBe('AGREE');
  });

  it('memakai toleransi berbeda per field, bukan satu ambang untuk semua', () => {
    // gap 0.25: melewati toleransi per (0.15), tapi masih dalam toleransi revenueGrowth (0.3)
    expect(compareFundamentalField('per', 10, 13.4).verdict).toBe('DIVERGE');
    expect(compareFundamentalField('revenueGrowth', 10, 13.4).verdict).toBe('AGREE');
  });

  it('menerima ROE negatif sebagai angka sah, bukan kesalahan', () => {
    const r = compareFundamentalField('roe', -12.5, -13.0);
    expect(r.verdict).toBe('AGREE');
    expect(r.implausible).toBeNull();
  });

  it('menolak NaN dan Infinity alih-alih membandingkannya', () => {
    expect(compareFundamentalField('per', Number.NaN, 12).verdict).toBe('YAHOO_ONLY');
    expect(compareFundamentalField('per', Number.POSITIVE_INFINITY, 12).verdict).toBe('YAHOO_ONLY');
  });
});

describe('relativeGap', () => {
  it('memakai besaran terbesar sebagai penyebut supaya satu ambang berlaku lintas skala', () => {
    expect(relativeGap(10, 10)).toBe(0);
    expect(relativeGap(10, 12)).toBeCloseTo(0.1667, 3);
    expect(relativeGap(100, 120)).toBeCloseTo(0.1667, 3);
  });

  it('tidak membagi nol', () => {
    expect(relativeGap(0, 0)).toBe(0);
    expect(relativeGap(0, 5)).toBe(1);
  });
});

describe('crossCheckFundamentals', () => {
  it('meringkas enam field tanpa menyentuh skor apa pun', () => {
    const result = crossCheckFundamentals(
      'BBCA',
      { per: 12.4, pbv: 2.1, roe: 18.2, der: 0.4, currentRatio: 1.8, revenueGrowth: 9.1 },
      { per: 13.1, pbv: 2.0, roe: 18.0, der: 0.41, currentRatio: 1.75, revenueGrowth: 8.9 },
    );

    expect(result.ticker).toBe('BBCA');
    expect(result.fields).toHaveLength(6);
    expect(result.summary.AGREE).toBe(6);
    expect(result.implausibleCount).toBe(0);
  });

  it('menghitung emiten yang hanya tercakup XBRL - kasus dominan di IDX', () => {
    // Yahoo hanya mencakup 200 emiten di produksi; XBRL mencakup 882.
    const result = crossCheckFundamentals(
      'ABBA',
      { per: 11.0, pbv: 1.2, roe: 9.4, der: 0.6, currentRatio: 1.4, revenueGrowth: 3.2 },
      null,
    );

    expect(result.summary.XBRL_ONLY).toBe(6);
    expect(result.summary.YAHOO_ONLY).toBe(0);
  });

  it('menghitung nilai mustahil secara terpisah dari perbedaan biasa', () => {
    const result = crossCheckFundamentals(
      'XXXX',
      { per: 12.0, roe: 15.0 },
      { per: 2000, roe: 14.8 },
    );

    expect(result.implausibleCount).toBe(1);
    expect(result.fields.find((f) => f.field === 'per')?.implausible).toBe('YAHOO');
    expect(result.fields.find((f) => f.field === 'roe')?.verdict).toBe('AGREE');
  });

  it('tidak melempar saat kedua sumber kosong', () => {
    const result = crossCheckFundamentals('KOSONG', null, null);
    expect(result.summary.BOTH_MISSING).toBe(6);
    expect(result.implausibleCount).toBe(0);
  });
});
