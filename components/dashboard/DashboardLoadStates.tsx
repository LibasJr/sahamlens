'use client';

import Header from '@/components/Header';
import PaywallModal from '@/components/PaywallModal';
import { ApiErrorHint, EmptyState, LoadingFact, PageContainer, Skeleton } from '@/components/ui';
import { FREE_LIMITS } from '@/shared/constants/limits';
import { displayDashboardTicker } from '@/components/dashboard/dashboard-analysis';

type SharedProps = {
  ticker: string;
  setTicker: (ticker: string) => void;
  analisaRemaining: number;
  isAdminUser: boolean;
};

export function DashboardLoadingState(props: SharedProps) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-tv-bg">
      <Header
        currentTicker={displayDashboardTicker(props.ticker)}
        onTickerChange={props.setTicker}
        moduleTitle="LensTechnical"
        moduleBank="LENSTECHNICAL"
        analisaRemaining={props.analisaRemaining}
        analisaTotal={FREE_LIMITS.analisaPerHari}
        isAdmin={props.isAdminUser}
      />
      <PageContainer className="space-y-4 p-4 md:p-6 lg:p-7">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-16 w-full" />)}
        </div>
        <Skeleton className="h-[320px] w-full" />
        <LoadingFact />
      </PageContainer>
    </div>
  );
}

export function DashboardEmptyState(props: SharedProps & {
  currentIsIndex: boolean;
  showLoginPrompt: boolean;
  showPaywall: boolean;
  isTrialExpired: boolean;
  usedSymbolsToday: string[];
  requestId?: string | null;
  onRetry: () => void;
  setShowLoginPrompt: (value: boolean) => void;
  setShowPaywall: (value: boolean) => void;
}) {
  const {
    ticker, setTicker, analisaRemaining, isAdminUser, currentIsIndex,
    showLoginPrompt, showPaywall, isTrialExpired, usedSymbolsToday, requestId,
    onRetry, setShowLoginPrompt, setShowPaywall,
  } = props;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-tv-bg">
      <Header
        currentTicker={displayDashboardTicker(ticker)}
        onTickerChange={setTicker}
        moduleTitle="LensTechnical"
        moduleBank="LENSTECHNICAL"
        analisaRemaining={analisaRemaining}
        analisaTotal={FREE_LIMITS.analisaPerHari}
        isAdmin={isAdminUser}
      />
      <PageContainer className="p-4 md:p-6 lg:p-7">
        {showLoginPrompt ? (
          <EmptyState
            illustration="locked"
            title="Analisa teknikal butuh akun"
            description="Daftar gratis untuk memakai seluruh fitur selama masa pengujian."
            action={{ label: 'Daftar Gratis', onClick: () => { window.location.href = '/signup'; } }}
          />
        ) : showPaywall ? (
          <EmptyState
            illustration="locked"
            title={isTrialExpired ? 'Akses akun belum tersedia' : 'Kuota analisa hari ini sudah habis'}
            description={isTrialExpired
              ? 'Silakan masuk kembali untuk melanjutkan analisa.'
              : `Kuota gratis ${FREE_LIMITS.analisaPerHari} analisa per hari sudah terpakai${usedSymbolsToday.length ? ` untuk ${usedSymbolsToday.slice(0, 3).map(displayDashboardTicker).join(', ')}` : ''}. Kuota disetel ulang besok.`}
            action={{ label: 'Lihat Paket Pro', onClick: () => setShowPaywall(true) }}
          />
        ) : (
          <EmptyState
            illustration="empty"
            title={`Data ${displayDashboardTicker(ticker)} gagal dimuat`}
            description={currentIsIndex
              ? 'Data indeks IHSG sementara tidak tersedia dari sumber data pasar. Coba lagi beberapa saat.'
              : 'Permintaan ke sumber data tidak sampai. Ini bukan berarti sahamnya bermasalah - coba lagi, atau cari emiten lain lewat kolom pencarian di atas.'}
            action={{ label: 'Coba lagi', onClick: onRetry }}
          />
        )}
        {!showLoginPrompt && !showPaywall && <ApiErrorHint requestId={requestId} className="justify-center" />}
      </PageContainer>
      <PaywallModal
        open={showPaywall}
        onClose={() => { if (!isTrialExpired) setShowPaywall(false); }}
        title={isTrialExpired ? 'Akses Akun Belum Tersedia' : 'Limit Gratis Habis'}
        body={isTrialExpired
          ? 'Silakan masuk kembali untuk melanjutkan penggunaan SahamLens.'
          : `Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map((symbol) => symbol.replace('.JK', '')).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar scan berkala.`}
        benefits={[
          'Unlimited LensTechnical (10 filter)',
          'LensRadar scan berkala, LensConsensus & Compare Tool',
          'Watchlist & Alert unlimited',
        ]}
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
    </div>
  );
}
