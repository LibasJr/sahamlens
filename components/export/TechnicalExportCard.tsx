import React from 'react';
import { Brain, TrendingUp, TrendingDown, Minus, Circle, type LucideIcon } from 'lucide-react';
import { getAnalyzerDirectionLabel } from '@/shared/presentation/signal-labels';
import { formatJakartaTime } from '@/shared/presentation/freshness-labels';

interface ExportAnalyzer {
  label: string;
  value: string | null;
  decision: string;
  confidence: number | null;
  dimension: string | null;
}

interface ExportDimension {
  dimension: string;
  weight: number;
  direction: string;
  votedAnalyzers: number;
  analyzers: string[];
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
  agents: ExportAnalyzer[];
  score?: number | null;
  exportedAt: Date;

  // Extended report fields
  coveragePct?: number | null;
  researchLabel?: string | null;
  scoreConfidence?: string | null;
  advisoryStatus?: { label: string; title: string } | null;
  freshnessLabel?: string | null;
  freshnessTone?: string | null;
  freshnessDetail?: string | null;
  dataTimestamp?: string | null;
  provider?: string | null;
  subScores?: { label: string; nilai: number | null }[];
  dimensions?: ExportDimension[];
  ringkasan?: string | null;
}

function signalColorClass(signal: string): string {
  if (signal === 'BULLISH' || signal === 'BUY') return 'bg-tv-green/20 text-tv-green border-tv-green/30';
  if (signal === 'BEARISH' || signal === 'SELL') return 'bg-tv-red/20 text-tv-red border-tv-red/30';
  if (signal === 'WAIT') return 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow/30';
  return 'bg-tv-border text-tv-muted border-tv-border';
}

function signalIcon(signal: string): LucideIcon {
  if (signal === 'BULLISH' || signal === 'BUY') return TrendingUp;
  if (signal === 'BEARISH' || signal === 'SELL') return TrendingDown;
  if (signal === 'WAIT') return Minus;
  return Circle;
}

function orNa(value: string | number | null | undefined, fallback = 'N/A'): string {
  if (value == null) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  return String(value);
}

