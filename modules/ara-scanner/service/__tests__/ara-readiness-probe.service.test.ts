import { describe, expect, it } from 'vitest';
import { probeAraPipelineCapabilities } from '../ara-readiness-probe.service';
import { buildCurrentAraInputReadiness, evaluateAraScannerReadiness } from '../ara-scanner-readiness.service';

describe('probe kesiapan pipeline ARA', () => {
  it('membuktikan enam kemampuan hitung milik lapisan analisa', () => {
    const outcomes = probeAraPipelineCapabilities();

    // Penjaga jumlah: kalau probe berhenti memeriksa, ini yang memerah lebih dulu.
    expect(outcomes).toHaveLength(6);
    expect(outcomes.every((o) => o.status === 'READY')).toBe(true);
    expect(outcomes.map((o) => o.key)).toEqual([
      'ARA_CANDIDATES', 'ARA_LIMIT', 'LIQUIDITY_PROXY',
      'BREAKOUT_PERSISTENCE', 'RELATIVE_TRADING_ACTIVITY', 'MOMENTUM_EXHAUSTION',
    ]);
  });

  it('menyertakan bukti angka untuk setiap kemampuan yang diklaim READY', () => {
    for (const outcome of probeAraPipelineCapabilities()) {
      expect(outcome.evidence, `bukti hilang untuk ${outcome.key}`).not.toBeNull();
      expect(Object.keys(outcome.evidence ?? {}).length).toBeGreaterThan(0);
    }
  });

  it('probe TIDAK BOLEH menaikkan input yang digerbang feed eksternal', () => {
    // Probe berbohong: mengaku feed resmi dan cross-check sudah siap tanpa artefak.
    const dishonest = [
      ...probeAraPipelineCapabilities(),
      { key: 'TRADING_RESTRICTIONS' as const, status: 'READY' as const, detail: 'klaim palsu', evidence: {} },
      { key: 'PRICE_CROSS_CHECK' as const, status: 'READY' as const, detail: 'klaim palsu', evidence: {} },
      { key: 'ORDER_BOOK' as const, status: 'READY' as const, detail: 'klaim palsu', evidence: {} },
    ];

    const inputs = buildCurrentAraInputReadiness(dishonest, null, { verified: false, status: 'MISSING', source: null, observedAt: null, count: 0, tickerCount: 0, coverageFrom: null, coverageTo: null, detail: '' });
    const byKey = new Map(inputs.map((i) => [i.key, i]));

    expect(byKey.get('TRADING_RESTRICTIONS')?.status).toBe('MISSING');
    expect(byKey.get('ORDER_BOOK')?.status).toBe('OUT_OF_SCOPE');

    // Klaim palsu tanpa artefak tidak boleh membuka eksekusi.
    const readiness = evaluateAraScannerReadiness(inputs, '2026-09-05T01:00:00.000Z');
    expect(readiness.status).toBe('NOT_RUN');
    expect(readiness.executionAllowed).toBe(false);
    expect(readiness.blockers).toContain('TRADING_RESTRICTIONS');
  });

  it('kemampuan yang gagal menurunkan status tanpa perlu suntingan manual', () => {
    const degraded = probeAraPipelineCapabilities().map((o) => (
      o.key === 'BREAKOUT_PERSISTENCE'
        ? { ...o, status: 'PARTIAL' as const, detail: 'simulasi regresi', evidence: null }
        : o
    ));

    const readiness = evaluateAraScannerReadiness(
      buildCurrentAraInputReadiness(degraded),
      '2026-09-05T01:00:00.000Z',
    );

    expect(readiness.blockers).toContain('BREAKOUT_PERSISTENCE');
    expect(readiness.executionAllowed).toBe(false);
  });
});
