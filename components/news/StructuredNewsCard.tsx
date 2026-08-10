'use client';

import { motion } from 'framer-motion';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui';
import { fadeUp } from '@/lib/motion';

export interface StructuredNewsCardItem {
  title: string;
  link: string;
  source: string;
  sentiment: string;
  reason: string;
  intelligence?: {
    eventType: string;
    eventLabel: string;
    affectedMetrics: string[];
    horizon: string;
    expectedImpact: {
      direction: string;
      magnitude: string;
      summary: string;
    };
    confidence: number;
    evidenceBasis: 'HEADLINE_ONLY';
  };
}

const HORIZON_LABELS: Record<string, string> = {
  IMMEDIATE: 'Segera / hari ini',
  SHORT_TERM: 'Jangka pendek',
  MEDIUM_TERM: 'Jangka menengah',
  LONG_TERM: 'Jangka panjang',
  UNDETERMINED: 'Belum ditentukan',
};

const IMPACT_LABELS: Record<string, string> = {
  POSITIVE: 'Positif',
  NEGATIVE: 'Negatif',
  MIXED: 'Campuran',
  NEUTRAL: 'Netral',
  UNCLEAR: 'Belum jelas',
};

const MAGNITUDE_LABELS: Record<string, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  UNDETERMINED: 'Belum pasti',
};

function impactTone(direction: string): string {
  if (direction === 'POSITIVE') return 'text-tv-green';
  if (direction === 'NEGATIVE') return 'text-tv-red';
  if (direction === 'MIXED') return 'text-tv-warning';
  return 'text-tv-muted';
}

function Step({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-tv-muted/70">{label}</p>
      {children}
    </div>
  );
}

function FlowArrow() {
  return (
    <ArrowRight className="mx-auto h-3.5 w-3.5 shrink-0 rotate-90 text-tv-muted/35 md:mx-1 md:mt-4 md:rotate-0" />
  );
}

export function StructuredNewsIntro({ itemCount }: { itemCount: number }) {
  const stages = ['Event', 'Affected metric', 'Horizon', 'Expected impact', 'Confidence'];
  return (
    <div className="mb-5 rounded-lg border border-tv-blue/25 bg-tv-blue/[0.055] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-sm font-bold text-tv-text">Structured Event Intelligence</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-tv-muted">
            {itemCount} berita dipetakan ke jalur dampaknya. Sentimen tetap ditampilkan sebagai informasi sekunder.
          </p>
        </div>
        <Badge variant="info">Analisis judul RSS</Badge>
      </div>
      <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:items-center">
        {stages.map((stage, index) => (
          <div key={stage} className="contents">
            <span className="rounded-md border border-tv-border bg-tv-card px-2.5 py-1.5 text-center text-[10px] font-semibold text-tv-text">
              {stage}
            </span>
            {index < stages.length - 1 && <FlowArrow />}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-tv-muted/75">
        Confidence dibatasi maksimal 75% karena sistem belum membaca isi artikel penuh. Expected impact adalah inferensi, bukan prediksi harga.
      </p>
    </div>
  );
}

export function StructuredNewsCard({
  item,
  meta,
  absoluteDate,
}: {
  item: StructuredNewsCardItem;
  meta: string[];
  absoluteDate?: string | null;
}) {
  const intelligence = item.intelligence;
  const confidence = intelligence?.confidence ?? 0;

  return (
    <motion.a
      variants={fadeUp}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.997 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg border border-tv-border bg-tv-card p-4 transition-colors hover:border-tv-borderLight hover:bg-tv-hover/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {intelligence && <Badge variant="info">{intelligence.eventLabel}</Badge>}
            <Badge variant={item.sentiment === 'POSITIF' ? 'success' : item.sentiment === 'NEGATIF' ? 'danger' : 'neutral'}>
              Sentimen {item.sentiment.toLowerCase()}
            </Badge>
          </div>
          <p className="text-sm font-semibold leading-snug text-tv-text">{item.title}</p>
          <p className="mt-1 text-xs text-tv-muted">
            {meta.join(' · ')}
            {absoluteDate && <span className="text-tv-muted/60"> · {absoluteDate}</span>}
          </p>
        </div>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-tv-muted/50 transition-colors group-hover:text-tv-muted" />
      </div>

      {intelligence ? (
        <div className="mt-4 rounded-md border border-white/[0.055] bg-tv-bg/50 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-1">
            <Step label="Event">
              <p className="text-xs font-semibold text-tv-text">{intelligence.eventLabel}</p>
            </Step>
            <FlowArrow />
            <Step label="Affected metric">
              <p className="text-xs leading-relaxed text-tv-text">{intelligence.affectedMetrics.join(', ')}</p>
            </Step>
            <FlowArrow />
            <Step label="Horizon">
              <p className="text-xs font-medium text-tv-text">
                {HORIZON_LABELS[intelligence.horizon] ?? intelligence.horizon}
              </p>
            </Step>
            <FlowArrow />
            <Step label="Expected impact">
              <p className={'text-xs font-semibold ' + impactTone(intelligence.expectedImpact.direction)}>
                {IMPACT_LABELS[intelligence.expectedImpact.direction] ?? intelligence.expectedImpact.direction}
                {' · '}
                {MAGNITUDE_LABELS[intelligence.expectedImpact.magnitude] ?? intelligence.expectedImpact.magnitude}
              </p>
            </Step>
            <FlowArrow />
            <Step label="Confidence">
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tv-hover">
                  <div
                    className={confidence >= 65 ? 'h-full bg-tv-green' : confidence >= 45 ? 'h-full bg-tv-warning' : 'h-full bg-tv-muted'}
                    style={{ width: String(confidence) + '%' }}
                  />
                </div>
                <span className="font-number text-xs font-bold text-tv-text">{confidence}%</span>
              </div>
            </Step>
          </div>
          <p className="mt-3 border-t border-tv-border pt-2 text-[11px] leading-relaxed text-tv-muted">
            {intelligence.expectedImpact.summary}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-tv-muted">Event intelligence akan tersedia setelah cache berita diperbarui.</p>
      )}

      <div className="mt-2 flex items-start justify-between gap-3">
        {item.reason && <p className="text-[10px] leading-relaxed text-tv-muted/70">Dasar sentimen: {item.reason}</p>}
        <p className="ml-auto shrink-0 text-[9px] font-medium uppercase tracking-wide text-tv-muted/50">
          Inferensi dari judul RSS
        </p>
      </div>
    </motion.a>
  );
}