// Kartu export offscreen untuk /technical/[symbol] (lihat TechnicalExportSection untuk
// wiring). %BUY/SELL/HOLD = arah analyzer deterministik (dihitung di halaman teknikal,
// app/technical/[symbol]/page.tsx) - BUKAN field "Confidence" yang sudah dihapus dari
// UI (2026-08-03) karena dulu angka karangan LLM tanpa formula.
//
// Perbedaan dari versi sebelumnya (h-[1350px] tetap + 10 analyzer + line-clamp):
// - Tinggi mengikuti seluruh isi: tidak ada lagi pemotongan evidence material.
// - SEMUA analyzer dan dimensi konsensus dirender utuh.
// - Field tidak tampil sebagai asumsi: dicetak N/A.
// - Waktu data pasar (Data asof) DIBEDAKAN dari waktu ekspor (Diekspor pada).
export default function TechnicalExportCard({
  symbol, finalSuggestion, finalSuggestionTone, summaryId, buyPct, sellPct, holdPct, waitPct, agents, score, exportedAt,
  coveragePct, researchLabel, scoreConfidence, advisoryStatus,
  freshnessLabel, freshnessTone, freshnessDetail, dataTimestamp, provider,
  subScores, dimensions, ringkasan,
}: TechnicalExportCardProps) {
  const displaySymbol = symbol.replace('.JK', '');
  const dieksporPada = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';
  const dataAsOf = formatJakartaTime(dataTimestamp);

  // BUG FIX (audit label rekomendasi 2026-08-15): warna mengikuti tone kategori.
  const finalSuggestionColorClass = finalSuggestionTone === 'negative' ? 'text-tv-red'
    : finalSuggestionTone === 'neutral' ? 'text-tv-yellow'
    : 'text-tv-green';

  return (
    // lens-export-dark mengunci palet kartu ke nilai gelap apa pun tema pengguna.
    // TIDAK ada h-[..px] - tinggi mengikuti seluruh isi laporan.
    <div className="lens-export-dark w-[1080px] bg-gradient-to-b from-tv-bg to-tv-surface text-white flex flex-col">
      {/* ===== HEADER ===== */}
      <div className="bg-gradient-accent px-14 py-8 flex items-center justify-between">
        <div>
          <div className="text-3xl font-heading font-extrabold text-white">SahamLens</div>
          <div className="text-xs font-mono text-white/80 uppercase tracking-wide mt-1">Laporan Teknikal Lengkap</div>
        </div>
        <div className="text-lg font-mono font-bold px-4 py-1.5 rounded-full bg-white text-tv-accent flex items-center gap-2">
          <Brain className="w-4 h-4" />
          LensConsensus
        </div>
      </div>

      <div className="flex-1 px-14 py-10 flex flex-col gap-8">
        {/* ===== IDENTITAS + HARGA + KATEGORI ===== */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-5xl font-heading font-extrabold">{displaySymbol}</div>
            <div className={`text-xl mt-1.5 font-mono font-bold ${finalSuggestionColorClass}`}>{finalSuggestion}</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-mono text-tv-muted uppercase">Skor total</div>
            <div className="text-4xl font-heading font-extrabold mt-0.5">
              {score ?? 'N/A'}{score != null && <span className="text-base font-medium text-tv-muted"> / 100</span>}
            </div>
          </div>
        </div>

        {/* ===== RINGKASAN DETERMINISTIK UTUH ===== */}
        {summaryId && (
          <div className="text-sm text-tv-muted leading-relaxed">{summaryId}</div>
        )}
        {ringkasan && ringkasan !== summaryId && (
          <div className="text-sm text-tv-muted leading-relaxed">{ringkasan}</div>
        )}

        {/* ===== SUB-SKOR ===== */}
        {subScores && subScores.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {subScores.map((bagian) => (
              <div key={bagian.label} className="rounded-lg border border-tv-border bg-tv-card p-3">
                <div className="text-xs font-mono text-tv-muted uppercase">{bagian.label}</div>
                <div className="text-2xl font-heading font-bold mt-1">
                  {bagian.nilai ?? 'N/A'}{bagian.nilai != null && <span className="text-xs font-medium text-tv-muted"> / 100</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ===== ARAH ANALYZER ===== */}
        <div>
          <div className="text-xs font-mono text-tv-muted uppercase mb-2">Arah Analyzer Teknikal</div>
          <div className="flex w-full h-4 rounded-full overflow-hidden mb-2 bg-tv-border">
            {buyPct > 0 && <div style={{ width: `${buyPct}%` }} className="bg-tv-green" />}
            {holdPct > 0 && <div style={{ width: `${holdPct}%` }} className="bg-tv-blue" />}
            {waitPct > 0 && <div style={{ width: `${waitPct}%` }} className="bg-tv-yellow" />}
            {sellPct > 0 && <div style={{ width: `${sellPct}%` }} className="bg-tv-red" />}
          </div>
          <div className="flex gap-4 text-sm font-mono font-bold">
            {buyPct > 0 && <span className="text-tv-green">{buyPct}% BULLISH</span>}
            {holdPct > 0 && <span className="text-tv-blue">{holdPct}% NETRAL</span>}
            {waitPct > 0 && <span className="text-tv-yellow">{waitPct}% NETRAL</span>}
            {sellPct > 0 && <span className="text-tv-red">{sellPct}% BEARISH</span>}
          </div>
        </div>

        {/* ===== METADATA: COVERAGE / RESEARCH / CONFIDENCE / ADVISORY ===== */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-tv-border bg-tv-card p-3">
            <div className="text-xs font-mono text-tv-muted uppercase">Kelengkapan data</div>
            <div className="text-lg font-heading font-bold mt-0.5">{coveragePct != null ? `${coveragePct}%` : 'N/A'}</div>
          </div>
          <div className="rounded-lg border border-tv-border bg-tv-card p-3">
            <div className="text-xs font-mono text-tv-muted uppercase">Status riset</div>
            <div className="text-lg font-heading font-bold mt-0.5">{orNa(researchLabel)}</div>
          </div>
          <div className="rounded-lg border border-tv-border bg-tv-card p-3">
            <div className="text-xs font-mono text-tv-muted uppercase">Keyakinan skor</div>
            <div className="text-lg font-heading font-bold mt-0.5">{orNa(scoreConfidence)}</div>
          </div>
          <div className="rounded-lg border border-tv-border bg-tv-card p-3">
            <div className="text-xs font-mono text-tv-muted uppercase">Advisory</div>
            <div className="text-lg font-heading font-bold mt-0.5">{advisoryStatus?.label ?? 'N/A'}</div>
          </div>
        </div>

        {/* ===== KESEGARAN DATA ===== */}
        <div className="rounded-lg border border-tv-border bg-tv-card p-3 flex flex-col gap-1">
          <div className="text-xs font-mono text-tv-muted uppercase">Kesegaran data</div>
          <div className={`text-lg font-heading font-bold ${freshnessTone ?? ''}`}>
            {freshnessLabel ?? 'N/A'}
          </div>
          {freshnessDetail && (
            <div className="text-sm text-tv-muted">{freshnessDetail}</div>
          )}
          <div className="text-xs text-tv-muted mt-1">
            Data as of: <span className="font-mono">{dataAsOf ?? 'N/A'}</span>
            {provider && <span className="ml-3">Provider: <span className="font-mono">{provider}</span></span>}
          </div>
        </div>

        {/* ===== SEMUA ANALYZER (nama + arah + evidence/detail) ===== */}
        <div>
          <div className="text-xs font-mono text-tv-muted uppercase mb-2">Semua Analyzer ({agents.length})</div>
          <div className="grid grid-cols-2 gap-2">
            {agents.map((agent, idx) => {
              const arah = agent.decision === 'BULLISH' || agent.decision === 'BUY' ? 'BULLISH'
                : agent.decision === 'BEARISH' || agent.decision === 'SELL' ? 'BEARISH'
                : 'NEUTRAL';
              const SignalIcon = signalIcon(arah);
              return (
                <div key={idx} className="flex items-center justify-between bg-tv-card border border-tv-border rounded-lg px-3 py-2 gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{agent.label}</div>
                    <div className="text-xs text-tv-muted truncate">{agent.value ?? 'N/A'}</div>
                    {agent.dimension && (
                      <div className="text-xs font-mono text-tv-muted/70 mt-0.5">{agent.dimension}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end shrink-0 gap-0.5">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${signalColorClass(arah)}`}>
                      <SignalIcon className="w-3 h-3" />
                      {getAnalyzerDirectionLabel(arah)}
                    </span>
                    {typeof agent.confidence === 'number' && (
                      <span className="text-xs font-mono text-tv-muted">{agent.confidence}/100</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== SEMUA DIMENSI KONSENSI ===== */}
        {dimensions && dimensions.length > 0 && (
          <div>
            <div className="text-xs font-mono text-tv-muted uppercase mb-2">Konsensus per Dimensi ({dimensions.length})</div>
            <div className="flex flex-col gap-2">
              {dimensions.map((d, idx) => {
                const arah = d.direction === 'BULLISH' ? 'BULLISH' : d.direction === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';
                const SignalIcon = signalIcon(arah);
                return (
                  <div key={idx} className="rounded-lg border border-tv-border bg-tv-card p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border flex items-center gap-1 shrink-0 ${signalColorClass(arah)}`}>
                          <SignalIcon className="w-3 h-3" />
                          {getAnalyzerDirectionLabel(arah)}
                        </span>
                        <span className="text-sm font-bold truncate">{d.dimension}</span>
                      </div>
                      <span className="text-sm font-mono font-bold text-tv-muted shrink-0">bobot {d.weight}</span>
                    </div>
                    <div className="text-xs text-tv-muted mt-1.5">
                      {d.votedAnalyzers} analyzer berarah
                      {d.analyzers.length > 0 && (
                        <span className="ml-1">: {d.analyzers.join(', ')}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== DISCLAIMER ===== */}
        <div className="rounded-lg border border-tv-yellow/30 bg-tv-yellow/5 px-4 py-3 text-xs text-tv-yellow leading-relaxed">
          Disclaimer: Skor dan sinyal di atas adalah informasi riset deterministik dari data harga dan volume penutupan, bukan probabilitas harga atau rekomendasi transaksi. Model ini belum lolos validasi backtest out-of-sample.
        </div>
      </div>

      {/* ===== FOOTER: Diekspor pada (BEDAKAN dari Data as of) ===== */}
      <div className="px-14 py-4 border-t border-tv-border">
        <div className="flex items-center justify-between text-xs font-mono text-tv-muted">
          <span>Data via SahamLens</span>
          <span>Diekspor pada: {dieksporPada}</span>
        </div>
      </div>
    </div>
  );
}
