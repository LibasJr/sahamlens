import { describe, expect, it } from 'vitest';
import {
  getAnalyzerDirectionLabel,
  getKategoriPresentationLabel,
  getKategoriTone,
} from '../signal-labels';

describe('getKategoriPresentationLabel', () => {
  it('STRONG BUY menjadi SINYAL SANGAT POSITIF, bukan teks transaksi mentah', () => {
    expect(getKategoriPresentationLabel('STRONG BUY')).toBe('SINYAL SANGAT POSITIF');
    expect(getKategoriPresentationLabel('STRONG BUY')).not.toContain('BUY');
  });

  it('memetakan seluruh lima kategori classifier', () => {
    expect(getKategoriPresentationLabel('BUY')).toBe('SINYAL POSITIF');
    expect(getKategoriPresentationLabel('HOLD')).toBe('NETRAL / PANTAU');
    expect(getKategoriPresentationLabel('SELL')).toBe('SINYAL NEGATIF');
    expect(getKategoriPresentationLabel('STRONG SELL')).toBe('SINYAL SANGAT NEGATIF');
  });

  it('meneruskan apa adanya kategori yang tidak dikenal (mis. DATA TIDAK CUKUP)', () => {
    expect(getKategoriPresentationLabel('DATA TIDAK CUKUP')).toBe('DATA TIDAK CUKUP');
  });

  it('null/undefined -> TIDAK TERSEDIA, bukan dilempar error', () => {
    expect(getKategoriPresentationLabel(null)).toBe('TIDAK TERSEDIA');
    expect(getKategoriPresentationLabel(undefined)).toBe('TIDAK TERSEDIA');
  });
});

describe('getKategoriTone', () => {
  it('STRONG BUY/BUY -> positive, STRONG SELL/SELL -> negative, HOLD -> neutral', () => {
    expect(getKategoriTone('STRONG BUY')).toBe('positive');
    expect(getKategoriTone('BUY')).toBe('positive');
    expect(getKategoriTone('STRONG SELL')).toBe('negative');
    expect(getKategoriTone('SELL')).toBe('negative');
    expect(getKategoriTone('HOLD')).toBe('neutral');
    expect(getKategoriTone('DATA TIDAK CUKUP')).toBe('neutral');
    expect(getKategoriTone(null)).toBe('neutral');
  });
});

describe('getAnalyzerDirectionLabel', () => {
  it('menggunakan kata sifat arah, bukan kata kerja transaksi', () => {
    expect(getAnalyzerDirectionLabel('BUY')).toBe('BULLISH');
    expect(getAnalyzerDirectionLabel('SELL')).toBe('BEARISH');
    expect(getAnalyzerDirectionLabel('HOLD')).toBe('NETRAL');
    expect(getAnalyzerDirectionLabel('WAIT')).toBe('NETRAL');
  });
});
