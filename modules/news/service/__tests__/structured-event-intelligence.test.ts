import { describe, expect, it } from 'vitest';
import {
  classifyEventByRules,
  sanitizeEventIntelligence,
} from '../structured-event-intelligence.service';

describe('structured event intelligence', () => {
  it('memetakan kenaikan laba ke metrik earnings dan horizon pendek', () => {
    const result = classifyEventByRules('Laba Bersih Emiten ABCD Melonjak 40% pada Kuartal II');

    expect(result.eventType).toBe('EARNINGS');
    expect(result.affectedMetrics).toEqual(['Pendapatan', 'Laba bersih', 'Margin']);
    expect(result.horizon).toBe('SHORT_TERM');
    expect(result.expectedImpact.direction).toBe('POSITIVE');
    expect(result.confidence).toBeLessThanOrEqual(75);
    expect(result.evidenceBasis).toBe('HEADLINE_ONLY');
  });

  it('menandai rights issue sebagai dampak campuran karena modal dan dilusi', () => {
    const result = classifyEventByRules('WXYZ Siapkan Rights Issue untuk Ekspansi');

    expect(result.eventType).toBe('CAPITAL_RAISE');
    expect(result.affectedMetrics).toContain('EPS');
    expect(result.horizon).toBe('MEDIUM_TERM');
    expect(result.expectedImpact.direction).toBe('MIXED');
  });

  it('tidak memaksakan arah untuk berita rupiah tanpa konteks emiten', () => {
    const result = classifyEventByRules('Rupiah Bergerak Jelang Keputusan The Fed');

    expect(result.eventType).toBe('MACRO_RATE');
    expect(result.expectedImpact.direction).toBe('MIXED');
    expect(result.expectedImpact.summary).toContain('berbeda per sektor');
  });

  it('mengakui jika judul tidak cukup untuk dipetakan', () => {
    const result = classifyEventByRules('Pelaku Pasar Menanti Perkembangan Terbaru');

    expect(result.eventType).toBe('OTHER');
    expect(result.horizon).toBe('UNDETERMINED');
    expect(result.expectedImpact.direction).toBe('UNCLEAR');
    expect(result.confidence).toBe(25);
  });

  it('membersihkan respons AI dan membatasi confidence judul maksimum 75', () => {
    const result = sanitizeEventIntelligence({
      eventType: 'EARNINGS',
      eventLabel: '  Laporan laba  ',
      affectedMetrics: ['Revenue', 'Net income', 'Margin', 'Extra'],
      horizon: 'SHORT_TERM',
      expectedImpact: {
        direction: 'POSITIVE',
        magnitude: 'HIGH',
        summary: '  Ekspektasi laba membaik.  ',
      },
      confidence: 99,
      evidenceBasis: 'FULL_ARTICLE',
    }, 'Laba Emiten Naik');

    expect(result.affectedMetrics).toHaveLength(3);
    expect(result.confidence).toBe(75);
    expect(result.evidenceBasis).toBe('HEADLINE_ONLY');
  });

  it('menandai RSS summary hanya ketika ringkasan nyata diberikan pemanggil', () => {
    const result = sanitizeEventIntelligence(
      { eventType: 'EARNINGS', confidence: 99 },
      'Emiten melaporkan kinerja kuartal',
      'RSS_SUMMARY',
      'Ringkasan feed menyebut pertumbuhan pendapatan dan laba bersih.',
    );
    expect(result.evidenceBasis).toBe('RSS_SUMMARY');
    expect(result.confidence).toBe(85);
  });
});
