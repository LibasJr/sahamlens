'use client';

import React, { useMemo } from 'react';
import {
  Activity,
  Award,
  CheckCircle2,
  DollarSign,
  HeartPulse,
  Layers,
  Percent,
  PieChart,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  XCircle,
  CircleHelp,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  buildFundamentalHealthSuite,
  type FundamentalHealthSuiteResult,
} from '@/lib/fundamental/financial-health';
import { useLanguage } from '@/lib/i18n';

interface FundamentalHealthSuiteProps {
  fundamentals: any;
  profile: any;
  analyzers?: any[];
}

export default function FundamentalHealthSuite({
  fundamentals,
  profile,
  analyzers = [],
}: FundamentalHealthSuiteProps) {
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  const suite: FundamentalHealthSuiteResult = useMemo(() => {
    return buildFundamentalHealthSuite(fundamentals || {}, profile || {}, analyzers);
  }, [fundamentals, profile, analyzers]);

  const { piotroski, altmanZ, sectorBenchmark, dividendSafety, valuationPercentile } = suite;

  return (
    <div className="space-y-6">
      {/* 1. PIOTROSKI F-SCORE & ALTMAN Z-SCORE HEALTH CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Piotroski F-Score Card */}
        <Card padding="md" className="space-y-4 border-tv-green/20 bg-gradient-to-br from-tv-green/[0.04] to-tv-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-tv-green" />
              <div>
                <h3 className="font-heading text-base font-bold text-white">{t('fundamentalEnhance.fScoreTitle')}</h3>
                <p className="text-xs text-tv-muted">{t('fundamentalEnhance.fScoreSubtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-number text-2xl font-extrabold text-tv-green">
                {piotroski.score == null ? 'N/A' : piotroski.score}
                <span className="text-xs font-normal text-tv-muted">/{piotroski.maxScore}</span>
              </span>
              <Badge variant={piotroski.verdict === 'STRONG' ? 'success' : piotroski.verdict === 'MODERATE' ? 'info' : piotroski.verdict === 'DATA_UNAVAILABLE' ? 'neutral' : 'danger'}>
                {t(piotroski.verdictLabelKey)}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {piotroski.checks.map((check) => (
              <div
                key={check.id}
                className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                  check.passed === true
                    ? 'border-tv-green/20 bg-tv-green/[0.03]'
                    : check.passed === false
                    ? 'border-tv-red/20 bg-tv-red/[0.02]'
                    : 'border-tv-border bg-tv-bg/50 opacity-75'
                }`}
              >
                {check.passed === true ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-tv-green mt-0.5" />
                ) : check.passed === false ? (
                  <XCircle className="h-4 w-4 shrink-0 text-tv-red mt-0.5" />
                ) : (
                  <CircleHelp className="h-4 w-4 shrink-0 text-tv-muted mt-0.5" />
                )}
                <div>
                  <p className="font-semibold text-tv-text">{check.label}</p>
                  <p className="text-[10px] text-tv-muted">{check.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Altman Z-Score Card */}
        <Card padding="md" className="space-y-4 border-tv-blue/20 bg-gradient-to-br from-tv-blue/[0.04] to-tv-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-3">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-tv-blue" />
              <div>
                <h3 className="font-heading text-base font-bold text-white">{t('fundamentalEnhance.zScoreTitle')}</h3>
                <p className="text-xs text-tv-muted">{isEn ? 'Solvency & financial distress probability.' : 'Indikator ketahanan solvabilitas & risiko kesulitan finansial.'}</p>
              </div>
            </div>
            {altmanZ.score != null ? (
              <div className="flex items-center gap-2">
                <span className="font-number text-2xl font-extrabold text-tv-blue">
                  {altmanZ.score}
                </span>
                <Badge variant={altmanZ.zone === 'SAFE' ? 'success' : altmanZ.zone === 'GREY' ? 'warning' : 'danger'}>
                  {t(altmanZ.zoneLabelKey)}
                </Badge>
              </div>
            ) : (
              <Badge variant="info">{t(altmanZ.zoneLabelKey)}</Badge>
            )}
          </div>

          <div className="p-3.5 rounded-xl bg-tv-bg/60 border border-tv-border space-y-2">
            <p className="text-xs text-tv-muted leading-relaxed">{altmanZ.explanation}</p>
            {!altmanZ.isFinancialSector && (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-tv-border/60 text-center text-[10px]">
                <div className={`p-1.5 rounded ${altmanZ.zone === 'SAFE' ? 'bg-tv-green/15 text-tv-green font-bold' : 'text-tv-muted'}`}>
                  Safe: Z &gt; 2.9
                </div>
                <div className={`p-1.5 rounded ${altmanZ.zone === 'GREY' ? 'bg-tv-yellow/15 text-tv-yellow font-bold' : 'text-tv-muted'}`}>
                  Grey: 1.8 - 2.9
                </div>
                <div className={`p-1.5 rounded ${altmanZ.zone === 'DISTRESS' ? 'bg-tv-red/15 text-tv-red font-bold' : 'text-tv-muted'}`}>
                  Distress: Z &lt; 1.8
                </div>
              </div>
            )}
          </div>

          {/* Historical Valuation Percentile Bar */}
          <div className="p-3.5 rounded-xl bg-tv-card/60 border border-tv-border space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5 text-tv-yellow" />
                {t('fundamentalEnhance.valuationPercentileTitle')}
              </span>
              <span className="text-[10px] text-tv-muted">
                {valuationPercentile.pePercentile != null ? `P/E: ${valuationPercentile.pePercentile}th percentile` : 'P/E: N/A'}
              </span>
            </div>

            {valuationPercentile.pePercentile == null && (
              <p className="text-[10px] text-tv-muted">{isEn ? 'Historical P/E series is not available; no percentile is estimated.' : 'Seri historis P/E belum tersedia; persentil tidak diestimasi.'}</p>
            )}
            {valuationPercentile.pePercentile != null && (
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-tv-green via-tv-yellow to-tv-purple transition-all duration-700"
                    style={{ width: `${valuationPercentile.pePercentile}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-tv-muted">
                  <span>{isEn ? 'Undervalued (<35%)' : 'Murah (<35%)'}</span>
                  <span>{isEn ? 'Fair (50%)' : 'Rata-rata (50%)'}</span>
                  <span>{isEn ? 'Elevated (>75%)' : 'Mahal (>75%)'}</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 2. SECTOR BENCHMARK & DIVIDEND SAFETY CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sector Relative Valuation Comparison */}
        <Card padding="md" className="space-y-4 border-tv-purple/20 bg-gradient-to-br from-tv-purple/[0.04] to-tv-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-tv-purple" />
              <div>
                <h3 className="font-heading text-base font-bold text-white">{t('fundamentalEnhance.sectorBenchmarkTitle')}</h3>
                <p className="text-xs text-tv-muted">
                  {sectorBenchmark.sectorName} · {t('fundamentalEnhance.sectorBenchmarkSubtitle')}
                </p>
              </div>
            </div>
            <Badge variant={sectorBenchmark.verdict === 'ATTRACTIVE' ? 'success' : sectorBenchmark.verdict === 'FAIR' ? 'info' : sectorBenchmark.verdict === 'DATA_UNAVAILABLE' ? 'neutral' : 'warning'}>
              {sectorBenchmark.verdict === 'ATTRACTIVE'
                ? t('fundamentalEnhance.attractiveValuation')
                : sectorBenchmark.verdict === 'FAIR'
                ? t('fundamentalEnhance.fairValuation')
                : sectorBenchmark.verdict === 'DATA_UNAVAILABLE'
                ? t('fundamentalEnhance.dataUnavailable')
                : t('fundamentalEnhance.expensiveValuation')}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-tv-card/70 border border-tv-border">
              <span className="text-[11px] text-tv-muted">P/E vs Sektor</span>
              <div className="text-base font-bold font-number text-white mt-1">
                {sectorBenchmark.emitenPE != null ? `${sectorBenchmark.emitenPE.toFixed(1)}x` : 'N/A'}
                <span className="text-xs font-normal text-tv-muted ml-1.5">vs {sectorBenchmark.sectorMedianPE != null ? `${sectorBenchmark.sectorMedianPE.toFixed(1)}x` : 'N/A'}</span>
              </div>
              <span className={`text-[10px] font-bold ${
                sectorBenchmark.peDiscountPct == null ? false : sectorBenchmark.peDiscountPct <= 0 ? 'text-tv-green' : 'text-tv-red'
              }`}>
                {sectorBenchmark.peDiscountPct != null
                  ? `${sectorBenchmark.peDiscountPct > 0 ? '+' : ''}${sectorBenchmark.peDiscountPct}% ${isEn ? 'vs Median' : 'vs Median'}`
                  : 'N/A'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-tv-card/70 border border-tv-border">
              <span className="text-[11px] text-tv-muted">PBV vs Sektor</span>
              <div className="text-base font-bold font-number text-white mt-1">
                {sectorBenchmark.emitenPBV != null ? `${sectorBenchmark.emitenPBV.toFixed(2)}x` : 'N/A'}
                <span className="text-xs font-normal text-tv-muted ml-1.5">vs {sectorBenchmark.sectorMedianPBV != null ? `${sectorBenchmark.sectorMedianPBV.toFixed(2)}x` : 'N/A'}</span>
              </div>
              <span className={`text-[10px] font-bold ${
                sectorBenchmark.pbvDiscountPct == null ? false : sectorBenchmark.pbvDiscountPct <= 0 ? 'text-tv-green' : 'text-tv-red'
              }`}>
                {sectorBenchmark.pbvDiscountPct != null
                  ? `${sectorBenchmark.pbvDiscountPct > 0 ? '+' : ''}${sectorBenchmark.pbvDiscountPct}% ${isEn ? 'vs Median' : 'vs Median'}`
                  : 'N/A'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-tv-card/70 border border-tv-border">
              <span className="text-[11px] text-tv-muted">ROE vs Sektor</span>
              <div className="text-base font-bold font-number text-white mt-1">
                {sectorBenchmark.emitenROE != null ? `${sectorBenchmark.emitenROE.toFixed(1)}%` : 'N/A'}
                <span className="text-xs font-normal text-tv-muted ml-1.5">vs {sectorBenchmark.sectorMedianROE != null ? `${sectorBenchmark.sectorMedianROE.toFixed(1)}%` : 'N/A'}</span>
              </div>
              <span className={`text-[10px] font-bold ${
                sectorBenchmark.roeSpreadPct == null ? false : sectorBenchmark.roeSpreadPct >= 0 ? 'text-tv-green' : 'text-tv-red'
              }`}>
                {sectorBenchmark.roeSpreadPct != null
                  ? `${sectorBenchmark.roeSpreadPct > 0 ? '+' : ''}${sectorBenchmark.roeSpreadPct}% spread`
                  : 'N/A'}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-tv-muted">{sectorBenchmark.source ? `Sumber median: ${sectorBenchmark.source}` : (isEn ? 'No real peer median source is wired; benchmark stays unavailable.' : 'Belum ada sumber median peer nyata; benchmark tetap N/A.')}</p>
        </Card>

        {/* Dividend Safety & Coverage Card */}
        <Card padding="md" className="space-y-4 border-tv-gold/20 bg-gradient-to-br from-tv-gold/[0.04] to-tv-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-tv-gold" />
              <div>
                <h3 className="font-heading text-base font-bold text-white">{t('fundamentalEnhance.dividendSafetyTitle')}</h3>
                <p className="text-xs text-tv-muted">{isEn ? 'Payout ratio sustainability and free cash flow backing.' : 'Keberlanjutan rasio pembayaran & kecukupan kas bebas.'}</p>
              </div>
            </div>
            <Badge variant={dividendSafety.safetyRating === 'SAFE' ? 'success' : dividendSafety.safetyRating === 'MODERATE' ? 'info' : dividendSafety.safetyRating === 'CAUTION' ? 'warning' : 'neutral'}>
              {dividendSafety.safetyRating === 'SAFE'
                ? isEn ? 'SAFE PAYOUT' : 'DIVIDEN AMAN'
                : dividendSafety.safetyRating === 'MODERATE'
                ? isEn ? 'MODERATE' : 'MODERAT'
                : dividendSafety.safetyRating === 'CAUTION'
                ? isEn ? 'HIGH PAYOUT RISK' : 'RISIKO PEMANGKASAN'
                : dividendSafety.safetyRating === 'NO_DIVIDEND'
                ? isEn ? 'NO DIVIDEND' : 'TANPA DIVIDEN'
                : dividendSafety.safetyRating === 'DATA_PARTIAL'
                ? isEn ? 'PARTIAL DATA' : 'DATA PARSIAL'
                : isEn ? 'DATA N/A' : 'DATA N/A'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-tv-card/70 border border-tv-border">
              <span className="text-[11px] text-tv-muted">{t('fundamentalEnhance.dividendYield')}</span>
              <div className="text-base font-bold font-number text-tv-gold mt-1">
                {dividendSafety.dividendYieldPct != null ? `${dividendSafety.dividendYieldPct.toFixed(2)}%` : 'N/A'}
              </div>
              <span className="text-[10px] text-tv-muted">{isEn ? 'Trailing 12M' : 'Imbal hasil tahunan'}</span>
            </div>

            <div className="p-3 rounded-xl bg-tv-card/70 border border-tv-border">
              <span className="text-[11px] text-tv-muted">{t('fundamentalEnhance.payoutRatio')}</span>
              <div className="text-base font-bold font-number text-white mt-1">
                {dividendSafety.payoutRatioPct != null ? `${dividendSafety.payoutRatioPct.toFixed(1)}%` : 'N/A'}
              </div>
              <span className="text-[10px] text-tv-muted">{isEn ? 'of Net Income' : 'dari Laba Bersih'}</span>
            </div>

            <div className="p-3 rounded-xl bg-tv-card/70 border border-tv-border">
              <span className="text-[11px] text-tv-muted">{t('fundamentalEnhance.fcfCoverage')}</span>
              <div className={`text-sm font-bold font-number mt-1 ${dividendSafety.fcfPositive == null ? 'text-tv-muted' : dividendSafety.fcfPositive ? 'text-tv-green' : 'text-tv-yellow'}`}>
                {dividendSafety.fcfPositive == null ? 'N/A' : dividendSafety.fcfPositive ? (isEn ? 'FCF POSITIVE' : 'FCF POSITIF') : (isEn ? 'FCF NEGATIVE' : 'FCF NEGATIF')}
              </div>
              <span className="text-[10px] text-tv-muted">{isEn ? 'FCF sign; not dividend cash-coverage proof' : 'Tanda FCF; bukan bukti coverage pembayaran dividen'}</span>
            </div>
          </div>

          <p className="text-xs text-tv-muted leading-relaxed bg-tv-bg/50 p-2.5 rounded-lg border border-tv-border">
            {dividendSafety.narrative}
          </p>
        </Card>
      </div>
    </div>
  );
}
