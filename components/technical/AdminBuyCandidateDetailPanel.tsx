'use client';

import { Card } from '@/components/ui';
import type { PersistedDecisionSignal } from '@/modules/decision-agent';
import { mapEvidenceLabels } from '@/shared/presentation/hybrid-evidence-labels';
import { ShieldAlert, CheckCircle2, AlertCircle, Info, Sparkles } from 'lucide-react';

export function AdminBuyCandidateDetailPanel({ signal }: { signal: PersistedDecisionSignal }) {
  const isBuy = signal.action === 'BUY_CANDIDATE';
  const hybridReview = signal.hybridReview;
  const evidenceList = hybridReview ? mapEvidenceLabels(signal, hybridReview.evidenceRefs) : [];

  return (
    <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border border-tv-border bg-tv-bg/80 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tv-border pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-tv-gold" />
          <h2 className="font-heading text-sm font-bold text-tv-text">Kandidat Simulasi Keputusan AI (Khusus Admin)</h2>
          <span className="rounded bg-tv-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase text-tv-gold border border-tv-gold/30">
            ADMIN ONLY
          </span>
        </div>
        <div className="text-xs text-tv-muted font-number">
          Sinyal: <span className="font-bold text-tv-text">{signal.action}</span> · Readiness: <span className="font-bold text-tv-text">{signal.paperReadiness}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="rounded border border-tv-border bg-tv-bg p-3 space-y-1">
          <div className="text-tv-muted font-bold">AKSI & VALUASI</div>
          <div>Aksi Rule: <span className="font-bold text-tv-text">{signal.action}</span></div>
          <div>Harga Sinyal: <span className="font-number font-bold text-tv-text">Rp {signal.price.toLocaleString('id-ID')}</span></div>
          <div>Lens Score: <span className="font-number font-bold text-tv-text">{signal.lensScore.toFixed(1)}</span></div>
        </div>

        <div className="rounded border border-tv-border bg-tv-bg p-3 space-y-1">
          <div className="text-tv-muted font-bold">TARGET & RISK SETUP</div>
          {signal.riskSetup ? (
            <>
              <div>Entry / Stop: <span className="font-number text-tv-text">Rp {signal.riskSetup.entry.toLocaleString('id-ID')} / Rp {signal.riskSetup.stop.toLocaleString('id-ID')}</span></div>
              <div>Target 1 / 2: <span className="font-number text-tv-text">Rp {signal.riskSetup.target1.toLocaleString('id-ID')} / Rp {signal.riskSetup.target2.toLocaleString('id-ID')}</span></div>
              <div>Risk/Reward Ratio: <span className="font-number font-bold text-tv-text">{signal.riskSetup.riskReward.toFixed(2)}</span></div>
            </>
          ) : (
            <div className="text-tv-muted">Risk setup tidak tersedia</div>
          )}
        </div>

        <div className="rounded border border-tv-border bg-tv-bg p-3 space-y-1">
          <div className="text-tv-muted font-bold">STATUS HYBRID ANALYST</div>
          <div className="flex items-center gap-1.5 font-bold">
            {signal.hybridStatus === 'CONFIRMED' && <CheckCircle2 className="h-4 w-4 text-tv-green" />}
            {signal.hybridStatus === 'CHALLENGED' && <ShieldAlert className="h-4 w-4 text-tv-gold" />}
            {signal.hybridStatus === 'INSUFFICIENT' && <AlertCircle className="h-4 w-4 text-tv-muted" />}
            <span className={
              signal.hybridStatus === 'CONFIRMED' ? 'text-tv-green' :
              signal.hybridStatus === 'CHALLENGED' ? 'text-tv-gold' : 'text-tv-text'
            }>
              {signal.hybridStatus}
            </span>
          </div>
          {hybridReview && (
            <div className="text-[11px] text-tv-muted space-y-0.5">
              <div>Model: {hybridReview.model}</div>
              <div>Confidence: {hybridReview.confidence}</div>
            </div>
          )}
        </div>
      </div>

      {hybridReview && hybridReview.concerns.length > 0 && (
        <div className="rounded border border-tv-gold/30 bg-tv-gold/10 p-3 text-xs text-tv-gold">
          <div className="font-bold flex items-center gap-1.5 mb-1">
            <ShieldAlert className="h-3.5 w-3.5" /> Catatan Concern Hybrid Analyst:
          </div>
          <ul className="list-disc list-inside space-y-0.5">
            {hybridReview.concerns.map((concern) => (
              <li key={concern}>{concern}</li>
            ))}
          </ul>
        </div>
      )}

      {evidenceList.length > 0 && (
        <div className="rounded border border-tv-border bg-tv-bg p-3 text-xs space-y-2">
          <div className="font-bold text-tv-text flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-tv-blue" /> Evidence Aktual yang Dirujuk ({evidenceList.length}):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {evidenceList.map((item) => (
              <div key={item.ref} className="rounded border border-tv-border/60 bg-tv-bg/50 p-2 text-[11px]">
                <div className="font-bold text-tv-text">{item.label}</div>
                <div className="text-tv-muted font-number truncate" title={item.value}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] text-tv-muted flex justify-between items-center border-t border-tv-border/50 pt-2">
        <span>Grounded Second Opinion dari Decision Agent</span>
        <span>Run ID: {signal.runId.slice(0, 8)}</span>
      </div>
    </Card>
  );
}
