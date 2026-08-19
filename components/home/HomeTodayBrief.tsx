'use client';

import Link from 'next/link';
import { ArrowRight, CircleAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge, Skeleton } from '@/components/ui';
import type { DailyPickCounts, MarketMover, MarketPulse, RadarItem } from '@/components/home/useHomeWorkspaceData';
import { useLanguage } from '@/lib/i18n';

interface HomeTodayBriefProps {
  ihsg: { price: number; changePct: number } | null;
  marketPulse: MarketPulse | null;
  dailyPicks: DailyPickCounts | null;
  radarItems: RadarItem[];
  topLosers: MarketMover[];
  loadingMarket: boolean;
  loadingMarketPulse: boolean;
  loadingRadar: boolean;
  picksLoginRequired: boolean;
  picksNeedPro: boolean;
  marketPulseLoginRequired: boolean;
  marketPulseNeedPro: boolean;
  radarStale: boolean;
}

type MarketTone = 'positive' | 'negative' | 'selective' | 'neutral';

function buildMarketRead(
  ihsg: HomeTodayBriefProps['ihsg'],
  marketPulse: MarketPulse | null,
  isEn: boolean,
): { title: string; description: string; tone: MarketTone } {
  const ihsgMove = ihsg?.changePct ?? null;
  const breadth = marketPulse?.breadth;
  const breadthRatio = breadth && breadth.total > 0 ? breadth.advancing / breadth.total : null;

  if (ihsgMove != null && breadthRatio != null) {
    if (ihsgMove >= 0.35 && breadthRatio >= 0.56) {
      return {
        title: isEn ? 'Market tone is constructive' : 'Pasar cukup positif',
        description: isEn ? 'IHSG is higher and participation is fairly broad. The next step is to choose stocks with durable evidence instead of chasing green screens.' : 'IHSG menguat dan kenaikan cukup tersebar. Fokus berikutnya adalah memilih saham dengan alasan yang tetap kuat, bukan mengejar warna hijau.',
        tone: 'positive',
      };
    }
    if (ihsgMove <= -0.35 && breadthRatio <= 0.44) {
      return {
        title: isEn ? 'The market is under pressure' : 'Pasar sedang tertekan',
        description: isEn ? 'IHSG is lower and breadth is narrow. Prioritize setup quality, liquidity, and risk limits before looking for new opportunities.' : 'IHSG melemah dan breadth ikut sempit. Prioritaskan kualitas setup, likuiditas, dan batas risiko sebelum mencari peluang baru.',
        tone: 'negative',
      };
    }
    if (ihsgMove > 0 && breadthRatio < 0.48) {
      return {
        title: isEn ? 'The advance is not broad' : 'Penguatan belum merata',
        description: isEn ? 'IHSG is positive, but fewer stocks are participating. This is better read as a selective market than a broad risk-on move.' : 'IHSG positif, tetapi lebih sedikit saham yang ikut naik. Ini biasanya lebih cocok dibaca sebagai pasar selektif daripada bullish merata.',
        tone: 'selective',
      };
    }
    if (ihsgMove < 0 && breadthRatio > 0.52) {
      return {
        title: isEn ? 'Index pressure is concentrated' : 'Tekanan indeks tidak merata',
        description: isEn ? 'IHSG is lower, but breadth is relatively healthier. Index weakness may be concentrated in larger index weights.' : 'IHSG melemah, tetapi breadth relatif lebih sehat. Pergerakan indeks kemungkinan terkonsentrasi pada saham berbobot besar.',
        tone: 'selective',
      };
    }
  }

  if (ihsgMove != null) {
    return ihsgMove >= 0
      ? { title: isEn ? 'Market tone is positive' : 'Pasar cenderung positif', description: isEn ? 'IHSG is in positive territory. Use breadth and LensRadar to check whether the strength is broad enough.' : 'IHSG berada di zona hijau. Gunakan detail breadth dan LensRadar untuk melihat apakah kekuatannya cukup merata.', tone: 'positive' }
      : { title: isEn ? 'Market tone is defensive' : 'Pasar cenderung defensif', description: isEn ? 'IHSG is in negative territory. Look for setups that remain resilient while keeping position size and risk disciplined.' : 'IHSG berada di zona merah. Cari setup yang tetap kuat sambil menjaga ukuran posisi dan risiko.', tone: 'negative' };
  }

  return {
    title: isEn ? 'Market context is being prepared' : 'Konteks pasar sedang disiapkan',
    description: isEn ? 'SahamLens is combining the index snapshot, breadth, and scan results so you get context before diving into details.' : 'SahamLens sedang menyatukan snapshot indeks, breadth, dan hasil pemindaian supaya Anda mendapat konteks sebelum membaca detail.',
    tone: 'neutral',
  };
}

