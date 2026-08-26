'use client';

import React, { useState, useEffect } from 'react';
import { Coins, ShieldCheck, Repeat, AlertTriangle, RefreshCw } from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';
import { Card, Input, Skeleton, EmptyState } from '@/components/ui';
import PaywallModal from '@/components/PaywallModal';
import { MONTHLY_PRICE, formatRupiah } from '@/shared/config/pricing';
import { useLanguage } from '@/lib/i18n';
import { Button as PrimitiveButton } from '@/components/ui/Button';
import { apiErrorMessage, apiRequest, isApiClientError } from '@/shared/http/api-client';
import MenuUsageGuide from '@/components/MenuUsageGuide';
import type { CompoundingYear, DividendPlanApiResponse, DividendStock } from '@/modules/fundamental/contracts';

export default function DividendPage() {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const [capital, setCapital] = useState(200_000_000);
  const [targetMonthly, setTargetMonthly] = useState(10_000_000);
  const [ticker, setTicker] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DividendPlanApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  // Catatan: kalkulator ini menghitung statistik dari universe saham dividen yang berhasil dibaca provider
  // (universe likuid, lihat modules/fundamental/service/dividend-plan.service.ts),
  // BUKAN dividend yield khusus `ticker` yang dipilih di header - input ticker di sini
  // sengaja tetap ada untuk konsistensi shell (TickerAnalysisShellProps mewajibkannya),
  // tapi tidak memengaruhi hasil simulasi di bawah.
  const fetchDividendPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiRequest<DividendPlanApiResponse>(`/api/dividend-plan?capital=${capital}&targetMonthly=${targetMonthly}`);
      setData(json);
    } catch (e) {
      // BUG FIX (2026-08-22): sebelumnya SEMUA error (termasuk 402 SUBSCRIPTION_REQUIRED
      // dari app/api/dividend-plan/route.ts) jatuh ke pesan generik "Gagal memuat..." -
      // PaywallModal di bawah sudah diimpor dan showPaywall sudah ada, tapi tidak pernah
      // di-set true. User non-Pro melihat error yang terkesan seperti kegagalan sistem,
      // bukan ajakan upgrade. Pola sama dengan app/backtest/page.tsx.
      if (isApiClientError(e) && e.code === 'SUBSCRIPTION_REQUIRED') {
        setShowPaywall(true);
      } else {
        console.error(e);
        setError(apiErrorMessage(e, 'Gagal memuat simulasi dividen', true));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Ketikan angka tidak perlu mengirim satu request untuk setiap digit. Nilai nol
    // sementara saat field dikosongkan juga bukan simulasi yang bermakna.
    if (capital <= 0 || targetMonthly < 0) return;
    const timeout = window.setTimeout(fetchDividendPlan, 500);
    return () => window.clearTimeout(timeout);
  }, [capital, targetMonthly]);

  const quant = data?.quant ?? null;
  const stocks: DividendStock[] = quant?.div_stocks ?? [];
  const schedule: CompoundingYear[] = quant?.compounding_schedule ?? [];
  const [aristocratFilter, setAristocratFilter] = useState<'all' | 'aristocrats'>('all');

  const filteredStocks = React.useMemo(() => {
    if (aristocratFilter === 'aristocrats') {
      return stocks.filter((s) => s.is_aristocrat);
    }
    return stocks;
  }, [stocks, aristocratFilter]);

  return (
    <TickerAnalysisShell
      ticker={ticker}
      onTickerChange={setTicker}
      moduleTitle="Dividend Compounding & DRIP Planner"
      moduleBank="SAHAMLENS MODEL"
      icon={<Coins className="w-6 h-6" />}
      accent="green"
      title={isEn ? 'IDX Dividend Cash Flow Simulation' : 'Simulasi Cash Flow Dividen IDX'}
      subtitle={isEn ? 'Dividend-yield and DRIP scenario from provider data; tax treatment follows applicable rules.' : 'Skenario yield dividen & DRIP dari data provider; perlakuan pajak mengikuti ketentuan yang berlaku.'}
      headerExtra={
        <div className="flex flex-wrap items-end gap-3">
      <MenuUsageGuide
        menuKey="dividend"
        whatItAnswers="Berapa arus kas dividen yang bisa diharapkan dari saham ini?"
        steps={[
          "Yield dihitung dari dividen terakhir terhadap harga sekarang.",
          "Periksa payout ratio - yield tinggi dari laba yang menipis tidak berkelanjutan.",
          "Perhatikan tanggal cum dividen; membeli setelahnya tidak mendapat dividennya.",
        ]}
      />
          <Input
            label={isEn ? 'Initial Capital (IDR)' : 'Modal Awal (IDR)'}
            type="number"
            size="sm"
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value))}
            className="w-40 font-number"
          />
          <Input
            label={isEn ? 'Monthly Target (IDR)' : 'Target Pasif/Bulan (IDR)'}
            type="number"
            size="sm"
            value={targetMonthly}
            onChange={(e) => setTargetMonthly(Number(e.target.value))}
            className="w-40 font-number"
          />
        </div>
      }
    >
      {loading && !data && (
        <div className="mb-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((item) => (
              <Card key={item} padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-4 space-y-2">
                <Skeleton variant="text" className="w-24" />
                <Skeleton className="h-7 w-32 rounded-lg" />
                <Skeleton variant="text" className="w-3/4" />
              </Card>
            ))}
          </div>
        </div>
      )}

      {!loading && error && (
        <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="mb-6 flex flex-col items-start gap-4 border-tv-red/20 bg-tv-red/[0.04] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-tv-red" />
            <p className="text-sm text-tv-red">{error}</p>
          </div>
          <PrimitiveButton variant="secondary" size="sm" type="button" onClick={fetchDividendPlan} className="inline-flex items-center gap-1.5">
            <RefreshCw className="h-4 w-4" />
            Coba lagi
          </PrimitiveButton>
        </Card>
      )}

      {/* Metric Cards */}
      {quant && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4 mb-6">
          <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-4">
            <div className="text-[11px] text-tv-muted uppercase font-semibold">Rata-rata Yield Universe</div>
            <div className="text-2xl font-bold text-tv-yellow font-number mt-1">
              {quant.average_portfolio_yield}%
            </div>
            <div className="text-[11px] text-tv-muted mt-0.5">Equal-weight snapshot universe · {stocks.length} saham tampil</div>
          </Card>

          <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-4">
            <div className="text-[11px] text-tv-muted uppercase font-semibold">Skenario Income / Bulan</div>
            <div className="text-2xl font-bold text-tv-green font-number mt-1">
              Rp {quant.est_monthly_income_now?.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-tv-muted mt-0.5">Modal Rp {capital.toLocaleString('id-ID')}</div>
          </Card>

          <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-4">
            <div className="text-[11px] text-tv-muted uppercase font-semibold">Skenario Income / Tahun</div>
            <div className="text-2xl font-bold text-tv-blue font-number mt-1">
              Rp {quant.est_annual_income_now?.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-tv-muted mt-0.5">Yield snapshot diasumsikan konstan</div>
          </Card>

          <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-4">
            <div className="text-[11px] text-tv-muted uppercase font-semibold">Modal Teoretis Untuk Target</div>
            <div className="text-2xl font-bold text-tv-text font-number mt-1">
              Rp {quant.required_capital_for_target?.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-tv-muted mt-0.5">Untuk Rp {targetMonthly.toLocaleString('id-ID')}/bln</div>
          </Card>
        </div>
      )}

      {quant && (
        <div className="mb-6 rounded-lg border border-tv-blue/20 bg-tv-blue/[0.04] px-3.5 py-3 text-[11px] leading-relaxed text-tv-muted">
          <span className="font-semibold text-tv-text">Metodologi:</span>{' '}
          rata-rata yield adalah equal-weight snapshot dari universe yang berhasil dibaca provider, bukan yield portofolio aktual. Safety 1-10 adalah skor heuristik dari payout ratio + konsistensi pembayaran. Proyeksi DRIP mengasumsikan yield tetap dan bukan forecast harga/dividen.
        </div>
      )}

      {/* Dividend Stocks Table & Compounding Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-tv-border pb-3">
            <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-tv-green" />
              Kandidat Dividen dari Universe Terpantau
            </h3>

            {/* Filter Toggle */}
            <div className="flex items-center gap-1 bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.06] text-[11px]">
              <PrimitiveButton variant="bare" size="none"
                type="button"
                onClick={() => setAristocratFilter('all')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                  aristocratFilter === 'all'
                    ? 'bg-tv-blue text-white shadow-sm'
                    : 'text-tv-muted hover:text-white'
                }`}
              >
                Semua ({stocks.length})
              </PrimitiveButton>
              <PrimitiveButton variant="bare" size="none"
                type="button"
                onClick={() => setAristocratFilter('aristocrats')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 ${
                  aristocratFilter === 'aristocrats'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-tv-muted hover:text-amber-300'
                }`}
              >
                <span>✓</span> Konsisten 5Y+ ({stocks.filter((s) => s.is_aristocrat).length})
              </PrimitiveButton>
            </div>
          </div>

          {filteredStocks.length === 0 && stocks.length > 0 ? (
            <EmptyState
              illustration="search"
              title="Tidak ada emiten yang cocok filter ini"
              description="Filter 'Konsisten 5Y+' tidak menemukan emiten yang cocok dari universe saat ini. Coba kembali ke 'Semua'."
              action={{ label: 'Tampilkan Semua', onClick: () => setAristocratFilter('all') }}
            />
          ) : (
          <div className="lens-table-sticky-col overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-tv-border text-tv-muted uppercase text-[10px] font-semibold tracking-wide">
                  <th className="p-2.5">Ticker</th>
                  <th className="p-2.5 text-right">Yield</th>
                  <th className="p-2.5 text-right">Safety heuristik (1-10)</th>
                  <th className="p-2.5 text-right">Payout Ratio</th>
                  <th className="p-2.5 text-right">Track Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border/50">
                {filteredStocks.map((s) => (
                  <tr key={s.ticker} className="hover:bg-tv-hover/50">
                    <td className="p-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-tv-text px-2 py-0.5 rounded bg-tv-hover border border-tv-borderLight">
                          {s.ticker}
                        </span>
                        {s.is_aristocrat && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full lens-meta font-extrabold bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-300">
                            ✓ Konsisten 5Y+
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2.5 text-right text-tv-yellow font-bold font-number">{s.yield_pct}%</td>
                    <td className="p-2.5 text-right text-tv-green font-bold font-number">{s.safety_score} / 10</td>
                    <td className="p-2.5 text-right text-tv-muted font-number">{s.payout_ratio}%</td>
                    <td className="p-2.5 text-right text-tv-text font-bold font-number">{s.consistency_years} Thn</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </Card>

        <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-5 space-y-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
            <Repeat className="w-5 h-5 text-tv-blue" />
            Skenario Compounding 10-Tahun (DRIP, yield konstan)
          </h3>

          <div className="lens-table-sticky-col overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-tv-border text-tv-muted uppercase text-[10px] font-semibold tracking-wide">
                  <th className="p-2.5">Tahun</th>
                  <th className="p-2.5 text-right">Nilai Portofolio Akhir</th>
                  <th className="p-2.5 text-right">Passive Income / Bln</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border/50">
                {schedule.map((row) => (
                  <tr key={row.year} className="hover:bg-tv-hover/50">
                    <td className="p-2.5 font-bold text-tv-text">{row.year}</td>
                    <td className="p-2.5 text-right text-tv-green font-bold font-number">
                      Rp {row.capital_end_of_year?.toLocaleString('id-ID')}
                    </td>
                    <td className="p-2.5 text-right text-tv-yellow font-bold font-number">
                      Rp {row.monthly_passive_income?.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Fitur Pro"
        body={`Dividend Compounding Planner termasuk paket Pro. Upgrade mulai ${formatRupiah(MONTHLY_PRICE)}/bulan untuk membuka simulasi cash flow dividen lengkap.`}
        benefits={[
          'Simulasi compounding & DRIP multi-tahun',
          'Universe saham dividen IDX terlikuid',
          'Seluruh modul Pro lain ikut terbuka',
        ]}
      />
    </TickerAnalysisShell>
  );
}
