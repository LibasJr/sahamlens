import React from 'react';

interface Agent {
  name: string;
  signal: 'BUY' | 'SELL' | 'HOLD' | 'WAIT' | string;
}

interface TechnicalExportCardProps {
  symbol: string;
  finalSuggestion: string;
  summaryId?: string;
  buyPct: number;
  sellPct: number;
  holdPct: number;
  waitPct: number;
  agents: Agent[];
  score?: number | null;
  exportedAt: Date;
}

function signalColorClass(signal: string): string {
  if (signal === 'BUY') return 'bg-tv-green/20 text-tv-green border-tv-green/30';
  if (signal === 'SELL') return 'bg-tv-red/20 text-tv-red border-tv-red/30';
  if (signal === 'WAIT') return 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow/30';
  return 'bg-tv-border text-tv-muted border-tv-border';
}

// Kartu export offscreen untuk /technical/[symbol] (lihat TechnicalExportSection untuk
// wiring). %BUY/SELL/HOLD/WAIT = vote riil 10 agent (dihitung di CouncilDisplay,
// app/technical/[symbol]/page.tsx) - BUKAN field "Confidence" yang sudah dihapus dari
// UI (2026-08-03) karena dulu angka karangan LLM tanpa formula.
export default function TechnicalExportCard({
  symbol, finalSuggestion, summaryId, buyPct, sellPct, holdPct, waitPct, agents, score, exportedAt,
}: TechnicalExportCardProps) {
  const displaySymbol = symbol.replace('.JK', '');
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';

  return (
    <div className="w-[1080px] h-[1350px] bg-tv-bg text-white p-16 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-10">
          <div className="text-3xl font-heading font-extrabold text-tv-accent">SahamLens</div>
          <div className="text-xl font-mono font-bold px-5 py-2 rounded-full border bg-tv-hover border-tv-borderLight text-white">
            LensAI
          </div>
        </div>

        <div className="mb-6">
          <div className="text-6xl font-heading font-extrabold">{displaySymbol}.JK</div>
          <div className="text-2xl text-tv-green mt-2 font-mono font-bold">{finalSuggestion}</div>
          {typeof score === 'number' && (
            <div className="text-lg text-tv-muted mt-1 font-mono">Skor Komposit: {score}/100</div>
          )}
        </div>

        {summaryId && (
          <div className="text-lg text-tv-muted leading-relaxed mb-8 line-clamp-3">{summaryId}</div>
        )}

        <div className="mb-2 text-sm font-mono text-tv-muted uppercase">Vote 10 Agent LensAI</div>
        <div className="flex w-full h-4 rounded-full overflow-hidden mb-3 bg-tv-border">
          {buyPct > 0 && <div style={{ width: `${buyPct}%` }} className="bg-tv-green" />}
          {holdPct > 0 && <div style={{ width: `${holdPct}%` }} className="bg-blue-500" />}
          {waitPct > 0 && <div style={{ width: `${waitPct}%` }} className="bg-tv-yellow" />}
          {sellPct > 0 && <div style={{ width: `${sellPct}%` }} className="bg-tv-red" />}
        </div>
        <div className="flex gap-4 text-base font-mono font-bold mb-8">
          {buyPct > 0 && <span className="text-tv-green">{buyPct}% BUY</span>}
          {holdPct > 0 && <span className="text-blue-500">{holdPct}% HOLD</span>}
          {waitPct > 0 && <span className="text-tv-yellow">{waitPct}% WAIT</span>}
          {sellPct > 0 && <span className="text-tv-red">{sellPct}% SELL</span>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {agents.slice(0, 10).map((agent, idx) => (
            <div key={idx} className="flex items-center justify-between bg-tv-card border border-tv-border rounded-lg px-4 py-2">
              <span className="text-sm font-bold truncate pr-2">{agent.name}</span>
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border shrink-0 ${signalColorClass(agent.signal)}`}>
                {agent.signal}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs font-mono text-tv-muted border-t border-tv-border pt-4">
        Data via SahamLens • {timeLabel}
      </div>
    </div>
  );
}
