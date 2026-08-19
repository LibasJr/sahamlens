'use client';

import Link from 'next/link';
import { ArrowUpRight, Calculator, ChevronRight, Newspaper } from 'lucide-react';
import PaywallModal from '@/components/PaywallModal';
import StockNewsModal from '@/components/StockNewsModal';
import { Button } from '@/components/ui';
import { FREE_LIMITS } from '@/shared/constants/limits';
import { displayDashboardTicker } from '@/components/dashboard/dashboard-analysis';

export function DashboardFooterActions(props: {
  stock: any;
  ticker: string;
  stockNews: any[];
  loadingStockNews: boolean;
  newsModalOpen: boolean;
  setNewsModalOpen: (open: boolean) => void;
  showPaywall: boolean;
  setShowPaywall: (open: boolean) => void;
  showLoginPrompt: boolean;
  setShowLoginPrompt: (open: boolean) => void;
  usedSymbolsToday: string[];
}) {
  const {
    stock, ticker, stockNews, loadingStockNews, newsModalOpen, setNewsModalOpen,
    showPaywall, setShowPaywall, showLoginPrompt, setShowLoginPrompt, usedSymbolsToday,
  } = props;
  const positive = stockNews.filter((item: any) => item.sentiment === 'POSITIF').length;
  const negative = stockNews.filter((item: any) => item.sentiment === 'NEGATIF').length;
  const neutral = stockNews.length - positive - negative;
  const overall = stockNews.length === 0 ? null : positive > negative ? 'POSITIF' : negative > positive ? 'NEGATIF' : 'NETRAL';
  const symbol = displayDashboardTicker(stock.symbol || ticker);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Button
          type="button"
          variant="bare"
          size="none"
          onClick={() => setNewsModalOpen(true)}
          className="group flex w-full items-center gap-4 rounded-lg border border-tv-border bg-tv-card p-4 text-left transition-all duration-250 ease-settle hover:border-tv-borderLight hover:shadow-2"
        >
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${overall === 'POSITIF' ? 'bg-tv-green/15 text-tv-green' : overall === 'NEGATIF' ? 'bg-tv-red/15 text-tv-red' : 'bg-tv-hover text-tv-muted'}`}>
            <Newspaper className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-sm font-semibold text-white">Sentimen Berita</h3>
            <p className="text-xs text-tv-muted">
              {loadingStockNews
                ? 'Menganalisis berita...'
                : overall === null
                  ? 'Belum ada berita spesifik untuk dianalisis'
                  : `${overall} • ${positive} positif, ${negative} negatif, ${neutral} netral dari ${stockNews.length} berita`}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-tv-muted transition-colors group-hover:text-tv-text" />
        </Button>

        <Link
          href={`/dcf?symbol=${symbol}`}
          className="group flex items-center gap-4 rounded-lg border border-tv-border bg-tv-card p-4 transition-all duration-250 ease-settle hover:border-tv-borderLight hover:shadow-2"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-tv-gold/15 text-tv-gold">
            <Calculator className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-sm font-semibold text-white">DCF Valuation</h3>
            <p className="text-xs text-tv-muted">Intrinsic Value & Margin of Safety</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-tv-muted transition-colors group-hover:text-tv-gold" />
        </Link>
      </div>

      <StockNewsModal
        open={newsModalOpen}
        onClose={() => setNewsModalOpen(false)}
        symbol={symbol}
        items={stockNews}
      />
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Limit Gratis Habis"
        body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map(displayDashboardTicker).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar scan berkala.`}
        benefits={[
          'Unlimited LensTechnical (10 filter)',
          'LensRadar scan berkala, LensConsensus & Compare Tool',
          'Watchlist & Alert unlimited',
        ]}
        secondaryLabel="Tunggu Besok"
      />
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Hasil"
        body="Analisa teknikal butuh akun gratis. Daftar untuk memakai fitur selama masa pengujian."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </>
  );
}
