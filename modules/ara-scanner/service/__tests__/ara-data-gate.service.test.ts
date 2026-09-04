import { describe, expect, it } from 'vitest';
import { evaluateAraCandidateDataGate, type AraCandidateDataGateInput } from '../../index';

const VALID_INPUT: AraCandidateDataGateInput = {
  observedAt: '2026-09-05T09:00:00.000Z',
  evaluatedAt: '2026-09-05T09:01:00.000Z',
  stale: false,
  availableComponentWeight: 0.75,
  corporateActionAdjusted: true,
  suspended: false,
  tradingRestricted: false,
  sourceAndTimeTraceable: true,
};

describe('ARA candidate data gate', () => {
  it('meloloskan data yang memenuhi seluruh syarat v0.3', () => {
    expect(evaluateAraCandidateDataGate(VALID_INPUT)).toEqual({
      passed: true,
      failures: [],
      nextAction: 'PROCEED_TO_SCORE',
    });
  });

  it('fail-closed dan mengembalikan ACS null saat syarat data gagal', () => {
    const result = evaluateAraCandidateDataGate({
      ...VALID_INPUT,
      stale: true,
      availableComponentWeight: 0.74,
      corporateActionAdjusted: false,
      suspended: true,
      sourceAndTimeTraceable: false,
    });

    expect(result).toEqual({
      passed: false,
      failures: [
        'STALE_DATA',
        'INSUFFICIENT_COMPONENT_WEIGHT',
        'CORPORATE_ACTION_UNADJUSTED',
        'SUSPENDED',
        'UNTRACEABLE_SOURCE_OR_TIME',
      ],
      acs: null,
      nextAction: 'NO_ACTION',
    });
  });

  it('menolak timestamp lebih dari 10 menit di masa depan', () => {
    expect(evaluateAraCandidateDataGate({
      ...VALID_INPUT,
      observedAt: '2026-09-05T09:11:00.001Z',
      evaluatedAt: '2026-09-05T09:01:00.000Z',
    })).toMatchObject({
      passed: false,
      failures: ['TIMESTAMP_TOO_FAR_IN_FUTURE'],
      acs: null,
      nextAction: 'NO_ACTION',
    });
  });

  it('menolak timestamp tidak valid dan pembatas perdagangan', () => {
    expect(evaluateAraCandidateDataGate({
      ...VALID_INPUT,
      observedAt: 'bukan-tanggal',
      tradingRestricted: true,
    })).toMatchObject({
      passed: false,
      failures: ['INVALID_TIMESTAMP', 'TRADING_RESTRICTED'],
    });
  });
});
