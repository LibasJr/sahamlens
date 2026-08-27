'use client';

import { Card, EmptyState } from '@/components/ui';
import { BucketChartSection, TTestSection } from './BucketChartSection';
import {
  FundamentalCoverageSection,
  HeadlineCardsSection,
  ObservationProgressSection,
} from './OverviewSection';
import { RobustValidationSection, OosProtocolSection } from './RobustValidationSection';
import { ScoreCalibrationSection } from './ScoreCalibrationSection';
import { ThresholdSimulatorSection } from './ThresholdSimulatorSection';
import { WeightProposalSection } from './WeightProposalSection';
import { LoadingState } from './shared-ui';
import { useCalibration } from './useCalibration';

export default function CalibrationClient() {
  const {
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
  } = useCalibration();

  if (loading) return <LoadingState />;

  if (error || !data) {
    return (
      <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border">
        <EmptyState
          illustration="empty"
          title="Kalibrasi gagal dimuat"
          description={`${error || 'Data tidak tersedia.'} Perhitungan ini membaca lens_radar_history langsung, bukan cache - kegagalan di sini berarti query-nya tidak selesai, bukan bahwa datanya kosong.`}
          action={{ label: 'Coba muat ulang', onClick: loadData }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <HeadlineCardsSection data={data} />
      <FundamentalCoverageSection data={data} />
      <ObservationProgressSection data={data} />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <BucketChartSection data={data} />
        <TTestSection data={data} baselineTotalSignals={baseline80?.totalSignals} />
      </div>

      <RobustValidationSection data={data} />
      <OosProtocolSection data={data} />
      <ScoreCalibrationSection data={data} reliabilityPoints={reliabilityPoints} />
      <ThresholdSimulatorSection
        threshold={threshold}
        setThreshold={setThreshold}
        selectedSimulation={selectedSimulation}
        baseline80={baseline80}
        thinSample={thinSample}
        hasEnoughT20={data.observationsT20 > 0}
        recommending={recommending}
        recommendation={recommendation}
        onRequestRecommendation={requestRecommendation}
      />
      <WeightProposalSection data={data} />
    </div>
  );
}