const TONE_CLASS: Record<MarketTone, string> = {
  positive: 'text-tv-green',
  negative: 'text-tv-red',
  selective: 'text-tv-yellow',
  neutral: 'text-tv-text',
};

export default function HomeTodayBrief(props: HomeTodayBriefProps) {
  const {
    ihsg,
    marketPulse,
    dailyPicks,
    radarItems,
    topLosers,
    loadingMarket,
    loadingMarketPulse,
    loadingRadar,
    picksLoginRequired,
    picksNeedPro,
    marketPulseLoginRequired,
    marketPulseNeedPro,
    radarStale,
  } = props;
  const { language } = useLanguage();
  const isEn = language === 'en';

  const read = buildMarketRead(ihsg, marketPulse, isEn);
  const breadth = marketPulse?.breadth;
  const breadthPct = breadth && breadth.total > 0 ? Math.round((breadth.advancing / breadth.total) * 100) : null;
  const topOpportunity = radarItems.find((item) => !item.flagged) ?? radarItems[0] ?? null;
  const nextOpportunities = radarItems.filter((item) => item.symbol !== topOpportunity?.symbol).slice(0, 2);
  const worstMover = topLosers[0] ?? null;
  const golden = dailyPicks?.goldenCross.count ?? null;
  const dead = dailyPicks?.deadCross.count ?? null;

  const riskNotes: string[] = [];
  if (breadthPct != null && breadthPct < 45) {
    riskNotes.push(isEn ? `Only ${breadthPct}% of stocks are advancing — participation remains narrow.` : `Breadth hanya ${breadthPct}% saham menguat — partisipasi pasar masih sempit.`);
  }
  if (dead != null && golden != null && dead > golden * 1.35 && dead > 0) {
    riskNotes.push(isEn ? `${dead} Dead Cross vs ${golden} Golden Cross — more medium-term trends are weakening.` : `${dead} Dead Cross vs ${golden} Golden Cross — lebih banyak tren menengah yang melemah.`);
  }
  if (worstMover && worstMover.changePct <= -3) {
    riskNotes.push(isEn ? `${worstMover.symbol.replace('.JK', '')} is down ${Math.abs(worstMover.changePct).toFixed(2)}% and is among today's largest downside movers.` : `${worstMover.symbol.replace('.JK', '')} turun ${Math.abs(worstMover.changePct).toFixed(2)}% dan menjadi salah satu tekanan terbesar hari ini.`);
  }
  if (riskNotes.length === 0) {
    riskNotes.push(isEn ? 'No dominant market-wide pressure stands out in the available snapshot. Still check stock-specific risk.' : 'Belum ada tekanan lintas-pasar yang dominan dari snapshot yang tersedia. Tetap cek risiko spesifik tiap emiten.');
  }

  return (
    <section aria-labelledby="today-brief-title" className="border-y border-tv-border/70 py-5 sm:py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="lens-meta mb-1.5 font-bold uppercase tracking-[0.16em] text-tv-muted">{isEn ? 'Today' : 'Hari ini'}</div>
          <h2 id="today-brief-title" className={`font-heading text-xl font-bold tracking-tight sm:text-2xl ${TONE_CLASS[read.tone]}`}>
            {read.title}
          </h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-tv-muted sm:text-[15px]">{read.description}</p>
        </div>
        <Link href="/market-pulse" className="inline-flex items-center gap-1.5 text-sm font-semibold text-tv-blue hover:underline">
          {isEn ? 'Open market context' : 'Buka konteks pasar'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <div>
          <div className="grid grid-cols-3 border-y border-tv-border/60">
            <div className="py-3 pr-3">
              <div className="lens-meta font-semibold text-tv-muted">IHSG</div>
              {loadingMarket ? (
                <Skeleton variant="text" className="mt-2 h-6 w-20" />
              ) : ihsg ? (
                <>
                  <div className="mt-1 font-number text-lg font-bold text-tv-text">{Math.round(ihsg.price).toLocaleString('id-ID')}</div>
                  <div className={`mt-0.5 font-number text-xs font-semibold ${ihsg.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                    {ihsg.changePct >= 0 ? '+' : ''}{ihsg.changePct.toFixed(2)}%
                  </div>
                </>
              ) : <div className="mt-1 text-sm text-tv-muted">N/A</div>}
            </div>
            <div className="border-l border-tv-border/60 px-3 py-3">
              <div className="lens-meta font-semibold text-tv-muted">Breadth</div>
              {loadingMarketPulse ? (
                <Skeleton variant="text" className="mt-2 h-6 w-16" />
              ) : breadthPct != null ? (
                <>
                  <div className="mt-1 font-number text-lg font-bold text-tv-text">{breadthPct}%</div>
                  <div className="mt-0.5 text-xs font-medium text-tv-muted">{breadth?.advancing} {isEn ? 'up' : 'naik'} · {breadth?.declining} {isEn ? 'down' : 'turun'}</div>
                </>
              ) : (
                <div className="mt-1 text-sm text-tv-muted">{marketPulseLoginRequired ? (isEn ? 'Sign in' : 'Login') : marketPulseNeedPro ? 'Pro' : 'N/A'}</div>
              )}
            </div>
            <div className="border-l border-tv-border/60 pl-3 py-3">
              <div className="lens-meta font-semibold text-tv-muted">LensRadar</div>
              {loadingRadar ? (
                <Skeleton variant="text" className="mt-2 h-6 w-16" />
              ) : topOpportunity ? (
                <>
                  <div className="mt-1 font-number text-lg font-bold text-tv-text">{topOpportunity.finalScore}<span className="text-xs font-medium text-tv-muted">/100</span></div>
                  <div className="mt-0.5 text-xs font-medium text-tv-muted">{radarStale ? (isEn ? 'Previous session' : 'Sesi terakhir') : (isEn ? 'Today snapshot' : 'Snapshot hari ini')}</div>
                </>
              ) : (
                <div className="mt-1 text-sm text-tv-muted">{picksLoginRequired ? (isEn ? 'Sign in' : 'Login') : picksNeedPro ? 'Pro' : 'N/A'}</div>
              )}
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2.5 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-tv-blue" aria-hidden="true" />
              <h3 className="text-sm font-bold text-tv-text">{isEn ? 'Opportunities worth inspecting first' : 'Peluang yang paling layak diperiksa'}</h3>
            </div>
            {loadingRadar ? (
              <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
            ) : picksLoginRequired ? (
              <p className="text-sm text-tv-muted">{isEn ? 'Sign in to see LensRadar scan candidates.' : 'Masuk untuk melihat kandidat hasil pemindaian LensRadar.'}</p>
            ) : picksNeedPro ? (
              <p className="text-sm text-tv-muted">{isEn ? 'LensRadar is available with Pro access.' : 'LensRadar tersedia pada akses Pro.'}</p>
            ) : topOpportunity ? (
              <div className="divide-y divide-tv-border/60 border-y border-tv-border/60">
                {[topOpportunity, ...nextOpportunities].map((item) => (
                  <Link key={item.symbol} href={`/technical/${item.symbol}`} className="group flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-number text-sm font-bold text-tv-text group-hover:text-tv-blue">{item.symbol.replace('.JK', '')}</span>
                        <span className={`font-number text-xs font-semibold ${item.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                          {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
                        </span>
                        {item.flagged && <Badge variant="warning">{isEn ? 'Review' : 'Periksa'}</Badge>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-tv-muted">{item.topReasons?.[0] ?? item.signals?.[0] ?? (isEn ? 'Passed the scan threshold; open the analysis for full evidence.' : 'Lolos ambang pemindaian; buka analisis untuk bukti lengkap.')}</p>
                    </div>
                    <div className="font-number text-sm font-bold text-tv-text">{item.finalScore}<span className="text-[10px] font-medium text-tv-muted">/100</span></div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-tv-muted">{isEn ? 'No candidate is available from the current snapshot.' : 'Belum ada kandidat yang dapat ditampilkan dari snapshot saat ini.'}</p>
            )}
          </div>
        </div>

        <div className="border-l-0 border-tv-border/60 lg:border-l lg:pl-6">
          <div className="mb-3 flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-tv-yellow" aria-hidden="true" />
            <h3 className="text-sm font-bold text-tv-text">{isEn ? 'What needs attention' : 'Perlu diperhatikan'}</h3>
          </div>
          <div className="space-y-3">
            {riskNotes.slice(0, 3).map((note, index) => (
              <div key={note} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-tv-border text-[10px] font-bold text-tv-muted">{index + 1}</span>
                <p className="text-sm leading-relaxed text-tv-muted">{note}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-start gap-2 border-t border-tv-border/60 pt-4 text-xs leading-relaxed text-tv-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-tv-green" aria-hidden="true" />
            <p><span className="font-semibold text-tv-text">{isEn ? 'Insight before indicators.' : 'Insight sebelum indikator.'}</span> {isEn ? 'Open the stock to inspect technicals, fundamentals, flow, freshness, and the evidence behind this summary.' : 'Buka emiten untuk melihat technical, fundamental, flow, freshness, dan bukti yang membentuk ringkasan ini.'}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
