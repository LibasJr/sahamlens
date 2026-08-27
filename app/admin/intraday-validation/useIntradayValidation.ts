'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';
import { describeActionResult, sampleSortValue } from './shared-ui';
import type { ActionName, ActionResult, Dashboard, SampleSort, SampleSortKey, ThresholdSimulationResult, WeightProposalResult } from './types';

/**
 * Semua state dan efek data-fetching untuk Intraday Validation Lab.
 * Dipisah dari komponen presentasi supaya komponen halaman hanya merangkai UI,
 * dan hook ini bisa diuji/dibaca tanpa menyeret JSX. Perilaku SAMA PERSIS dengan
 * sebelum dipecah - tidak ada logic yang diubah, hanya dipindahkan.
 */
export function useIntradayValidation() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ActionName | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<string>('H30');
  const [threshold, setThreshold] = useState<number>(60);
  const [thresholdSim, setThresholdSim] = useState<ThresholdSimulationResult | null>(null);
  const [weightProposal, setWeightProposal] = useState<WeightProposalResult | null>(null);
  const [lookbackDays, setLookbackDays] = useState<number>(5);
  const [sampleSort, setSampleSort] = useState<SampleSort>({ key: 'signalTimestamp', direction: 'desc' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<Dashboard>('/api/admin/intraday-validation', { cache: 'no-store' });
      setDashboard(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Gagal memuat dashboard', true));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (action: ActionName, payload: Record<string, unknown> = {}) => {
      setBusy(action);
      setActionMessage(null);
      try {
        const data = await apiRequest<ActionResult>('/api/admin/intraday-validation/actions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }),
        });
        if (action === 'threshold_simulation') setThresholdSim(data as ThresholdSimulationResult);
        else if (action === 'weight_proposal') setWeightProposal(data as WeightProposalResult);
        else await load();
        setActionMessage(describeActionResult(action, data));
      } catch (err) {
        setActionMessage(apiErrorMessage(err, 'Aksi gagal', true));
      } finally {
        setBusy(null);
      }
    },
    [load]
  );

  const result = dashboard?.latestRun?.result ?? null;
  const horizons = useMemo(() => result?.horizons ?? [], [result]);
  const sortedRecentSamples = useMemo(() => {
    const samples = dashboard?.recentSamples ?? [];
    const direction = sampleSort.direction === 'asc' ? 1 : -1;
    return [...samples].sort((left, right) => {
      const a = sampleSortValue(left, sampleSort.key);
      const b = sampleSortValue(right, sampleSort.key);
      const comparison = typeof a === 'string' && typeof b === 'string'
        ? a.localeCompare(b, 'id-ID')
        : Number(a) - Number(b);
      if (comparison !== 0) return comparison * direction;
      return left.ticker.localeCompare(right.ticker, 'id-ID');
    });
  }, [dashboard?.recentSamples, sampleSort]);

  const handleSampleSort = useCallback((key: SampleSortKey) => {
    setSampleSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' };
      }
      const direction = key === 'ticker' || key === 'exitReason' ? 'asc' : 'desc';
      return { key, direction };
    });
  }, []);

  return {
    dashboard,
    loading,
    error,
    busy,
    actionMessage,
    horizon,
    setHorizon,
    threshold,
    setThreshold,
    thresholdSim,
    weightProposal,
    lookbackDays,
    setLookbackDays,
    sampleSort,
    load,
    runAction,
    result,
    horizons,
    sortedRecentSamples,
    handleSampleSort,
  };
}
