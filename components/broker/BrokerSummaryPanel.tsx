'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Building,
  CheckCircle2,
  Clock,
  Layers,
  PieChart,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useLanguage } from '@/lib/i18n';

interface BrokerSummaryPanelProps {
  symbol: string;
}

function compactIdr(val: number): string {
  if (Math.abs(val) >= 1e12) return `Rp ${(val / 1e12).toFixed(2)} T`;
  if (Math.abs(val) >= 1e9) return `Rp ${(val / 1e9).toFixed(2)} M`;
  if (Math.abs(val) >= 1e6) return `Rp ${(val / 1e6).toFixed(1)} Jt`;
  return `Rp ${val.toLocaleString('id-ID')}`;
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

    fetch(`/api/broker-summary/${cleanSymbol}`)
      .then((res) => res.json())
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </Card>
    );
  }

  const hasData = data && data.hasRealBrokerData && data.topBuyers && data.topBuyers.length > 0;

  return (
    <Card padding="md" className="space-y-4 border-tv-purple/20 bg-gradient-to-br from-tv-purple/[0.03] to-tv-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tv-border pb-3">
        <div className="flex items-center gap-2">
          <Building className="h-5 w-5 text-tv-purple" />
          <div>
            <h3 className="font-heading text-base font-bold text-white flex items-center gap-2">
              {isEn ? 'IDX Broker Summary (End-of-Day)' : 'Broker Summary BEI (End-of-Day)'}
              <span className="text-xs font-normal text-tv-muted">({cleanSymbol})</span>
            </h3>
            <p className="text-xs text-tv-muted">
              {isEn
                ? 'Official IDX post-market broker concentration & accumulation flow.'
                : 'Data resmi transaksi broker pasca-penutupan bursa & konsentrasi bandarmology.'}
            </p>
          </div>
        </div>

        {hasData && (
          <div className="flex items-center gap-2">
            <Badge
              variant={
                data.bandarmologyStatus === 'BIG_ACCUMULATION' || data.bandarmologyStatus === 'NORMAL_ACCUMULATION'
                  ? 'success'
                  : data.bandarmologyStatus === 'BIG_DISTRIBUTION' || data.bandarmologyStatus === 'NORMAL_DISTRIBUTION'
                  ? 'danger'
                  : 'neutral'
              }
            >
              {data.bandarmologyStatus === 'BIG_ACCUMULATION'
                ? isEn ? 'BIG ACCUMULATION' : 'AKUMULASI MASIF'
                : data.bandarmologyStatus === 'NORMAL_ACCUMULATION'
                ? isEn ? 'ACCUMULATION' : 'AKUMULASI'
                : data.bandarmologyStatus === 'BIG_DISTRIBUTION'
                ? isEn ? 'BIG DISTRIBUTION' : 'DISTRIBUSI MASIF'
                : data.bandarmologyStatus === 'NORMAL_DISTRIBUTION'
                ? isEn ? 'DISTRIBUTION' : 'DISTRIBUSI'
                : isEn ? 'NEUTRAL' : 'NETRAL'}
            </Badge>
          </div>
        )}
      </div>

      {hasData ? (
        <div className="space-y-4">
          {/* Narrative Summary */}
          <div className="p-3 rounded-xl bg-tv-bg/70 border border-tv-border flex items-start gap-2.5 text-xs text-tv-text leading-relaxed">
            <Zap className="h-4 w-4 text-tv-yellow shrink-0 mt-0.5" />
            <p>{data.bandarmologyNarrative}</p>
          </div>

          {/* Top 5 Buyers vs Top 5 Sellers Table */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Buyers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-tv-green border-b border-tv-border pb-1.5">
                <span className="flex items-center gap-1.5">
                  <ArrowUpRight className="h-4 w-4" /> Top 5 Net Buyers
                </span>
                <span className="text-[10px] text-tv-muted font-normal">Total Net Buy</span>
              </div>
              <div className="space-y-1.5">
                {data.topBuyers.map((b: any, idx: number) => (
                  <div
                    key={b.brokerCode}
                    className="flex items-center justify-between p-2 rounded-lg bg-tv-bg/50 border border-tv-border text-xs hover:border-tv-green/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-number text-[10px] text-tv-muted w-3">{idx + 1}</span>
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                        b.brokerCategory === 'FOREIGN'
                          ? 'bg-tv-gold/20 text-tv-gold border border-tv-gold/40'
                          : b.brokerCategory === 'RETAIL'
                          ? 'bg-tv-muted/20 text-tv-muted'
                          : 'bg-tv-blue/20 text-tv-blue border border-tv-blue/40'
                      }`}>
                        {b.brokerCode}
                      </span>
                      <span className="text-[10px] text-tv-muted">
                        {b.brokerCategory === 'FOREIGN' ? 'Asing' : b.brokerCategory === 'RETAIL' ? 'Ritel' : 'Inst.'}
                      </span>
                    </div>
                    <div className="text-right font-number">
                      <div className="font-bold text-tv-green">{compactIdr(b.netValue)}</div>
                      {b.avgBuyPrice != null && (
                        <div className="text-[10px] text-tv-muted">@ Rp {b.avgBuyPrice.toLocaleString('id-ID')}</div>
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
                <span className="text-[10px] text-tv-muted font-normal">Total Net Sell</span>
              </div>
              <div className="space-y-1.5">
                {data.topSellers.map((s: any, idx: number) => (
                  <div
                    key={s.brokerCode}
                    className="flex items-center justify-between p-2 rounded-lg bg-tv-bg/50 border border-tv-border text-xs hover:border-tv-red/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-number text-[10px] text-tv-muted w-3">{idx + 1}</span>
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                        s.brokerCategory === 'FOREIGN'
                          ? 'bg-tv-gold/20 text-tv-gold border border-tv-gold/40'
                          : s.brokerCategory === 'RETAIL'
                          ? 'bg-tv-muted/20 text-tv-muted'
                          : 'bg-tv-blue/20 text-tv-blue border border-tv-blue/40'
                      }`}>
                        {s.brokerCode}
                      </span>
                      <span className="text-[10px] text-tv-muted">
                        {s.brokerCategory === 'FOREIGN' ? 'Asing' : s.brokerCategory === 'RETAIL' ? 'Ritel' : 'Inst.'}
                      </span>
                    </div>
                    <div className="text-right font-number">
                      <div className="font-bold text-tv-red">{compactIdr(Math.abs(s.netValue))}</div>
                      {s.avgSellPrice != null && (
                        <div className="text-[10px] text-tv-muted">@ Rp {s.avgSellPrice.toLocaleString('id-ID')}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Concentration Ratios & Foreign Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-tv-border text-xs">
            <div className="p-2.5 rounded-lg bg-tv-card/60 border border-tv-border text-center">
              <span className="text-[10px] text-tv-muted block">Konsentrasi Top 1 Broker</span>
              <span className="font-number font-bold text-white mt-1 block">
                Beli {data.concentration.top1BuyPct}% · Jual {data.concentration.top1SellPct}%
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-tv-card/60 border border-tv-border text-center">
              <span className="text-[10px] text-tv-muted block">Konsentrasi Top 3 Broker</span>
              <span className="font-number font-bold text-white mt-1 block">
                Beli {data.concentration.top3BuyPct}% · Jual {data.concentration.top3SellPct}%
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-tv-card/60 border border-tv-border text-center">
              <span className="text-[10px] text-tv-muted block">Arus Net Broker Asing</span>
              <span className={`font-number font-bold mt-1 block ${
                data.foreignSummary.foreignNetValue >= 0 ? 'text-tv-green' : 'text-tv-red'
              }`}>
                {compactIdr(data.foreignSummary.foreignNetValue)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-xl bg-tv-bg/50 border border-tv-border text-center space-y-2">
          <Clock className="h-6 w-6 text-tv-muted mx-auto" />
          <h4 className="font-bold text-sm text-tv-text">
            {isEn ? 'Broker Summary End-of-Day Available Post-Market' : 'Broker Summary EOD Dirilis Pasca-Penutupan Bursa'}
          </h4>
          <p className="text-xs text-tv-muted max-w-md mx-auto leading-relaxed">
            {isEn
              ? 'In accordance with IDX post-2021 regulations, official broker transaction details are compiled and refreshed daily at 17:30 WIB.'
              : 'Sesuai regulasi penutupan kode broker BEI, data transaksi broker harian diolah dan diperbarui setiap sore hari bursa pukul 17:30 WIB.'}
          </p>
        </div>
      )}
    </Card>
  );
}
