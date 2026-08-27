'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';
import { MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION } from '@/modules/lens-radar/constants/research-status';
import { DEFAULT_SIMULATION_THRESHOLD } from './shared-ui';
import type { CalibrationDashboardData, ThresholdRecommendation } from './types';

/**
 * Semua state dan efek data-fetching untuk Calibration Lab. Perilaku SAMA PERSIS
 * dengan sebelum dipecah dari CalibrationClient.tsx (Task 7, 27 Agustus 2026) -
 * hanya dipindahkan, tidak ada logic yang diubah.
 */
export function useCalibration() {
  const [data, setData] = useState<CalibrationDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(DEFAULT_SIMULATION_THRESHOLD);
  const [recommendation, setRecommendation] = useState<ThresholdRecommendation | null>(null);
  const [recommending, setRecommending] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const json = await apiRequest<CalibrationDashboardData>('/api/admin/calibration');
      setData(json);
      setThreshold(DEFAULT_SIMULATION_THRESHOLD);
    } catch (error) {
      setError(apiErrorMessage(error, 'Gagal memuat data kalibrasi', true));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedSimulation = useMemo(() => (
    data?.thresholdSimulations.find((sim) => sim.threshold === threshold) ?? null
  ), [data, threshold]);

  const baseline80 = useMemo(() => (
    data?.thresholdSimulations.find((sim) => sim.threshold === 80) ?? null
  ), [data]);

  // ErrorBar recharts membaca OFFSET dari titiknya, bukan batas absolut. Wilson memberi
  // batas absolut, jadi selisihnya dihitung di sini - kalau tidak, batang CI akan digambar
  // dari posisi yang salah dan diagramnya berbohong secara diam-diam.
  const reliabilityPoints = useMemo(() => (
    (data?.scoreCalibration.bins ?? []).map((bin) => ({
      ...bin,
      ciOffset: [
        Math.max(0, bin.observed - bin.wilsonLow),
        Math.max(0, bin.wilsonHigh - bin.observed),
      ] as [number, number],
    }))
  ), [data]);

  // Ambang tinggi menyaring sinyal dengan cepat: di 90 jumlah sampel bisa jatuh ke satuan,
  // dan win rate 100% dari 3 sinyal tampil persis seperti edge nyata di kartu paling kiri.
  // Batasnya memakai konstanta yang sama dengan gerbang validasi lain supaya "cukup sampel"
  // berarti satu hal saja di seluruh produk.
  const thinSample = selectedSimulation != null
    && selectedSimulation.totalSignals < MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION;

  async function requestRecommendation() {
    setRecommending(true);
    setRecommendation(null);
    try {
      const json = await apiRequest<ThresholdRecommendation>('/api/admin/calibration/recommend-threshold', { method: 'POST' });
      setRecommendation(json);
      if (typeof json?.threshold === 'number') setThreshold(json.threshold);
    } catch {
      setRecommendation({
        threshold: null,
        text: 'AI belum bisa membuat rekomendasi saat ini.',
        aiGenerated: false,
        supportingSimulation: null,
        baseline80: baseline80,
      });
    } finally {
      setRecommending(false);
    }
  }

  return {
    data,
    loading,
    error,
    threshold,
    setThreshold,
    recommendation,
    recommending,
    loadData,
    selectedSimulation,
    baseline80,
    reliabilityPoints,
    thinSample,
    requestRecommendation,
  };
}
