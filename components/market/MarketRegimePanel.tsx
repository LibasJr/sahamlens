'use client';

import { Activity, BarChart3, Gauge, Info, ShieldCheck } from 'lucide-react';
import type {
  MarketRegimeIndicator,
  QuantitativeMarketRegime,
} from '@/modules/market/service/market-regime.service';
import { Card } from '@/components/ui/Card';
import { percentageLeftClass, percentageWidthClass } from '@/shared/presentation/percentage-width';
import { useLanguage } from '@/lib/i18n';

// Token, bukan hex mati. Hex-nya dulu nilai tema GELAP yang ikut terpakai di tema
// terang: terukur di atas kartu putih, #eab308 = 1,92:1 dan #22c55e = 2,28:1 - di bawah
// ambang 3:1 untuk grafis, jadi bar indikatornya praktis tidak terlihat. Token --lens-*
// punya pasangan terang yang sudah diukur (lihat matriks di globals.css).
//
// Ujung atas TIDAK lagi biru. Merah-oranye-kuning-hijau-BIRU mencampur keluarga rona:
// biru sudah punya arti lain di aplikasi ini (aksi primer, aksen aktif), sehingga
// "greed ekstrem" justru terbaca paling netral. Sekarang hijau paling pekat.
function scoreColor(score: number | null): string {
  if (score == null) return 'rgb(var(--lens-muted))';
  if (score < 20) return 'rgb(var(--lens-red))';
  if (score < 40) return 'rgb(var(--lens-warning))';
  if (score < 60) return 'rgb(var(--lens-yellow))';
  if (score < 80) return 'rgb(var(--lens-green))';
  return 'rgb(var(--lens-green-hover))';
}

function scoreBackgroundClass(score: number | null): string {
  if (score == null) return 'bg-tv-muted';
  if (score < 20) return 'bg-tv-red';
  if (score < 40) return 'bg-tv-warning';
  if (score < 60) return 'bg-tv-yellow';
  if (score < 80) return 'bg-tv-green';
  return 'bg-tv-greenHover';
}

function signalClass(signal: MarketRegimeIndicator['signal']): string {
  if (signal === 'POSITIVE') return 'text-tv-green';
  if (signal === 'NEGATIVE') return 'text-tv-red';
  if (signal === 'NEUTRAL') return 'text-tv-warning';
  return 'text-tv-muted';
}

function formatNumber(value: number | null, suffix = '', digits = 1): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }) + suffix;
}

function rawSummary(indicator: MarketRegimeIndicator, isEn: boolean): string {
  const raw = indicator.raw;
  switch (indicator.id) {
    case 'trend':
      return 'Close ' + formatNumber(raw.close, '', 0) +
        ' · MA20 ' + formatNumber(raw.ma20, '', 0) +
        ' · MA50 ' + formatNumber(raw.ma50, '', 0);
    case 'breadth':
      return formatNumber(raw.advanceShare, '%') +
        ' advance · ' + formatNumber(raw.advancing, '', 0) +
        (isEn ? ' advancing / ' : ' naik / ') + formatNumber(raw.declining, '', 0) + (isEn ? ' declining' : ' turun');
    case 'momentum':
      return '5D ' + formatNumber(raw.return5d, '%') +
        ' · 20D ' + formatNumber(raw.return20d, '%') +
        ' · RSI ' + formatNumber(raw.rsi14);
    case 'volatility':
      return 'RV20 ' + formatNumber(raw.realizedVol20d, '%') +
        ' · percentile ' + formatNumber(raw.volatilityPercentile, '%', 0);
    case 'participation':
      return 'Indeks +' + formatNumber(raw.indexPositiveShare, '%', 0) +
        ' · sektor +' + formatNumber(raw.sectorPositiveShare, '%', 0);
  }
}

