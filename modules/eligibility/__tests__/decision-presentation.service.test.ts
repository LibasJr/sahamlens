import { describe, expect, it } from 'vitest';
import { getDecisionPresentation } from '../service/decision-presentation.service';
import type { AdvisoryDecision } from '../service/advisory.service';

function decision(overrides: Partial<AdvisoryDecision>): AdvisoryDecision {
  return {
    action: null,
    advisory: false,
    eligibilityStatus: 'ELIGIBLE',
    reasonCodes: [],
    explanation: null,
    ...overrides,
  };
}

describe('getDecisionPresentation', () => {
  it('BUY + ELIGIBLE + MODEL_UNVALIDATED tetap sinyal BUY, bukan neutral/actionable', () => {
    const p = getDecisionPresentation('BUY', decision({
      reasonCodes: ['MODEL_UNVALIDATED'],
      explanation: 'Model belum tervalidasi.',
    }));

    expect(p.kind).toBe('MODEL_UNVALIDATED');
    expect(p.modelSignal).toBe('BUY');
    expect(p.modelSignalLabel).toBe('SINYAL MODEL: BUY');
    expect(p.statusLabel).toBe('MODEL BELUM TERVALIDASI');
    expect(p.recommendationLabel).toBeNull();
    expect(p.actionable).toBe(false);
  });

  it('SELL + ELIGIBLE + MODEL_UNVALIDATED tetap informational', () => {
    const p = getDecisionPresentation('SELL', decision({ reasonCodes: ['MODEL_UNVALIDATED'] }));
    expect(p.modelSignalLabel).toBe('SINYAL MODEL: SELL');
    expect(p.actionable).toBe(false);
  });

  it.each(['LOW_LIQUIDITY', 'STALE_DATA'] as const)('%s => tidak layak direkomendasikan, signal tetap terlihat', (status) => {
    const p = getDecisionPresentation('BUY', decision({
      eligibilityStatus: status,
      reasonCodes: [status],
      explanation: `Alasan ${status}`,
    }));

    expect(p.kind).toBe('INELIGIBLE');
    expect(p.modelSignalLabel).toBe('SINYAL MODEL: BUY');
    expect(p.statusLabel).toBe('TIDAK LAYAK DIREKOMENDASIKAN');
    expect(p.explanation).toContain(status);
    expect(p.actionable).toBe(false);
  });

  it('DATA TIDAK CUKUP tidak dipetakan menjadi HOLD', () => {
    const p = getDecisionPresentation('DATA TIDAK CUKUP', decision({
      reasonCodes: ['COVERAGE_BELOW_MIN'],
      explanation: 'Coverage rendah.',
    }));
    expect(p.modelSignal).toBe('DATA TIDAK CUKUP');
    expect(p.modelSignalLabel).toBe('STATUS MODEL: DATA TIDAK CUKUP');
    expect(p.recommendationLabel).toBeNull();
    expect(p.actionable).toBe(false);
  });

  it('future state ELIGIBLE + validated + BUY memakai decision.action sebagai recommendation', () => {
    const p = getDecisionPresentation('BUY', decision({ action: 'BUY', advisory: true }));
    expect(p.kind).toBe('ACTIONABLE');
    expect(p.recommendationLabel).toBe('REKOMENDASI: BUY');
    expect(p.actionable).toBe(true);
  });

  it('payload legacy tanpa decision tetap fail-closed', () => {
    const p = getDecisionPresentation('BUY', undefined);
    expect(p.modelSignalLabel).toBe('SINYAL MODEL: BUY');
    expect(p.statusLabel).toBe('REKOMENDASI TIDAK TERSEDIA');
    expect(p.actionable).toBe(false);
  });
});
