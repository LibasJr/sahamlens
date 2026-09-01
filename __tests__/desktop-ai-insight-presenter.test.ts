import { describe, expect, it } from 'vitest';
import { presentAIInsight } from '../desktop/src/aiInsightPresenter';

describe('desktop AI insight presenter', () => {
  it('menampilkan rekomendasi pertama beserta evidence aktual', () => {
    const insight = presentAIInsight({
      data: {
        recommendations: [{
          ticker: 'BBCA',
          totalScore: 82.45,
          scoringKategori: 'BUY_CANDIDATE',
          consensus: 'BUY',
          coverage: 87.5,
          price: 9325,
          changePct: 1.2,
          topReasons: ['Tren harga di atas MA50', 'ROE tetap kuat'],
          riskFlags: ['Valuasi premium'],
          fundamentalScore: 76,
          valuationScore: 58,
          foreignFlow: 'NET BUY',
          eligibilityStatus: 'ELIGIBLE',
          dataTimestamp: '2026-09-01T09:00:00.000Z',
          _meta: { freshness: 'FRESH' },
        }],
        modelValidation: { validated: false, reasonCode: 'MODEL_UNVALIDATED' },
      },
    }, 'BBCA');

    expect(insight).toMatchObject({
      ticker: 'BBCA',
      score: 82.45,
      category: 'BUY_CANDIDATE',
      consensus: 'BUY',
      coverage: 87.5,
      modelValidated: false,
      modelReason: 'MODEL_UNVALIDATED',
      freshness: 'FRESH',
      supportingReasons: ['Tren harga di atas MA50', 'ROE tetap kuat'],
      riskFlags: ['Valuasi premium'],
    });
    expect(insight?.evidence).toEqual(expect.arrayContaining([
      { label: 'Harga', value: 'Rp 9.325' },
      { label: 'Perubahan', value: '+1,20%' },
      { label: 'Skor fundamental', value: '76,0' },
      { label: 'Skor valuasi', value: '58,0' },
      { label: 'Flow', value: 'NET BUY' },
      { label: 'Eligibility', value: 'ELIGIBLE' },
    ]));
  });

  it('menerima kontrak backward-compatible dan tidak mengarang score', () => {
    const insight = presentAIInsight({ recommendations: [{ ticker: 'TLKM', consensus: 'HOLD' }] }, 'TLKM');

    expect(insight).toMatchObject({ ticker: 'TLKM', score: null, consensus: 'HOLD' });
    expect(insight?.evidence).toEqual([]);
  });

  it('mengembalikan null ketika ticker yang diminta tidak ada', () => {
    expect(presentAIInsight({ data: { recommendations: [{ ticker: 'ASII' }] } }, 'BBCA')).toBeNull();
  });
});
