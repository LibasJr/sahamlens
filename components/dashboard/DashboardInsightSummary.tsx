'use client';

import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleAlert, ShieldCheck } from 'lucide-react';
import { classifyCapTier } from '@/lib/utils/cap-tier';
import { isBlueChipConstituent } from '@/lib/utils/blue-chip-index';
import { getFlowSourceFromAnalyzers, getForeignFlowInterpretation } from '@/lib/utils/foreign-flow-interpretation';

interface DashboardInsightSummaryProps {
  data: any;
  dataFreshness: any;
  decisionPresentation: any;
}

type Factor = {
  key: 'technical' | 'fundamental' | 'flow';
  label: string;
  score: number;
  max: number;
  availableMax: number | null;
};

function factorRead(factor: Factor): { title: string; detail: string; tone: 'positive' | 'negative' | 'neutral' } {
  const denominator = factor.availableMax != null && factor.availableMax > 0 ? factor.availableMax : factor.max;
  const ratio = denominator > 0 ? factor.score / denominator : 0;
  const suffix = factor.availableMax != null && factor.availableMax > 0 && factor.availableMax < factor.max
    ? ' dari data tersedia'
    : '';
  if (ratio >= 0.72) {
    return {
      title: `${factor.label} relatif kuat`,
      detail: `${factor.score}/${Math.round(denominator)}${suffix} — menjadi salah satu penopang utama LensScore saat ini.`,
      tone: 'positive',
    };
  }
  if (ratio <= 0.45) {
    return {
      title: `${factor.label} perlu diperhatikan`,
      detail: `${factor.score}/${Math.round(denominator)}${suffix} — kontribusinya masih lebih lemah dibanding komponen lain.`,
      tone: 'negative',
    };
  }
  return {
    title: `${factor.label} masih campuran`,
    detail: `${factor.score}/${Math.round(denominator)}${suffix} — belum cukup dominan untuk menjadi penggerak utama skor.`,
    tone: 'neutral',
  };
}

const TONE = {
  positive: { icon: ArrowUpRight, className: 'text-tv-green' },
  negative: { icon: ArrowDownRight, className: 'text-tv-red' },
  neutral: { icon: ArrowRight, className: 'text-tv-muted' },
};

export function DashboardInsightSummary({ data, dataFreshness, decisionPresentation }: DashboardInsightSummaryProps) {
  if (!data?.scoring) return null;

  const factors: Factor[] = [
    { key: 'technical', label: 'Technical', score: Number(data.scoring.technical_score) || 0, max: 40, availableMax: typeof data.scoring.available_max?.technical === 'number' ? data.scoring.available_max.technical : null },
    { key: 'fundamental', label: 'Fundamental', score: Number(data.scoring.fundamental_score) || 0, max: 30, availableMax: typeof data.scoring.available_max?.fundamental === 'number' ? data.scoring.available_max.fundamental : null },
    { key: 'flow', label: 'Money flow', score: Number(data.scoring.flow_score) || 0, max: 30, availableMax: typeof data.scoring.available_max?.flow === 'number' ? data.scoring.available_max.flow : null },
  ];

  const reads = factors.map(factorRead);
  const totalScore = Number(data.scoring.total_score) || 0;
  const coveragePct = typeof data.scoring.coverage_pct === 'number' ? Math.round(data.scoring.coverage_pct) : null;
  const flowInterpretation = getForeignFlowInterpretation({
    capTier: classifyCapTier(data?.market_cap, data?.eligibility?.details?.adv20Idr),
    isLq45: isBlueChipConstituent(data?.ticker ?? data?.stock?.symbol ?? ''),
    source: getFlowSourceFromAnalyzers(data?.analyzers),
  });
  const modelValidated = data?.modelValidation?.validated === true || data?.advisoryEnabled === true;
  const lead = decisionPresentation?.actionable
    ? `LensScore ${totalScore}/100${coveragePct != null ? ` dengan coverage ${coveragePct}%` : ''} memiliki status keputusan yang actionable. Tetap periksa bukti per faktor dan batas risiko sebelum bertindak.`
    : totalScore >= 70
      ? `LensScore ${totalScore}/100${coveragePct != null ? ` dengan coverage ${coveragePct}%` : ''} terlihat kuat secara informasi, tetapi belum otomatis menjadi rekomendasi transaksi. Eligibility dan risiko tetap menentukan apakah sinyal dapat ditindaklanjuti.`
      : totalScore >= 55
        ? `LensScore ${totalScore}/100${coveragePct != null ? ` dengan coverage ${coveragePct}%` : ''} menunjukkan setup yang masih selektif. Kekuatan antar faktor belum sepenuhnya selaras.`
        : `LensScore ${totalScore}/100${coveragePct != null ? ` dengan coverage ${coveragePct}%` : ''} menunjukkan lebih banyak faktor yang belum mendukung. Prioritaskan alasan kelemahan sebelum melihat potensi upside.`;

  return (
    <section aria-labelledby="why-it-matters" className="border-y border-tv-border/70 py-4 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <div className="lens-meta mb-1 font-bold uppercase tracking-[0.16em] text-tv-muted">Ringkasan keputusan</div>
          <h2 id="why-it-matters" className="font-heading text-lg font-bold text-tv-text sm:text-xl">Yang penting dari saham ini</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-tv-muted">{lead}</p>
          {flowInterpretation.kind !== 'FOREIGN_FLOW_ACTIVE' && (
            <p className="mt-1.5 text-xs leading-relaxed text-tv-muted">
              <span className="font-semibold text-tv-text">{flowInterpretation.label}:</span> {flowInterpretation.detail}
            </p>
          )}
        </div>
        <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${modelValidated ? 'text-tv-green' : 'text-tv-muted'}`}>
          {modelValidated ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : <CircleAlert className="h-4 w-4" aria-hidden="true" />}
          {modelValidated ? 'Model tervalidasi' : 'Model riset'}
          {dataFreshness?.label ? <span className="font-normal text-tv-muted">· {dataFreshness.label}</span> : null}
        </div>
      </div>

      <div className="mt-4 grid border-y border-tv-border/60 md:grid-cols-3 md:divide-x md:divide-tv-border/60">
        {reads.map((read, index) => {
          const tone = TONE[read.tone];
          const Icon = tone.icon;
          return (
            <div key={factors[index].key} className="flex items-start gap-3 border-b border-tv-border/60 py-3 last:border-b-0 md:border-b-0 md:px-4 md:first:pl-0 md:last:pr-0">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.className}`} aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-tv-text">{read.title}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-tv-muted">{read.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
