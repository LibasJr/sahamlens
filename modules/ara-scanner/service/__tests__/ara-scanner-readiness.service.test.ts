import { describe, expect, it } from 'vitest';
import {
  ARA_SCANNER_POLICY,
  CURRENT_ARA_INPUT_READINESS,
  evaluateAraScannerReadiness,
  getAraScannerReadiness,
} from '../../index';
import { buildCurrentAraInputReadiness } from '../ara-scanner-readiness.service';
import { probeAraPipelineCapabilities } from '../ara-readiness-probe.service';
import type { UmaArtifactProbe } from '../ara-uma-readiness.service';
import type { SuspensionArtifactProbe } from '../ara-suspension-readiness.service';

const FIXED_NOW = '2026-09-05T00:00:00.000Z';

describe('ARA scanner readiness gate', () => {
  it('tetap NOT_RUN pada kemampuan backend saat ini dan tidak membuat sinyal', () => {
    const readiness = evaluateAraScannerReadiness(
      buildCurrentAraInputReadiness(probeAraPipelineCapabilities(), null, { ...uma, verified: false, status: 'MISSING' }),
      FIXED_NOW,
    );

    expect(readiness.status).toBe('NOT_RUN');
    expect(readiness.executionAllowed).toBe(false);
    expect(readiness.dataInputsReady).toBe(false);
    expect(readiness.algorithmReady).toBe(true);
    expect(readiness.failClosed).toBe(true);
    expect(readiness.signalCount).toBe(0);
    // ORDER_BOOK bukan blocker: di luar cakupan SahamLens secara desain.
    // Enam kemampuan hitung terbukti READY lewat probe; sisa blocker adalah
    // feed eksternal yang tidak bisa dibuktikan probe.
    expect(readiness.blockerCount).toBe(1);
    expect(readiness.blockers).toEqual(['TRADING_RESTRICTIONS']);
    expect(readiness.inputs).toHaveLength(9);
    expect(readiness.outOfScopeInputs).toEqual(['ORDER_BOOK']);
    expect(readiness.blockers).not.toContain('ORDER_BOOK');
    expect(readiness.engineParity).toMatchObject({
      target: 'HERMES',
      status: 'POLICY_CAPTURED',
      referenceVersion: 'Agent Speed v0.3',
    });
  });

  const uma: UmaArtifactProbe = {
    verified: true,
    status: 'PARTIAL',
    source: 'IDX_OFFICIAL_API GetUMA via data/idx-uma',
    observedAt: '2026-09-05T04:00:00.000Z',
    count: 136,
    tickerCount: 127,
    coverageFrom: '2026-05-08',
    coverageTo: '2026-09-03',
    detail: 'Feed UMA resmi terverifikasi; suspensi dan aksi korporasi belum tercakup.',
  };

  const suspensi_fixture: SuspensionArtifactProbe = {
    verified: true,
    status: 'READY',
    source: 'IDX_OFFICIAL_API GetSuspension via data/idx-suspension',
    observedAt: '2026-09-05T04:30:00.000Z',
    coverageFrom: '2026-05-12',
    coverageTo: '2026-09-03',
    tickerCount: 54,
    suspendedCount: 17,
    unresolvedCount: 7,
    marketWideSuspendUncertainty: true,
    detail: 'Feed suspensi resmi terverifikasi.',
  };

  it('UMA saja tidak cukup: tanpa bukti suspensi, gerbang turun ke MISSING', () => {
    const inputs = buildCurrentAraInputReadiness(probeAraPipelineCapabilities(), null, uma, { ...suspensi_fixture, verified: false, status: 'MISSING' });
    const restrictions = inputs.find((input) => input.key === 'TRADING_RESTRICTIONS');

    expect(restrictions?.status).toBe('MISSING');
    expect(restrictions?.detail).toContain('Suspensi');
    expect(evaluateAraScannerReadiness(inputs, FIXED_NOW)).toMatchObject({
      status: 'NOT_RUN',
      executionAllowed: false,
      blockers: ['TRADING_RESTRICTIONS'],
    });
  });

  it('menggabungkan UMA dan suspensi menaikkan status menjadi READY', () => {
    const suspensi: SuspensionArtifactProbe = {
      verified: true,
      status: 'READY',
      source: 'IDX_OFFICIAL_API GetSuspension via data/idx-suspension',
      observedAt: '2026-09-05T04:30:00.000Z',
      coverageFrom: '2026-05-12',
      coverageTo: '2026-09-03',
      tickerCount: 54,
      suspendedCount: 17,
      unresolvedCount: 7,
      marketWideSuspendUncertainty: true,
      detail: 'Feed suspensi resmi terverifikasi.',
    };
    const inputs = buildCurrentAraInputReadiness(undefined, null, { ...uma, status: 'READY' }, suspensi);
    const restrictions = inputs.find((input) => input.key === 'TRADING_RESTRICTIONS');

    expect(restrictions?.status).toBe('READY');
    expect(restrictions?.source).toContain('GetSuspension');
    expect(evaluateAraScannerReadiness(inputs, FIXED_NOW)).toMatchObject({
      executionAllowed: true,
      status: 'READY',
      blockers: [],
    });
  });

  it('READY jika seluruh input milik SahamLens siap dan formula telah dikonfirmasi', () => {
    const complete = CURRENT_ARA_INPUT_READINESS.map((input) => (
      input.status === 'OUT_OF_SCOPE'
        ? { ...input }
        : { ...input, status: 'READY' as const, source: 'provider-terverifikasi', observedAt: FIXED_NOW }
    ));

    const readiness = evaluateAraScannerReadiness(complete, FIXED_NOW);

    expect(readiness.status).toBe('READY');
    expect(readiness.executionAllowed).toBe(true);
    expect(readiness.dataInputsReady).toBe(true);
    expect(readiness.algorithmReady).toBe(true);
    expect(readiness.blockerCount).toBe(0);
    expect(readiness.blockers).toEqual([]);
    // Tetap READY tanpa pernah mengklaim order book.
    expect(readiness.outOfScopeInputs).toEqual(['ORDER_BOOK']);
  });

  it('tetap NOT_RUN jika formula sengaja diblokir meskipun data lengkap', () => {
    const complete = CURRENT_ARA_INPUT_READINESS.map((input) => (
      input.status === 'OUT_OF_SCOPE'
        ? { ...input }
        : { ...input, status: 'READY' as const, source: 'provider-terverifikasi', observedAt: FIXED_NOW }
    ));

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
    const ready = CURRENT_ARA_INPUT_READINESS.map((input) => (
      input.status === 'OUT_OF_SCOPE'
        ? { ...input }
        : { ...input, status: 'READY' as const, observedAt: FIXED_NOW }
    ));
    const withStaleLiquidity = ready.map((input) => input.key === 'LIQUIDITY_PROXY'
      ? { ...input, status: 'STALE' as const }
      : input);
    const withDuplicatePrice = [...ready, ready.find((input) => input.key === 'PRICE_CROSS_CHECK')!];

    expect(evaluateAraScannerReadiness(withStaleLiquidity, FIXED_NOW)).toMatchObject({
      status: 'NOT_RUN',
      executionAllowed: false,
      blockers: ['LIQUIDITY_PROXY'],
    });
    expect(evaluateAraScannerReadiness(withDuplicatePrice, FIXED_NOW)).toMatchObject({
      status: 'NOT_RUN',
      executionAllowed: false,
      blockers: ['PRICE_CROSS_CHECK'],
    });
  });

  it('order book tetap di luar cakupan dan tidak boleh diklaim SahamLens', () => {
    const orderBook = CURRENT_ARA_INPUT_READINESS.find((input) => input.key === 'ORDER_BOOK')!;

    expect(orderBook).toMatchObject({
      status: 'OUT_OF_SCOPE',
      required: false,
      ownedBy: 'EXECUTION_LAYER',
      source: null,
    });
    expect(ARA_SCANNER_POLICY.investabilityChecks.executionLayer).toEqual(
      expect.arrayContaining(['Spread', 'Kedalaman bid-offer', 'Slippage']),
    );
    expect(ARA_SCANNER_POLICY.investabilityChecks.analysisLayer).not.toContain('Spread');
    expect(ARA_SCANNER_POLICY.prohibitions).toContain(
      'Mengklaim spread, kedalaman bid-offer, atau slippage dari sisi SahamLens',
    );
  });
});
