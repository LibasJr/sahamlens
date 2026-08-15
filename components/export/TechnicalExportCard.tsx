import React from 'react';
import { Brain, TrendingUp, TrendingDown, Minus, Circle, type LucideIcon } from 'lucide-react';
import { getAnalyzerDirectionLabel } from '@/shared/presentation/signal-labels';

interface Agent {
  name: string;
  signal: 'BUY' | 'SELL' | 'HOLD' | 'WAIT' | string;
}

interface TechnicalExportCardProps {
  symbol: string;
  finalSuggestion: string;
  finalSuggestionTone?: 'positive' | 'negative' | 'neutral';
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

function signalIcon(signal: string): LucideIcon {
  if (signal === 'BUY') return TrendingUp;
  if (signal === 'SELL') return TrendingDown;
  if (signal === 'WAIT') return Minus;
  return Circle;
}

// Kartu export offscreen untuk /technical/[symbol] (lihat TechnicalExportSection untuk
// wiring). %BUY/SELL/HOLD = arah analyzer deterministik (dihitung di halaman teknikal,
// app/technical/[symbol]/page.tsx) - BUKAN field "Confidence" yang sudah dihapus dari
// UI (2026-08-03) karena dulu angka karangan LLM tanpa formula. Banner header
// color-block (gradient-accent) sama persis dengan FundamentalExportCard - satu sistem
// visual brand. Kartu ini TIDAK dapat tema per-sektor (beda dari kartu fundamental)
// karena CouncilDisplay tidak fetch company profile, cuma data teknikal/AI agent.
export default function TechnicalExportCard({
  symbol, finalSuggestion, finalSuggestionTone, summaryId, buyPct, sellPct, holdPct, waitPct, agents, score, exportedAt,
}: TechnicalExportCardProps) {
  const displaySymbol = symbol.replace('.JK', '');
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';
  // BUG FIX (audit label rekomendasi 2026-08-15): kelas ini dulu SELALU `text-tv-green`
  // apa pun isi finalSuggestion - kartu "SINYAL SANGAT NEGATIF" tetap tampil hijau di
  // gambar yang diekspor/dibagikan pengguna. Warna sekarang mengikuti tone kategori yang
  // sebenarnya, konsisten dengan halaman sumbernya (app/technical/[symbol]/page.tsx).
  const finalSuggestionColorClass = finalSuggestionTone === 'negative' ? 'text-tv-red'
    : finalSuggestionTone === 'neutral' ? 'text-tv-yellow'
    : 'text-tv-green';

  return (
    // lens-export-dark mengunci palet kartu ke nilai gelap apa pun tema pengguna -
    // lihat catatan panjang di app/globals.css. Tanpa itu `text-white` di sini jatuh
    // ke atas latar putih di mode terang (1,00:1) dan PNG-nya kosong.
    <div className="lens-export-dark w-[1080px] h-[1350px] bg-gradient-to-b from-tv-bg to-tv-surface text-white flex flex-col overflow-hidden">
      <div className="bg-gradient-accent px-16 py-9 flex items-center justify-between">
        <div>
          <div className="text-4xl font-heading font-extrabold text-white">SahamLens</div>
          <div className="text-sm font-mono text-white/80 uppercase tracking-wide mt-1">Laporan Teknikal</div>
        </div>
        <div className="text-xl font-mono font-bold px-5 py-2 rounded-full bg-white text-tv-accent flex items-center gap-2">
          <Brain className="w-5 h-5" />
          LensConsensus
        </div>
      </div>

      <div className="flex-1 p-16 flex flex-col justify-between">
        <div>
          <div className="mb-6">
            <div className="text-6xl font-heading font-extrabold">{displaySymbol}.JK</div>
            <div className={`text-2xl mt-2 font-mono font-bold ${finalSuggestionColorClass}`}>{finalSuggestion}</div>
            {typeof score === 'number' && (
              <div className="text-lg text-tv-muted mt-1 font-mono">Skor Komposit: {score}/100</div>
            )}
          </div>

          {summaryId && (
            <div className="text-lg text-tv-muted leading-relaxed mb-8 line-clamp-3">{summaryId}</div>
          )}

          <div className="mb-2 text-sm font-mono text-tv-muted uppercase">Arah Analyzer Teknikal</div>
          <div className="flex w-full h-4 rounded-full overflow-hidden mb-3 bg-tv-border">
            {buyPct > 0 && <div style={{ width: `${buyPct}%` }} className="bg-tv-green" />}
            {holdPct > 0 && <div style={{ width: `${holdPct}%` }} className="bg-tv-blue" />}
            {waitPct > 0 && <div style={{ width: `${waitPct}%` }} className="bg-tv-yellow" />}
            {sellPct > 0 && <div style={{ width: `${sellPct}%` }} className="bg-tv-red" />}
          </div>
          <div className="flex gap-4 text-base font-mono font-bold mb-8">
            {buyPct > 0 && <span className="text-tv-green">{buyPct}% BULLISH</span>}
            {/* text-blue-500 mentah (#3B82F6) terukur 3,68:1 - gagal AA. page.tsx sudah
                diganti ke tv-blue sejak lama, kartu ini terlewat. */}
            {holdPct > 0 && <span className="text-tv-blue">{holdPct}% NETRAL</span>}
            {waitPct > 0 && <span className="text-tv-yellow">{waitPct}% NETRAL</span>}
            {sellPct > 0 && <span className="text-tv-red">{sellPct}% BEARISH</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {agents.slice(0, 10).map((agent, idx) => {
              const SignalIcon = signalIcon(agent.signal);
              return (
                <div key={idx} className="flex items-center justify-between bg-tv-card border border-tv-border rounded-lg px-4 py-2">
                  <span className="text-sm font-bold truncate pr-2">{agent.name}</span>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border shrink-0 flex items-center gap-1 ${signalColorClass(agent.signal)}`}>
                    <SignalIcon className="w-3 h-3" />
                    {getAnalyzerDirectionLabel(agent.signal)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-xs font-mono text-tv-muted border-t border-tv-border pt-4">
          Data via SahamLens • {timeLabel}
        </div>
      </div>
    </div>
  );
}
