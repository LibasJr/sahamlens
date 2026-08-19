import { Button } from '@/components/ui/Button';
import { ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { RadialScoreGauge } from '@/components/ui/RadialScoreGauge';

interface DecisionScoreCardProps {
  verdict: string;
  totalScore: number | null | undefined;
  technicalScore: number | null | undefined;
  fundamentalScore: number | null | undefined;
  flowScore: number | null | undefined;
  coveragePct?: number | null;
  expanded: boolean;
  onExplain: () => void;
  onCollapse: () => void;
}

const SCORE_PARTS = [
  { key: 'technical', label: 'Technical', max: 40, color: 'bg-tv-green' },
  { key: 'fundamental', label: 'Fundamental', max: 30, color: 'bg-tv-blue' },
  { key: 'flow', label: 'Flow', max: 30, color: 'bg-tv-yellow' },
] as const;

function safeScore(value: number | null | undefined, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(0, value));
}

export default function DecisionScoreCard({
  verdict,
  totalScore,
  technicalScore,
  fundamentalScore,
  flowScore,
  coveragePct,
  expanded,
  onExplain,
  onCollapse,
}: DecisionScoreCardProps) {
  const scores = {
    technical: technicalScore,
    fundamental: fundamentalScore,
    flow: flowScore,
  };
  const safeTotal = safeScore(totalScore, 100);
  const safeCoverage = safeScore(coveragePct, 100);

  return (
    <section
      id="score-summary"
      aria-labelledby="score-summary-title"
      className="w-full rounded-2xl border border-tv-blue/25 bg-gradient-to-br from-tv-blue/10 via-tv-card to-tv-card p-5 shadow-2 md:p-6"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-tv-blue">
            <Eye className="h-4 w-4" aria-hidden="true" />
            Ringkasan SahamLens
          </div>
          <h2 id="score-summary-title" className="font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {verdict} <span className="text-tv-muted">—</span> Score {safeTotal ?? 'N/A'}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-tv-muted">
            {verdict === 'INFORMASI'
              ? 'Belum ada arah transaksi. Skor ini belum lolos validasi backtest yang dapat diaudit.'
              : verdict === 'DATA TERBATAS'
                ? 'Data belum cukup untuk menghasilkan kesimpulan yang andal.'
                : verdict === 'TIDAK LAYAK'
                  ? 'Belum lolos pemeriksaan kelayakan dan risiko data SahamLens.'
                  : 'Status berasal dari mesin keputusan SahamLens yang telah lolos pemeriksaan kelayakan.'}
          </p>
          {safeCoverage !== null && safeCoverage < 100 && (
            <p className="mt-2 text-[11px] text-tv-muted">Kelengkapan data: {safeCoverage}%</p>
          )}
        </div>

        {/* Speedometer Radial Gauge */}
        {safeTotal !== null && (
          <div className="flex justify-center shrink-0">
            <RadialScoreGauge
              score={safeTotal}
              category={verdict}
              size={150}
              label="Konsensus Komposit"
            />
          </div>
        )}

        {/* Sub-Score Breakdown Bars */}
        <div className="w-full space-y-2.5 lg:max-w-xs shrink-0">
          {SCORE_PARTS.map((part) => {
            const score = safeScore(scores[part.key], part.max);
            return (
              <div key={part.key} className="grid grid-cols-[92px_1fr_54px] items-center gap-3">
                <span className="text-xs font-medium text-tv-text">{part.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-tv-hover" aria-hidden="true">
                  {score !== null && (
                    <div
                      className={`h-full rounded-full ${part.color}`}
                      style={{ width: `${(score / part.max) * 100}%` }}
                    />
                  )}
                </div>
                <span className="text-right font-number text-sm font-bold tabular-nums text-white">
                  {score === null ? 'N/A' : `${score}/${part.max}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 border-t border-tv-border pt-4">
        <Button variant="bare" size="none"
          type="button"
          onClick={expanded ? onCollapse : onExplain}
          aria-expanded={expanded}
          aria-controls="analysis-detail"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-tv-blue/35 bg-tv-blue/15 px-4 py-2 text-sm font-bold text-tv-blue transition-colors hover:bg-tv-blue/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue"
        >
          {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          {expanded ? 'Ringkas kembali' : 'Kenapa?'}
        </Button>
      </div>
    </section>
  );
}
