'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  Compass,
  Layers,
  Percent,
  ShieldAlert,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  buildTechnicalSuite,
  type OHLCVCandle,
  type PivotMethod,
  type TechnicalSuiteResult,
} from '@/lib/technical/technical-levels';
import { useLanguage } from '@/lib/i18n';
import { apiRequest } from '@/shared/http/api-client';

interface TechnicalAnalysisSuiteProps {
  symbol: string;
}

export default function TechnicalAnalysisSuite({ symbol }: TechnicalAnalysisSuiteProps) {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const code = symbol.replace('.JK', '');

  const [candles, setCandles] = useState<OHLCVCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPivotMethod, setSelectedPivotMethod] = useState<PivotMethod>('CLASSIC');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    apiRequest<any>(`/api/public-chart/${encodeURIComponent(code)}?tf=1Y`, { signal: controller.signal })
      .then((data) => {
        if (!Array.isArray(data?.history) || data.history.length === 0) throw new Error(isEn ? 'Technical series unavailable' : 'Data teknikal belum tersedia');
        return data.history as OHLCVCandle[];
      })
      .then((history) => {
        if (!controller.signal.aborted) setCandles(history);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          setError(err?.message || (isEn ? 'Failed to compute technical levels' : 'Gagal menghitung level teknikal'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [code, isEn]);

  const suite: TechnicalSuiteResult | null = useMemo(() => {
    if (candles.length < 5) return null;
    return buildTechnicalSuite(candles);
  }, [candles]);

  function formatRp(val: number) {
    return 'Rp ' + Math.round(val).toLocaleString(isEn ? 'en-US' : 'id-ID');
  }

  // Level pivot butuh desimal untuk saham berharga rendah. Kalau dibulatkan ke rupiah
  // penuh, saham Rp 150-an dengan rentang sesi 2-3 rupiah akan menampilkan angka yang
  // sama persis di ketiga metode, sehingga tab Classic/Fibonacci/Camarilla terlihat
  // seperti tidak berfungsi padahal hitungannya memang berbeda.
  function formatLevel(val: number, reference: number) {
    const decimals = reference < 200 ? 2 : reference < 1000 ? 1 : 0;
    return (
      'Rp ' +
      val.toLocaleString(isEn ? 'en-US' : 'id-ID', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="space-y-3">
          <Skeleton variant="text" className="w-48" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (error || !suite) {
    return null;
  }

  const activePivots = suite.pivots[selectedPivotMethod];
  const { range52w, trends, patterns, tradingPlan, currentPrice, dataQuality } = suite;

  return (
    <div className="space-y-6">
      {/* 1. SECTION: PIVOT POINTS & 52-WEEK RANGE */}
      <Card padding="md" className="space-y-5 border-tv-blue/20 bg-gradient-to-br from-tv-blue/[0.03] to-tv-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tv-border pb-3">
          <div className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-tv-blue" />
            <div>
              <h3 className="font-heading text-base font-bold text-white">{t('technicalEnhance.pivotsTitle')}</h3>
              <p className="text-xs text-tv-muted">{t('technicalEnhance.pivotsSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-tv-bg p-1 rounded-xl border border-tv-border text-xs">
            {(['CLASSIC', 'FIBONACCI', 'CAMARILLA'] as PivotMethod[]).map((method) => (
              <Button variant="bare" size="none"
                key={method}
                type="button"
                onClick={() => setSelectedPivotMethod(method)}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                  selectedPivotMethod === method
                    ? 'bg-tv-blue text-white shadow-sm'
                    : 'text-tv-muted hover:text-tv-text'
                }`}
              >
                {method === 'CLASSIC'
                  ? t('technicalEnhance.classicMethod')
                  : method === 'FIBONACCI'
                  ? t('technicalEnhance.fibonacciMethod')
                  : t('technicalEnhance.camarillaMethod')}
              </Button>
            ))}
          </div>
        </div>

        {/* Penjelasan singkat metode aktif. Ketiga metode memakai titik pivot (PP) yang
            sama persis, yang berbeda hanya cara menurunkan R1-R3 dan S1-S3, jadi tanpa
            keterangan ini pembaca sulit tahu apa yang sebenarnya berubah saat ganti tab. */}
        <p className="text-xs text-tv-muted leading-relaxed -mt-1">
          {selectedPivotMethod === 'CLASSIC'
            ? t('technicalEnhance.classicDesc')
            : selectedPivotMethod === 'FIBONACCI'
            ? t('technicalEnhance.fibonacciDesc')
            : t('technicalEnhance.camarillaDesc')}
        </p>

        {/* Pivot Levels Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="p-3 bg-tv-card/60 border-tv-red/20 text-center">
            <span className="lens-meta uppercase font-bold text-tv-red">R3</span>
            <div className="text-sm font-bold font-number text-tv-text mt-1">{formatLevel(activePivots.r3, currentPrice)}</div>
          </Card>
          <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="p-3 bg-tv-card/60 border-tv-red/20 text-center">
            <span className="lens-meta uppercase font-bold text-tv-red">R2</span>
            <div className="text-sm font-bold font-number text-tv-text mt-1">{formatLevel(activePivots.r2, currentPrice)}</div>
          </Card>
          <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="p-3 bg-tv-card/60 border-tv-red/30 bg-tv-red/[0.04] text-center">
            <span className="lens-meta uppercase font-bold text-tv-red">{t('technicalEnhance.resistance1')}</span>
            <div className="text-sm font-bold font-number text-white mt-1">{formatLevel(activePivots.r1, currentPrice)}</div>
          </Card>
          <div className="p-3 rounded-xl bg-tv-blue/10 border border-tv-blue/40 text-center shadow-sm">
            <span className="lens-meta uppercase font-bold text-tv-blue">{t('technicalEnhance.pivotPoint')}</span>
            <div className="text-base font-extrabold font-number text-tv-blue mt-0.5">{formatLevel(activePivots.pp, currentPrice)}</div>
          </div>
          <div className="p-3 rounded-xl bg-tv-green/[0.04] border border-tv-green/30 text-center">
            <span className="lens-meta uppercase font-bold text-tv-green">{t('technicalEnhance.support1')}</span>
            <div className="text-sm font-bold font-number text-white mt-1">{formatLevel(activePivots.s1, currentPrice)}</div>
          </div>
          <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="p-3 bg-tv-card/60 border-tv-green/20 text-center">
            <span className="lens-meta uppercase font-bold text-tv-green">S2</span>
            <div className="text-sm font-bold font-number text-tv-text mt-1">{formatLevel(activePivots.s2, currentPrice)}</div>
          </Card>
          <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="p-3 bg-tv-card/60 border-tv-green/20 text-center">
            <span className="lens-meta uppercase font-bold text-tv-green">S3</span>
            <div className="text-sm font-bold font-number text-tv-text mt-1">{formatLevel(activePivots.s3, currentPrice)}</div>
          </Card>
        </div>

        {/* 52-Week Range Position Indicator */}
        {range52w && (
          <div className="p-3.5 rounded-xl bg-tv-bg/50 border border-tv-border space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-tv-text flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5 text-tv-yellow" />
                {t('technicalEnhance.range52wTitle')}
              </span>
              <span className="text-tv-muted">
                {t('technicalEnhance.currentPos')}{' '}
                <strong className="text-white font-number">{range52w.positionPct}%</strong>
              </span>
            </div>
            <div className="relative h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-tv-green via-tv-yellow to-tv-blue transition-all duration-700"
                style={{ width: `${range52w.positionPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between lens-meta text-tv-muted font-number">
              <span>{t('technicalEnhance.low52w')}: {formatRp(range52w.low52w)}</span>
              <span className="text-white font-bold">{formatRp(currentPrice)}</span>
              <span>{t('technicalEnhance.high52w')}: {formatRp(range52w.high52w)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* 2. SECTION: MULTI-TIMEFRAME TREND ALIGNMENT */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {trends.map((trend) => (
          <Card key={trend.timeframe} hoverable className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-tv-text uppercase tracking-wider">{trend.label}</span>
              <Badge variant={trend.status === 'BULLISH' ? 'success' : trend.status === 'BEARISH' ? 'danger' : 'neutral'}>
                {trend.status === 'BULLISH' ? (
                  <span className="flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" /> BULLISH
                  </span>
                ) : trend.status === 'BEARISH' ? (
                  <span className="flex items-center gap-1">
                    <ArrowDownRight className="h-3 w-3" /> BEARISH
                  </span>
                ) : (
                  'NEUTRAL'
                )}
              </Badge>
            </div>
            <p className="text-xs text-tv-muted leading-relaxed">{trend.detail}</p>
            <div className="pt-2 border-t border-tv-border lens-meta text-tv-muted/80 flex items-center justify-between">
              <span>Benchmark:</span>
              <span className="font-semibold text-tv-text">{trend.benchmark}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* 3. SECTION: CANDLESTICK PATTERN RECOGNITION */}
      <Card padding="md" className="space-y-4">
        <div className="flex items-center gap-2 border-b border-tv-border pb-3">
          <Sparkles className="h-5 w-5 text-tv-gold" />
          <div>
            <h3 className="font-heading text-base font-bold text-white">{t('technicalEnhance.patternsTitle')}</h3>
            <p className="text-xs text-tv-muted">{t('technicalEnhance.patternsSubtitle')}</p>
          </div>
        </div>

        {dataQuality.latestObservationPartial && (
          <div className="rounded-lg border border-tv-yellow/20 bg-tv-yellow/[0.04] px-3 py-2 lens-meta leading-relaxed text-tv-muted">
            <strong className="text-tv-yellow">{isEn ? 'Confirmation basis:' : 'Basis konfirmasi:'}</strong>{' '}
            {isEn
              ? `the live daily candle is not treated as a confirmed pattern. Patterns below are evaluated through the latest completed session${dataQuality.patternAsOf ? ` (${dataQuality.patternAsOf.slice(0, 10)})` : ''}.`
              : `daily candle sesi berjalan tidak dianggap sebagai pola terkonfirmasi. Pattern di bawah dievaluasi sampai sesi lengkap terakhir${dataQuality.patternAsOf ? ` (${dataQuality.patternAsOf.slice(0, 10)})` : ''}.`}
          </div>
        )}

        <p className="lens-meta leading-relaxed text-tv-muted/80">
          {isEn
            ? 'Pattern labels are deterministic rule-based classifications, not empirical success probabilities.'
            : 'Label pattern adalah klasifikasi rule-based deterministik, bukan probabilitas keberhasilan empiris.'}
        </p>

        {patterns.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {patterns.map((p) => (
              <div
                key={p.id}
                className={`p-3.5 rounded-xl border ${
                  p.sentiment === 'BULLISH'
                    ? 'border-tv-green/30 bg-tv-green/[0.04]'
                    : p.sentiment === 'BEARISH'
                    ? 'border-tv-red/30 bg-tv-red/[0.04]'
                    : 'border-tv-border bg-tv-hover'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-white">{p.name}</span>
                  <div className="flex items-center gap-1.5">
                    {p.volumeConfirmed && (
                      <Badge variant="info" className="lens-meta">
                        {t('technicalEnhance.volumeConfirmed')}
                      </Badge>
                    )}
                    <Badge variant={p.sentiment === 'BULLISH' ? 'success' : p.sentiment === 'BEARISH' ? 'danger' : 'neutral'}>
                      {p.sentiment}
                    </Badge>
                  </div>
                </div>
                <p className="mt-2 text-xs text-tv-muted leading-relaxed">{p.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-dashed border-tv-border bg-tv-bg/50 text-center text-xs text-tv-muted">
            {t('technicalEnhance.noPatterns')}
          </div>
        )}
      </Card>

      {/* 4. SECTION: ATR TRADING PLAN & RISK / REWARD HELPER */}
      {tradingPlan && (
        <Card padding="md" className="space-y-4 border-tv-purple/20 bg-gradient-to-br from-tv-purple/[0.04] to-tv-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-3">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-tv-purple" />
              <div>
                <h3 className="font-heading text-base font-bold text-white">{t('technicalEnhance.tradingPlanTitle')}</h3>
                <p className="text-xs text-tv-muted">{t('technicalEnhance.tradingPlanSubtitle')}</p>
              </div>
            </div>
            <Badge variant="info">
              {t('technicalEnhance.riskRewardRatio')}: {tradingPlan.riskRewardRatio}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3">
            <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="p-3.5 bg-tv-card/80 border-tv-border">
              <span className="lens-meta text-tv-muted font-medium">{t('technicalEnhance.entryZone')}</span>
              <div className="text-base font-bold font-number text-white mt-1">
                {formatRp(tradingPlan.entryZone[0])} – {formatRp(tradingPlan.entryZone[1])}
              </div>
              <span className="lens-meta text-tv-muted">Support to Current</span>
            </Card>

            <div className="p-3.5 rounded-xl bg-tv-red/[0.04] border border-tv-red/25">
              <span className="lens-meta text-tv-red font-medium">{t('technicalEnhance.stopLoss')}</span>
              <div className="text-base font-bold font-number text-tv-red mt-1">
                {formatRp(tradingPlan.stopLoss)}
              </div>
              <span className="lens-meta text-tv-muted">
                {t('technicalEnhance.riskAmount')}: -{tradingPlan.riskPct}%
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-tv-green/[0.04] border border-tv-green/25">
              <span className="lens-meta text-tv-green font-medium">{t('technicalEnhance.targetPrice1')}</span>
              <div className="text-base font-bold font-number text-tv-green mt-1">
                {formatRp(tradingPlan.targetPrice1)}
              </div>
              <span className="lens-meta text-tv-muted">
                {t('technicalEnhance.rewardAmount')}: +{tradingPlan.rewardPct1}%
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-tv-blue/[0.04] border border-tv-blue/25">
              <span className="lens-meta text-tv-blue font-medium">{t('technicalEnhance.targetPrice2')}</span>
              <div className="text-base font-bold font-number text-tv-blue mt-1">
                {formatRp(tradingPlan.targetPrice2)}
              </div>
              <span className="lens-meta text-tv-muted">
                Upside TP2: +{tradingPlan.rewardPct2}%
              </span>
            </div>
          </div>

          <p className="lens-meta text-tv-muted leading-relaxed bg-tv-bg/50 p-2.5 rounded-lg border border-tv-border">
            <span className="font-semibold text-tv-text">Catatan Volatilitas: </span>
            Nilai volatilitas 14-hari (ATR) dari sesi harian lengkap adalah <strong className="text-white font-number">{formatRp(tradingPlan.atr14)}</strong> per hari{dataQuality.atrAsOf ? ` (s.d. ${dataQuality.atrAsOf.slice(0, 10)})` : ''}. {t('technicalEnhance.planDisclaimer')}
          </p>
        </Card>
      )}
    </div>
  );
}
