'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ShieldAlert, TrendingDown, ArrowRight, DollarSign, Activity, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { apiRequest, isApiClientError } from '@/shared/http/api-client';

interface StockRiskStressTestCardProps {
  ticker: string;
}

interface RiskAnalysisResult {
  totalWeight: number;
  portfolioBetaIhsg: number | null;
  portfolioBetaUsdIdr: number | null;
  scenarios: {
    ihsgDrop5Pct: number | null;
    ihsgDrop10Pct: number | null;
    usdIdrWeaken1Pct: number | null;
  };
  perStock: Array<{
    ticker: string;
    weight: number;
    betaIhsg: number | null;
    betaUsdIdr: number | null;
  }>;
}

export function StockRiskStressTestCard({ ticker }: StockRiskStressTestCardProps) {
  const cleanTicker = useMemo(() => {
    return ticker.replace(/\.JK$/i, '').trim().toUpperCase();
  }, [ticker]);

  const [data, setData] = useState<RiskAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isExcluded = useMemo(() => {
    return !cleanTicker || cleanTicker === 'IHSG' || cleanTicker.startsWith('^');
  }, [cleanTicker]);

  useEffect(() => {
    if (isExcluded) {
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    apiRequest<RiskAnalysisResult>('/api/risk-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolio: [{ ticker: cleanTicker, weight: 100 }],
      }),
    })
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(isApiClientError(err) ? err.message : 'Gagal memuat analisis risiko.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [cleanTicker, isExcluded]);

  const beta = data?.portfolioBetaIhsg;
  const betaUsd = data?.portfolioBetaUsdIdr;

  const betaBadge = useMemo(() => {
    if (beta == null) return null;
    if (beta < 0) return { label: 'Invers Pasar (Hedging)', color: 'text-tv-purple border-tv-purple/30 bg-tv-purple/10' };
    if (beta < 0.75) return { label: 'Defensif (Tahan Guncangan)', color: 'text-tv-green border-tv-green/30 bg-tv-green/10' };
    if (beta <= 1.25) return { label: 'Selaras Pasar (Moderate)', color: 'text-tv-blue border-tv-blue/30 bg-tv-blue/10' };
    return { label: 'Agresif (Tinggi Volatilitas)', color: 'text-tv-yellow border-tv-yellow/30 bg-tv-yellow/10' };
  }, [beta]);

  if (isExcluded) {
    return null;
  }

  const formatPct = (val: number | null | undefined) => {
    if (val == null || !Number.isFinite(val)) return '—';
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(2)}%`;
  };

  return (
    <Card
      padding="none"
      radius="2xl"
      elevation="sm"
      highlight={false}
      overflow="visible"
      className="w-full border-white/[0.075] p-5 md:p-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tv-red/10 border border-tv-red/20 text-tv-red">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>Stress-Test & Sensitivitas Pasar</span>
              <span className="font-mono text-tv-blue text-xs font-bold px-2 py-0.5 rounded bg-tv-blue/10 border border-tv-blue/20">
                {cleanTicker}
              </span>
            </h2>
            <p className="text-xs text-tv-muted">
              Estimasi dampak guncangan IHSG & kurs USD/IDR (regresi historis 1 tahun data Yahoo)
            </p>
          </div>
        </div>

        {betaBadge && (
          <span className={`inline-flex items-center self-start md:self-auto px-2.5 py-1 rounded-full text-xs font-bold border ${betaBadge.color}`}>
            {betaBadge.label}
          </span>
        )}
      </div>

      {/* Body Content */}
      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-tv-muted text-xs">
          <Activity className="h-5 w-5 animate-spin text-tv-blue" />
          <span>Menghitung beta historis dan skenario stress test...</span>
        </div>
      ) : error ? (
        <div className="py-6 flex items-center gap-3 text-xs text-tv-muted">
          <AlertTriangle className="h-4 w-4 text-tv-yellow shrink-0" />
          <span>{error}</span>
        </div>
      ) : data ? (
        <div className="mt-5 space-y-5">
          {/* 1. Nilai Beta Utama */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-tv-muted block">Beta terhadap IHSG (^JKSE)</span>
                <span className="text-xs text-tv-muted/70">Sensitivitas arah & fluktuasi indeks</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-mono font-extrabold text-white">
                  {beta != null ? beta.toFixed(2) : 'N/A'}
                </span>
                <span className="text-[11px] block font-semibold text-tv-muted">
                  {beta != null ? (beta > 1 ? '> 1.0 (Lebih liar)' : '< 1.0 (Lebih kalem)') : ''}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-tv-muted block">Beta terhadap USD/IDR</span>
                <span className="text-xs text-tv-muted/70">Korelasi saat kurs Rupiah bergerak</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-mono font-extrabold text-white">
                  {betaUsd != null ? (betaUsd > 0 ? `+${betaUsd.toFixed(2)}` : betaUsd.toFixed(2)) : 'N/A'}
                </span>
                <span className="text-[11px] block font-semibold text-tv-muted">
                  {betaUsd != null ? (betaUsd < 0 ? 'Ditekan depresiasi IDR' : 'Diuntungkan penguatan USD') : ''}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Simulasi Guncangan Pasar (Shock Scenarios) */}
          <div>
            <div className="text-[11px] font-semibold text-tv-muted uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-tv-red" />
              <span>Simulasi Skenario Guncangan (Market Shock Stress-Test)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Skenario 1 */}
              <div className="rounded-xl border border-tv-red/15 bg-tv-red/[0.03] p-3">
                <span className="text-xs font-semibold text-tv-muted block">IHSG Anjlok -5%</span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[11px] text-tv-muted">Estimasi Saham:</span>
                  <span className="text-base font-mono font-bold text-tv-red">
                    {formatPct(data.scenarios.ihsgDrop5Pct)}
                  </span>
                </div>
              </div>

              {/* Skenario 2 */}
              <div className="rounded-xl border border-tv-red/25 bg-tv-red/[0.05] p-3">
                <span className="text-xs font-semibold text-tv-muted block">IHSG Crash -10%</span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[11px] text-tv-muted">Estimasi Saham:</span>
                  <span className="text-base font-mono font-bold text-tv-red">
                    {formatPct(data.scenarios.ihsgDrop10Pct)}
                  </span>
                </div>
              </div>

              {/* Skenario 3 */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <span className="text-xs font-semibold text-tv-muted block">Rupiah Melemah +1%</span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[11px] text-tv-muted">Dampak Kurs:</span>
                  <span className={`text-base font-mono font-bold ${
                    (data.scenarios.usdIdrWeaken1Pct ?? 0) >= 0 ? 'text-tv-green' : 'text-tv-red'
                  }`}>
                    {formatPct(data.scenarios.usdIdrWeaken1Pct)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Callout & Link */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-tv-muted">
            <span className="text-[11px] text-tv-muted leading-relaxed">
              * Perhitungan menggunakan model regresi CAPM standar dari return harian penutupan pasar.
            </span>
            <Link href="/risk" className="inline-flex items-center gap-1.5 text-tv-blue hover:text-white font-semibold transition-colors shrink-0">
              <span>Uji Komposisi Portofolio Penuh</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