function IndicatorCard({ indicator, isEn }: { indicator: MarketRegimeIndicator; isEn: boolean }) {
  const score = indicator.score;
  return (
    <div className="rounded-lg border border-tv-border bg-tv-bg/55 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-tv-muted">{indicator.label}</p>
          <p className="mt-1 text-[10px] text-tv-muted/70">{isEn ? 'Weight' : 'Bobot'} {indicator.weight}%</p>
        </div>
        <span className={'font-number text-lg font-extrabold ' + signalClass(indicator.signal)}>
          {score ?? 'N/A'}
        </span>
      </div>
      {/* 6px terlalu tipis untuk bidang berwarna yang jadi satu-satunya pembawa nilai
          di kartu ini; 8px membuatnya terbaca tanpa menggeser tata letak. */}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-tv-hover">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${scoreBackgroundClass(score)} ${percentageWidthClass(score)}`}
        />
      </div>
      <p className="mt-2 min-h-8 text-[10px] leading-relaxed text-tv-text/80">{rawSummary(indicator, isEn)}</p>
      <div className="mt-2 flex items-center justify-between border-t border-tv-border pt-2 lens-meta text-tv-muted/70">
        <span>{isEn ? 'Contribution' : 'Kontribusi'} {score == null ? '0' : indicator.contribution.toFixed(1)} {isEn ? 'points' : 'poin'}</span>
        <span>{isEn ? 'Data quality' : 'Kualitas data'} {indicator.confidence}%</span>
      </div>
    </div>
  );
}

