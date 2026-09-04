import { describe, expect, it } from 'vitest';
import {
  ARA_SCANNER_POLICY,
  CURRENT_ARA_INPUT_READINESS,
  evaluateAraScannerReadiness,
  getAraScannerReadiness,
} from '../../index';

const FIXED_NOW = '2026-09-05T00:00:00.000Z';

describe('ARA scanner readiness gate', () => {
  it('tetap NOT_RUN pada kemampuan backend saat ini dan tidak membuat sinyal', () => {
    const readiness = getAraScannerReadiness();

    expect(readiness.status).toBe('NOT_RUN');
    expect(readiness.executionAllowed).toBe(false);
    expect(readiness.dataInputsReady).toBe(false);
    expect(readiness.algorithmReady).toBe(true);
    expect(readiness.failClosed).toBe(true);
    expect(readiness.signalCount).toBe(0);
    expect(readiness.blockerCount).toBe(8);
    expect(readiness.inputs).toHaveLength(8);
    expect(readiness.inputs.every((input) => input.status !== 'READY')).toBe(true);
    expect(readiness.engineParity).toMatchObject({
      target: 'HERMES',
      status: 'POLICY_CAPTURED',
      referenceVersion: 'Agent Speed v0.3',
    });
  });

  it('READY jika delapan input unik siap dan formula telah dikonfirmasi', () => {
    const complete = CURRENT_ARA_INPUT_READINESS.map((input) => ({
      ...input,
      status: 'READY' as const,
      source: 'provider-terverifikasi',
      observedAt: FIXED_NOW,
    }));

    const readiness = evaluateAraScannerReadiness(complete, FIXED_NOW);

    expect(readiness.status).toBe('READY');
    expect(readiness.executionAllowed).toBe(true);
    expect(readiness.dataInputsReady).toBe(true);
    expect(readiness.algorithmReady).toBe(true);
    expect(readiness.blockerCount).toBe(0);
    expect(readiness.blockers).toEqual([]);
  });

  it('tetap NOT_RUN jika formula sengaja diblokir meskipun data lengkap', () => {
    const complete = CURRENT_ARA_INPUT_READINESS.map((input) => ({
      ...input,
      status: 'READY' as const,
      source: 'provider-terverifikasi',
      observedAt: FIXED_NOW,
    }));

    expect(evaluateAraScannerReadiness(complete, FIXED_NOW, false)).toMatchObject({
      status: 'NOT_RUN',
      executionAllowed: false,
      dataInputsReady: true,
      algorithmReady: false,
    });
  });

  it('mencatat kontrak bukti SahamLens dan formula positif ACS v0.3', () => {
    const totalWeight = ARA_SCANNER_POLICY.formula.components.reduce((sum, component) => sum + component.weight, 0);

    expect(totalWeight).toBeCloseTo(1, 10);
    expect(ARA_SCANNER_POLICY.formula.status).toBe('CONFIRMED');
    expect(ARA_SCANNER_POLICY.ownership).toMatchObject({
      evidenceEngine: 'SAHAMLENS',
      decisionOrchestrator: 'HERMES_AGENT_SPEED',
      humanFinalAuthority: true,
    });
    expect(ARA_SCANNER_POLICY.downstreamDecisionContract).toMatchObject({
      owner: 'HERMES_AGENT_SPEED',
      independentReviewRequired: true,
      evidenceIsNonBinding: true,
    });
    expect(ARA_SCANNER_POLICY.maxCandidates).toBe(5);
    expect(ARA_SCANNER_POLICY.autoBuyAllowed).toBe(false);
    expect(ARA_SCANNER_POLICY.dataGate.failure).toEqual({ acs: null, action: 'NO_ACTION' });
  });

  it('fail-closed jika satu input stale atau satu key terduplikasi', () => {
    const ready = CURRENT_ARA_INPUT_READINESS.map((input) => ({
      ...input,
      status: 'READY' as const,
      observedAt: FIXED_NOW,
    }));
    const withStaleOrderBook = ready.map((input) => input.key === 'ORDER_BOOK'
      ? { ...input, status: 'STALE' as const }
      : input);
    const withDuplicatePrice = [...ready, ready.find((input) => input.key === 'PRICE_CROSS_CHECK')!];

    expect(evaluateAraScannerReadiness(withStaleOrderBook, FIXED_NOW)).toMatchObject({
      status: 'NOT_RUN',
      executionAllowed: false,
      blockers: ['ORDER_BOOK'],
    });
    expect(evaluateAraScannerReadiness(withDuplicatePrice, FIXED_NOW)).toMatchObject({
      status: 'NOT_RUN',
      executionAllowed: false,
      blockers: ['PRICE_CROSS_CHECK'],
    });
  });
});
