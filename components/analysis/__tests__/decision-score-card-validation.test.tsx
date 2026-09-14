import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LENS_SCORE_WEIGHTS } from '@/shared/constants/lens-score-weights';

/**
 * ===================================================================================
 * V2 butir 005 - skor tidak boleh tampil tanpa konteks validasi
 * ===================================================================================
 *
 * Sebelumnya disclosure "belum lolos validasi backtest" hanya muncul untuk verdict
 * INFORMASI. Verdict lain justru mendapat kalimat yang MEYAKINKAN tanpa penanda
 * apa pun bahwa model skornya belum tervalidasi.
 *
 * Efeknya terbalik dari yang diinginkan: makin tinggi skor sebuah saham, makin besar
 * peluang pengguna melihat angka besar TANPA konteks. Angka 82 yang berdiri sendiri
 * terbaca sebagai rekomendasi - dan itu persis yang tidak boleh terjadi selama model
 * belum punya artefak backtest yang bisa diaudit.
 *
 * Dirender dengan renderToStaticMarkup mengikuti pola test .tsx lain di repo ini
 * (tidak ada @testing-library/react terpasang, dan menambahkannya hanya demi satu
 * berkas test bukan alasan yang cukup).
 */

const isLensScoreValidated = vi.fn(() => false);
vi.mock('@/modules/validation', () => ({
  isLensScoreValidated: () => isLensScoreValidated(),
}));

const { default: DecisionScoreCard } = await import('../DecisionScoreCard');

const baseProps = {
  totalScore: 82,
  technicalScore: 32,
  fundamentalScore: 26,
  flowScore: 24,
  coveragePct: 100,
  expanded: false,
  onExplain: () => {},
  onCollapse: () => {},
};

const html = (verdict: string) =>
  renderToStaticMarkup(<DecisionScoreCard {...baseProps} verdict={verdict} />);

beforeEach(() => {
  isLensScoreValidated.mockReturnValue(false);
});

describe('DecisionScoreCard - disclosure validasi model', () => {
  // Daftar ini sengaja memuat verdict "bagus". Justru di sanalah disclosure paling
  // penting, dan justru di sanalah ia dulu TIDAK muncul.
  const VERDICTS = ['BELI BERTAHAP', 'PANTAU', 'INFORMASI', 'DATA TERBATAS', 'TIDAK LAYAK'];

  it.each(VERDICTS)('menampilkan disclosure untuk verdict "%s"', (verdict) => {
    expect(html(verdict)).toContain('data-testid="model-validation-disclosure"');
  });

  it('disclosure menyebut DYOR dan menolak dibaca sebagai rekomendasi', () => {
    const out = html('BELI BERTAHAP');
    expect(out).toMatch(/belum tervalidasi/i);
    expect(out).toMatch(/bukan\s+rekomendasi/i);
    expect(out).toMatch(/DYOR/i);
  });

  it('disclosure HILANG kalau model benar-benar tervalidasi', () => {
    // Tanpa test ini, disclosure yang selalu tampil apa pun keadaannya akan lulus
    // semua test di atas tanpa pernah benar-benar membaca status validasi.
    isLensScoreValidated.mockReturnValue(true);
    expect(html('BELI BERTAHAP')).not.toContain('data-testid="model-validation-disclosure"');
  });

  it('kalimat verdict tidak menyamakan kelayakan data dengan validasi model', () => {
    // "lolos pemeriksaan kelayakan" tanpa kualifikasi pernah membuat pembaca
    // menyimpulkan modelnya sudah tervalidasi. Dua hal itu berbeda.
    expect(html('BELI BERTAHAP')).toMatch(/bukan dari model yang tervalidasi backtest/i);
  });
});

describe('DecisionScoreCard - penyebut sub-skor terikat ke sumber tunggal', () => {
  it('memakai LENS_SCORE_WEIGHTS, bukan angka yang ditulis ulang', () => {
    const out = html('PANTAU');
    expect(out).toContain(`32/${LENS_SCORE_WEIGHTS.technical}`);
    expect(out).toContain(`26/${LENS_SCORE_WEIGHTS.fundamental}`);
    expect(out).toContain(`24/${LENS_SCORE_WEIGHTS.flow}`);
  });

  it('penjaga: bobot berjumlah 100, jadi total /100 tetap sah', () => {
    const total =
      LENS_SCORE_WEIGHTS.technical + LENS_SCORE_WEIGHTS.fundamental + LENS_SCORE_WEIGHTS.flow;
    expect(total).toBe(100);
  });
});