export function MarketRegimePanel({ data }: { data: QuantitativeMarketRegime }) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const score = data.score;
  const color = scoreColor(score);
  const gaugeDegrees = ((score ?? 0) / 100) * 360;
  const asOf = new Date(data.asOf);
  const asOfLabel = Number.isNaN(asOf.getTime())
    ? (isEn ? 'time unavailable' : 'waktu tidak tersedia')
    : asOf.toLocaleString(isEn ? 'en-US' : 'id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta',
      }) + ' WIB';
  const scoreTerms = data.indicators.filter((indicator) => indicator.score != null);
  const contributionTotal = scoreTerms.reduce((sum, indicator) => sum + indicator.contribution, 0);

  return (
    <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} className="overflow-hidden border-tv-border shadow-1">
      <div className="border-b border-tv-border bg-gradient-to-r from-tv-blue/[0.09] via-transparent to-tv-green/[0.06] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {/* flex-wrap: di 320px (Android kecil / iPhone SE) ikon + judul + lencana
                tidak muat satu baris dan lencananya terpotong 16px. */}
            <div className="flex flex-wrap items-center gap-2">
              <Gauge className="h-5 w-5 text-tv-blue" />
              <h3 className="font-heading text-base font-bold text-tv-text">Market Regime / Fear-Greed Quant</h3>
              <span className="rounded-full border border-tv-blue/25 bg-tv-blue/10 px-2 py-0.5 lens-meta font-bold uppercase tracking-wide text-tv-blue">
                v1 auditable
              </span>
            </div>
            <p className="mt-1 text-[11px] text-tv-muted">
              {isEn ? 'Deterministic market-data score · not AI voting or news sentiment' : 'Skor deterministik data pasar · bukan voting AI atau sentimen berita'}
            </p>
          </div>
          <p className="text-[10px] text-tv-muted">As of {asOfLabel}</p>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[180px_1fr] lg:items-center">
          <div className="mx-auto">
            <div
              className="relative grid h-36 w-36 place-items-center rounded-full"
              style={{
                background: 'conic-gradient(' + color + ' ' + gaugeDegrees + 'deg, rgba(100,116,139,0.16) 0deg)',
              }}
              role="img"
              aria-label={'Fear Greed score ' + String(score ?? (isEn ? 'unavailable' : 'tidak tersedia')) + (isEn ? ' out of 100' : ' dari 100')}
            >
              <div className="grid h-[112px] w-[112px] place-items-center rounded-full border border-tv-border bg-tv-card text-center">
                <div>
                  <p className="font-number text-4xl font-black text-tv-text">{score ?? 'N/A'}</p>
                  <p className="lens-meta font-bold uppercase tracking-[0.12em] text-tv-muted">{isEn ? 'out of 100' : 'dari 100'}</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-tv-border bg-tv-bg px-3 py-1.5 text-sm font-bold text-tv-text">
                {isEn && data.fearGreed.code === 'DATA_LIMITED' ? 'Limited data' : data.fearGreed.label}
              </span>
              <span className="rounded-md border border-tv-blue/25 bg-tv-blue/10 px-3 py-1.5 text-sm font-bold text-tv-blue">
                {isEn ? data.regime.code.replaceAll('_', ' ') : data.regime.label}
              </span>
              <span className="rounded-md border border-tv-border bg-tv-bg px-3 py-1.5 text-[10px] font-semibold text-tv-muted">
                Posture: {data.regime.posture.replaceAll('_', ' ')}
              </span>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-tv-text/85">{isEn ? `The quantitative regime is ${data.regime.code.replaceAll('_', ' ').toLowerCase()} with a ${data.fearGreed.code.replaceAll('_', ' ').toLowerCase()} reading. Use this as market context, not as a standalone trading signal.` : data.summary}</p>
            <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-tv-muted">
              {isEn ? 'Score' : 'Skor'} {score ?? 'N/A'} = {scoreTerms.map((indicator) => `${indicator.label} ${formatNumber(indicator.contribution)} ${isEn ? 'points' : 'poin'}`).join(' + ')} = {formatNumber(contributionTotal)} {isEn ? 'points (rounded). Calculated from the same Yahoo Finance price snapshot, not dummy data or an AI prediction.' : 'poin (dibulatkan). Dihitung dari snapshot harga Yahoo Finance yang sama, bukan data dummy atau prediksi AI.'}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-tv-border bg-tv-bg/70 p-2.5">
                <p className="lens-meta uppercase tracking-wide text-tv-muted">{isEn ? 'Data quality' : 'Kualitas data'}</p>
                <p className="mt-1 font-number text-lg font-bold text-tv-text">{data.confidence}%</p>
              </div>
              <div className="rounded-md border border-tv-border bg-tv-bg/70 p-2.5">
                <p className="lens-meta uppercase tracking-wide text-tv-muted">Weight coverage</p>
                <p className="mt-1 font-number text-lg font-bold text-tv-text">{data.coverage}%</p>
              </div>
              <div className="rounded-md border border-tv-border bg-tv-bg/70 p-2.5">
                <p className="lens-meta uppercase tracking-wide text-tv-muted">History</p>
                <p className="mt-1 font-number text-lg font-bold text-tv-text">{data.dataQuality.historyDays}D</p>
              </div>
              <div className="rounded-md border border-tv-border bg-tv-bg/70 p-2.5">
                <p className="lens-meta uppercase tracking-wide text-tv-muted">Breadth sample</p>
                <p className="mt-1 font-number text-lg font-bold text-tv-text">
                  {data.dataQuality.breadthObserved}/{data.dataQuality.breadthExpected}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-tv-green" />
            <h4 className="text-sm font-bold text-tv-text">{isEn ? 'Indicator contribution' : 'Kontribusi indikator'}</h4>
          </div>
          <p className="text-[10px] text-tv-muted">
            25% trend · 25% breadth · 20% momentum · 15% volatility · 15% participation
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {data.indicators.map((indicator) => (
            <IndicatorCard key={indicator.id} indicator={indicator} isEn={isEn} />
          ))}
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full bg-gradient-to-r from-tv-red via-tv-warning to-tv-green">
          <div
            className="relative h-full w-full"
            role="img"
            aria-label={(isEn ? 'Score position on fear-greed scale: ' : 'Posisi skor pada skala fear greed: ') + String(score ?? (isEn ? 'unavailable' : 'tidak tersedia'))}
          >
            {score != null && (
              <span
                className={`absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-tv-text shadow ${percentageLeftClass(score)}`}
              />
            )}
          </div>
        </div>
        <div className="mt-1 flex justify-between lens-meta font-medium text-tv-muted">
          <span>Extreme Fear</span>
          <span>Neutral</span>
          <span>Extreme Greed</span>
        </div>

        <details className="mt-4 rounded-lg border border-tv-border bg-tv-bg/40 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-tv-text">
            <Info className="h-3.5 w-3.5 text-tv-blue" />
            {isEn ? 'Methodology and data limitations' : 'Metodologi dan batasan data'}
          </summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              {data.indicators.map((indicator) => (
                <p key={indicator.id} className="text-[10px] leading-relaxed text-tv-muted">
                  <span className="font-semibold text-tv-text">{indicator.label}:</span> {indicator.method}
                </p>
              ))}
            </div>
            <Card padding="none" radius="md" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-tv-muted">
                <ShieldCheck className="h-3.5 w-3.5 text-tv-green" />
                Guardrails
              </div>
              <ul className="space-y-1.5">
                {data.limitations.map((limitation) => (
                  <li key={limitation} className="flex gap-2 text-[10px] leading-relaxed text-tv-muted">
                    <Activity className="mt-0.5 h-3 w-3 shrink-0 text-tv-muted/60" />
                    {limitation}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </details>
      </div>
    </Card>
  );
}
