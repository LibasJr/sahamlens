'use client';

import React, { useEffect, useState } from 'react';
import {
  Building,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Clock,
  PieChart,
  Target,
  Users,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import { useLanguage } from '@/lib/i18n';
import { apiRequest } from '@/shared/http/api-client';

interface BrokerSummaryPanelProps {
  symbol: string;
}

function compactIdr(val: number): string {
  if (Math.abs(val) >= 1e12) return `Rp ${(val / 1e12).toFixed(2)} T`;
  if (Math.abs(val) >= 1e9) return `Rp ${(val / 1e9).toFixed(2)} M`;
  if (Math.abs(val) >= 1e6) return `Rp ${(val / 1e6).toFixed(1)} Jt`;
  return `Rp ${val.toLocaleString('id-ID')}`;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function percentLabel(value: unknown): string {
  const number = finiteNumber(value);
  return number == null ? 'N/A' : `${number}%`;
}

function signedIdrLabel(value: unknown): string {
  const number = finiteNumber(value);
  if (number == null) return 'N/A';
  return `${number >= 0 ? '+' : ''}${compactIdr(number)}`;
}

function valueTone(value: unknown): string {
  const number = finiteNumber(value);
  if (number == null) return 'text-tv-muted';
  return number >= 0 ? 'text-tv-green' : 'text-tv-red';
}

export default function BrokerSummaryPanel({ symbol }: BrokerSummaryPanelProps) {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const cleanSymbol = symbol.replace('.JK', '').toUpperCase();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    apiRequest<any>(`/api/broker-summary/${cleanSymbol}`)
      .then((json) => {
        if (isMounted) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch broker summary', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [cleanSymbol]);

  if (loading) {
    return (
      <Card padding="md" className="space-y-4 animate-pulse">
        <div className="flex justify-between items-center pb-3 border-b border-tv-border">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Card>
    );
  }

  const hasData = data && data.hasBrokerData && data.topBuyers && data.topBuyers.length > 0;
  const comp = data?.brokerComposition;
  const priceAnalysis = data?.dominantBrokerPriceAnalysis;
  const retail = data?.retailBehavior;

  return (
    <Card padding="md" className="space-y-4 border-tv-purple/20 bg-gradient-to-br from-tv-purple/[0.03] to-tv-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tv-border pb-3">
        <div className="flex items-center gap-2">
          <Building className="h-5 w-5 text-tv-purple" />
          <div>
            <h3 className="font-heading text-base font-bold text-white flex items-center gap-2">
              {isEn ? 'Broker Summary (End-of-Day)' : 'Broker Summary (End-of-Day)'}
              <span className="text-xs font-normal text-tv-muted">({cleanSymbol})</span>
            </h3>
            <p className="text-xs text-tv-muted">
              {isEn
                ? 'External-provider broker data. Source and reconciliation status are shown below.'
                : 'Data broker dari provider eksternal. Sumber dan status rekonsiliasi ditampilkan di bawah.'}
            </p>
          </div>
        </div>

        {hasData && (
          <div className="flex items-center gap-2">
            <Badge
              variant={
                data.brokerConcentrationStatus === 'BIG_ACCUMULATION' || data.brokerConcentrationStatus === 'NORMAL_ACCUMULATION'
                  ? 'success'
                  : data.brokerConcentrationStatus === 'BIG_DISTRIBUTION' || data.brokerConcentrationStatus === 'NORMAL_DISTRIBUTION'
                  ? 'danger'
                  : 'neutral'
              }
            >
              {data.brokerConcentrationStatus === 'BIG_ACCUMULATION'
                ? isEn ? 'BIG ACCUMULATION' : 'AKUMULASI MASIF'
                : data.brokerConcentrationStatus === 'NORMAL_ACCUMULATION'
                ? isEn ? 'ACCUMULATION' : 'AKUMULASI'
                : data.brokerConcentrationStatus === 'BIG_DISTRIBUTION'
                ? isEn ? 'BIG DISTRIBUTION' : 'DISTRIBUSI MASIF'
                : data.brokerConcentrationStatus === 'NORMAL_DISTRIBUTION'
                ? isEn ? 'DISTRIBUTION' : 'DISTRIBUSI'
                : isEn ? 'NEUTRAL' : 'NETRAL'}
            </Badge>
          </div>
        )}
      </div>

      {hasData && data.provenance && (
        <div className="rounded-lg border border-tv-border bg-tv-bg/60 px-3 py-2 lens-meta text-tv-muted">
          Sumber: <span className="font-semibold text-tv-text">{data.provenance.source}</span>
          {' · '}Import: {data.provenance.importedAt ? new Date(data.provenance.importedAt).toLocaleString(language === 'id' ? 'id-ID' : 'en-US') : 'N/A'}
          {' · '}Status: <span className="font-semibold text-tv-yellow">provider eksternal, belum direkonsiliasi dengan sumber primer</span>
        </div>
      )}

      {hasData ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT COLUMN: Top 5 Buyers vs Top 5 Sellers Table & Concentration (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Narrative Summary */}
            <div className="p-3 rounded-xl bg-tv-bg/70 border border-tv-border flex items-start gap-2.5 text-xs text-tv-text leading-relaxed">
              <Zap className="h-4 w-4 text-tv-yellow shrink-0 mt-0.5" />
              <p>{data.brokerConcentrationNarrative}</p>
            </div>

            {/* Top 5 Buyers vs Top 5 Sellers Table */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Top Buyers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-tv-green border-b border-tv-border pb-1.5">
                  <span className="flex items-center gap-1.5">
                    <ArrowUpRight className="h-4 w-4" /> Top 5 Net Buyers
                  </span>
                  <span className="lens-meta text-tv-muted font-normal">Total Net Buy</span>
                </div>
                <div className="space-y-1.5">
                  {data.topBuyers.map((b: any, idx: number) => (
                    <div
                      key={b.brokerCode}
                      className="flex items-center justify-between p-2 rounded-lg bg-tv-bg/50 border border-tv-border text-xs hover:border-tv-green/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-number lens-meta text-tv-muted w-3">{idx + 1}</span>
                        <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                          b.brokerCategory === 'FOREIGN'
                            ? 'bg-tv-gold/20 text-tv-gold border border-tv-gold/40'
                            : b.brokerCategory === 'RETAIL'
                            ? 'bg-tv-muted/20 text-tv-muted'
                            : 'bg-tv-card text-tv-muted border border-tv-border'
                        }`}>
                          {b.brokerCode}
                        </span>
                        <span className="lens-meta text-tv-muted">
                          {b.brokerCategory === 'FOREIGN' ? 'Asing*' : b.brokerCategory === 'RETAIL' ? 'Ritel*' : 'Unknown'}
                        </span>
                      </div>
                      <div className="text-right font-number">
                        <div className="font-bold text-tv-green">{compactIdr(b.netValue)}</div>
                        {b.avgBuyPrice != null && (
                          <div className="lens-meta text-tv-muted">@ Rp {b.avgBuyPrice.toLocaleString('id-ID')}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Sellers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-tv-red border-b border-tv-border pb-1.5">
                  <span className="flex items-center gap-1.5">
                    <ArrowDownRight className="h-4 w-4" /> Top 5 Net Sellers
                  </span>
                  <span className="lens-meta text-tv-muted font-normal">Total Net Sell</span>
                </div>
                <div className="space-y-1.5">
                  {data.topSellers.map((s: any, idx: number) => (
                    <div
                      key={s.brokerCode}
                      className="flex items-center justify-between p-2 rounded-lg bg-tv-bg/50 border border-tv-border text-xs hover:border-tv-red/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-number lens-meta text-tv-muted w-3">{idx + 1}</span>
                        <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                          s.brokerCategory === 'FOREIGN'
                            ? 'bg-tv-gold/20 text-tv-gold border border-tv-gold/40'
                            : s.brokerCategory === 'RETAIL'
                            ? 'bg-tv-muted/20 text-tv-muted'
                            : 'bg-tv-card text-tv-muted border border-tv-border'
                        }`}>
                          {s.brokerCode}
                        </span>
                        <span className="lens-meta text-tv-muted">
                          {s.brokerCategory === 'FOREIGN' ? 'Asing*' : s.brokerCategory === 'RETAIL' ? 'Ritel*' : 'Unknown'}
                        </span>
                      </div>
                      <div className="text-right font-number">
                        <div className="font-bold text-tv-red">{compactIdr(Math.abs(s.netValue))}</div>
                        {s.avgSellPrice != null && (
                          <div className="lens-meta text-tv-muted">@ Rp {s.avgSellPrice.toLocaleString('id-ID')}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Concentration Ratios */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-tv-border text-xs">
              <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="p-2.5 bg-tv-card/60 border-tv-border text-center">
                <span className="lens-meta text-tv-muted block">Konsentrasi Top 1 Broker</span>
                <span className="font-number font-bold text-white mt-1 block">
                  Beli {data.concentration.top1BuyPct}% · Jual {data.concentration.top1SellPct}%
                </span>
              </Card>
              <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="p-2.5 bg-tv-card/60 border-tv-border text-center">
                <span className="lens-meta text-tv-muted block">Konsentrasi Top 3 Broker</span>
                <span className="font-number font-bold text-white mt-1 block">
                  Beli {data.concentration.top3BuyPct}% · Jual {data.concentration.top3SellPct}%
                </span>
              </Card>
            </div>
          </div>

          {/* RIGHT COLUMN: Composition, Price Position & Retail Index (5 cols) */}
          <div className="lg:col-span-5 space-y-3.5">
            {/* 1. Komposisi Transaksi Broker */}
            <div className="p-3.5 rounded-xl bg-tv-bg/60 border border-tv-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <PieChart className="h-4 w-4 text-tv-blue" />
                  <span>Komposisi Pelaku Pasar</span>
                </div>
                <span className="lens-meta text-tv-muted">Turnover Share</span>
              </div>

              {comp && (
                <div className="space-y-2 text-xs">
                  {/* Multi-segment Bar */}
                  <div className="h-2 w-full rounded-full bg-tv-bg flex overflow-hidden">
                    <div style={{ width: `${finiteNumber(comp.foreign?.pct) ?? 0}%` }} className="bg-tv-gold" title={`Asing: ${percentLabel(comp.foreign?.pct)}`} />
                    <div style={{ width: `${finiteNumber(comp.retail?.pct) ?? 0}%` }} className="bg-tv-muted" title={`Ritel*: ${percentLabel(comp.retail?.pct)}`} />
                    <div style={{ width: `${finiteNumber(comp.unknown?.pct) ?? 0}%` }} className="bg-tv-borderLight" title={`Belum terklasifikasi: ${percentLabel(comp.unknown?.pct)}`} />
                  </div>

                  {/* Legends */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lens-meta pt-1">
                    <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="p-2 bg-tv-card/40 border-tv-border/50 text-center">
                      <div className="flex items-center justify-center gap-1 lens-meta text-tv-gold font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-tv-gold" /> Asing* ({percentLabel(comp.foreign?.pct)})
                      </div>
                      <div className={`font-number font-bold mt-1 lens-meta ${valueTone(comp.foreign?.netValue)}`}>
                        {signedIdrLabel(comp.foreign?.netValue)}
                      </div>
                    </Card>

                    <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="p-2 bg-tv-card/40 border-tv-border/50 text-center">
                      <div className="flex items-center justify-center gap-1 lens-meta text-tv-blue font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-tv-blue" /> Institusi domestik
                      </div>
                      <div className="font-number font-bold mt-1 lens-meta text-tv-muted">N/A</div>
                    </Card>

                    <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="p-2 bg-tv-card/40 border-tv-border/50 text-center">
                      <div className="flex items-center justify-center gap-1 lens-meta text-tv-muted font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-tv-muted" /> Ritel* ({percentLabel(comp.retail?.pct)})
                      </div>
                      <div className={`font-number font-bold mt-1 lens-meta ${valueTone(comp.retail?.netValue)}`}>
                        {signedIdrLabel(comp.retail?.netValue)}
                      </div>
                    </Card>
                    <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="p-2 bg-tv-card/40 border-tv-border/50 text-center">
                      <div className="flex items-center justify-center gap-1 lens-meta text-tv-muted font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-tv-borderLight" /> Unknown ({percentLabel(comp.unknown?.pct)})
                      </div>
                      <div className="font-number font-bold mt-1 lens-meta text-tv-muted">
                        {signedIdrLabel(comp.unknown?.netValue)}
                      </div>
                    </Card>
                  </div>
                  <p className="lens-meta text-tv-muted leading-relaxed">
                    * Klasifikasi Asing/Ritel berasal dari mapping internal kode broker. Institusi domestik belum dipetakan dan ditampilkan N/A; coverage terklasifikasi {percentLabel(comp.classifiedCoveragePct)}.
                  </p>
                </div>
              )}
            </div>

            {/* 2. Harga rata-rata broker dominan */}
            {priceAnalysis && (priceAnalysis.dominantBuyerAvgPrice != null || priceAnalysis.dominantSellerAvgPrice != null) && (
              <div className="p-3.5 rounded-xl bg-tv-bg/60 border border-tv-border space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <Target className="h-4 w-4 text-tv-purple" />
                    <span>Harga Rata-rata Broker Dominan</span>
                  </div>
                  <span className="lens-meta text-tv-muted">Top 3 net broker</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="p-2.5 bg-tv-card/60 border-tv-border">
                    <span className="lens-meta text-tv-muted block">Rata-rata Beli Broker Dominan</span>
                    <span className="font-number font-bold text-sm text-tv-green mt-0.5 block">
                      {priceAnalysis.dominantBuyerAvgPrice != null ? `Rp ${priceAnalysis.dominantBuyerAvgPrice.toLocaleString('id-ID')}` : 'N/A'}
                    </span>
                  </Card>
                  <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="p-2.5 bg-tv-card/60 border-tv-border">
                    <span className="lens-meta text-tv-muted block">Rata-rata Jual Broker Dominan</span>
                    <span className="font-number font-bold text-sm mt-0.5 block text-tv-red">
                      {priceAnalysis.dominantSellerAvgPrice != null ? `Rp ${priceAnalysis.dominantSellerAvgPrice.toLocaleString('id-ID')}` : 'N/A'}
                    </span>
                  </Card>
                </div>
              </div>
            )}

            {/* 3. Indeks Perilaku Ritel vs Bandar */}
            {retail && (
              <div className="p-3.5 rounded-xl bg-tv-bg/60 border border-tv-border space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <Users className="h-4 w-4 text-tv-gold" />
                    <span>Arus Broker Terklasifikasi vs Ritel*</span>
                  </div>
                  <span className={`lens-meta font-bold px-2 py-0.5 rounded ${
                    retail.status === 'PANIC_SELLING'
                      ? 'bg-tv-green/20 text-tv-green border border-tv-green/30'
                      : retail.status === 'FOMO_BUYING'
                      ? 'bg-tv-red/20 text-tv-red border border-tv-red/30'
                      : 'bg-tv-muted/20 text-tv-muted'
                  }`}>
                    {retail.status === 'PANIC_SELLING'
                      ? 'Ritel* Net Sell'
                      : retail.status === 'FOMO_BUYING'
                      ? 'Ritel* Net Buy'
                      : retail.status === 'UNAVAILABLE' ? 'Data Klasifikasi Terbatas' : 'Normal Flow'}
                  </span>
                </div>
                <p className="lens-meta text-tv-muted leading-relaxed">
                  {retail.summary}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-xl bg-tv-bg/50 border border-tv-border text-center space-y-2">
          <Clock className="h-6 w-6 text-tv-muted mx-auto" />
          <h4 className="font-bold text-sm text-tv-text">
            {isEn ? 'Broker Summary unavailable' : 'Broker Summary belum tersedia'}
          </h4>
          <p className="text-xs text-tv-muted max-w-md mx-auto leading-relaxed">
            {isEn
              ? 'No broker rows from an allowed provenance source are available for this ticker.'
              : 'Belum ada baris broker dari sumber provenance yang diizinkan untuk emiten ini. Data berlabel sumber historis yang tercemar tidak ditampilkan.'}
          </p>
        </div>
      )}
    </Card>
  );
}
