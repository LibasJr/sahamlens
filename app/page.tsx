import Dashboard from '@/components/Dashboard';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readAiPickScores } from '@/shared/cache/ai-pick-cache';
import { rankAiPicks, type BreakoutInfo } from '@/modules/recommendation/service/ai-pick.service';
import { getLensScoreValidationStatus } from '@/modules/validation';
import { getMarketAwareTtlSec } from '@/shared/cache/ttl-policy';
import { getBrokerFlowBadges } from '@/modules/broker-flow/service/broker-summary-cache.service';

const BREAKOUT_CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

const WEBSITE_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'SahamLens',
  alternateName: 'SahamLens.id',
  url: 'https://sahamlens.id',
  inLanguage: 'id-ID',
  description: 'Screener dan analisis kuantitatif saham IDX dari rumus terbuka, dengan penjelasan AI, untuk membantu riset saham Indonesia.',
};

async function getInitialIhsg() {
  try {
    // Initial SSR snapshot only. Client-side /api/live/^JKSE still refreshes after
    // hydration using the market-aware cache policy, so this does not replace live data.
    const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EJKSE', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: getMarketAwareTtlSec() },
    });
    if (!response.ok) return null;

    const payload = await response.json();
    const meta = payload?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    const previousClose = Number(meta?.previousClose ?? meta?.chartPreviousClose);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(previousClose) || previousClose <= 0) return null;

    const pointChange = price - previousClose;
    return {
      price,
      pointChange,
      change: (pointChange / previousClose) * 100,
    };
  } catch {
    return null;
  }
}

async function getInitialLensRadar() {
  try {
    // Read existing cache only: never trigger a 109/150 ticker scan from a homepage
    // render. If cron/cache is not ready, the client route keeps its existing fallback UX.
    const scoreData = await readAiPickScores();
    if (!scoreData) return null;

    const cachedBreakout = await cacheGet<any>(BREAKOUT_CACHE_KEY);
    const breakout: BreakoutInfo = {
      breakoutSymbols: (cachedBreakout?.data || []).map((item: any) => item.symbol),
      goldenCrossSymbols: (cachedBreakout?.crossSignals?.golden || []).map((item: any) => item.symbol),
      deadCrossSymbols: (cachedBreakout?.crossSignals?.dead || []).map((item: any) => item.symbol),
    };

    const validation = getLensScoreValidationStatus();
    const rankedItems = rankAiPicks(scoreData.scores, breakout, scoreData.bearishSymbols, {
      mode: validation.validated ? 'advisory' : 'scanner',
    }).slice(0, 5);
    const brokerBadges = await getBrokerFlowBadges(rankedItems.map((item) => item.symbol));
    const items = rankedItems.map((item) => ({
      ...item,
      brokerNetValue: brokerBadges[item.symbol.replace(/\.JK$/, '')]?.netValue ?? null,
      brokerTradeDate: brokerBadges[item.symbol.replace(/\.JK$/, '')]?.tradeDate ?? null,
    }));

    return {
      items,
      computedAt: scoreData.computedAt,
      advisoryEnabled: validation.validated,
      note: validation.validated
        ? null
        : `${validation.message} Daftar LensRadar ditampilkan sebagai scanner/pantauan berbasis data real, bukan rekomendasi beli/jual.`,
    };
  } catch {
    return null;
  }
}

export default async function Home() {
  const [initialIhsg, initialLensRadar] = await Promise.all([
    getInitialIhsg(),
    getInitialLensRadar(),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(WEBSITE_STRUCTURED_DATA).replace(/</g, '\\u003c'),
        }}
      />
      <Dashboard
        initialIhsg={initialIhsg}
        initialRenderedAt={new Date().toISOString()}
        initialLensRadar={initialLensRadar}
      />
    </>
  );
}
