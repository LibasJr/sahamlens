'use client';

import type { RefObject } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Layers, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';
import AnalysisGlossary from '@/components/AnalysisGlossary';
import AnalysisViewModeToggle from '@/components/AnalysisViewModeToggle';
import ExportImageButton from '@/components/export/ExportImageButton';
import FundamentalExportCard from '@/components/export/FundamentalExportCard';
import { QuickWatchlistStar } from '@/components/QuickWatchlistStar';
import { AnimatedNumber, Badge, Button, Card, TickerAvatar } from '@/components/ui';
import { isBlueChipConstituent, LQ45_BADGE_TITLE } from '@/lib/utils/blue-chip-index';
import { classifyTradingBoard } from '@/lib/utils/idx-trading-board';
import { buildExportFileName } from '@/shared/format/export-filename';
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';

function displayTicker(symbol: string): string {
  return symbol.replace('.JK', '').replace('.JK', '');
}

function splitStatusText(value?: string | null) {
  const text = (value || '').trim();
  if (!text) return { primary: 'AWAITING', detail: '' };
  const match = text.match(/^([^()]+?)\s*(?:\((.+)\))?$/);
  return {
    primary: (match?.[1] || text).trim(),
    detail: (match?.[2] || '').trim(),
  };
}

type ViewMode = 'compact' | 'full';

interface FundamentalOverviewProps {
  data: any;
  ticker: string;
  stock: any;
  loading: boolean;
  marketClosed: boolean;
  marketSnapshotAt: Date | null;
  lastUpdate: Date | null;
  exportRef: RefObject<HTMLDivElement>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onRefresh: () => void;
  formatTime: (date: Date | null) => string;
}

function FundamentalMetric({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border bg-tv-bg p-3 flex flex-col justify-between">
      <span className="lens-meta uppercase text-tv-muted">{label}</span>
      <span className={`font-number text-lg font-bold ${tone}`}>{value}</span>
    </Card>
  );
}

export default function FundamentalOverview({
  data,
  ticker,
  stock,
  loading,
  marketClosed,
  marketSnapshotAt,
  lastUpdate,
  exportRef,
  viewMode,
  onViewModeChange,
  onRefresh,
  formatTime,
}: FundamentalOverviewProps) {
  const isBankProfile = Boolean(data?.profile?.sector?.includes('Financial') || data?.profile?.industry?.includes('Bank'));
  const bank = data?.bankFundamentals ?? null;
  const bankQuality = bank?.quality ?? null;
  const fmtBankPct = (value: number | null | undefined) => typeof value === 'number' ? `${value.toFixed(2)}%` : 'N/A';

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="bg-tv-card border border-tv-border px-3 py-1.5 rounded-full text-tv-muted flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${marketClosed ? 'bg-tv-red' : 'bg-tv-green animate-pulse'}`} />
          {marketClosed ? 'Bursa sedang tutup' : 'Bursa sedang buka'}
        </div>
        <div className="bg-tv-card border border-tv-border px-3 py-1.5 rounded-full text-tv-muted">
          Sumber harga: {data?._meta?.provider || 'Yahoo Finance'} • sesi {formatTime(marketSnapshotAt)}
        </div>
        <div className="bg-tv-card border border-tv-border px-3 py-1.5 rounded-full text-tv-muted">
          Data sesi: {formatTime(lastUpdate)} • {marketClosed ? 'menunggu sesi berikutnya' : 'cek ulang tiap 1 menit'}
        </div>
        <Button
          variant="bare"
          size="none"
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="bg-tv-hover border border-tv-borderLight hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-white flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </Button>
        <ExportImageButton
          targetRef={exportRef}
          fileName={buildExportFileName('Fundamental', ticker)}
          label="Export Kartu Fundamental"
          disabled={!data}
        />
      </div>

      <AnalysisViewModeToggle mode={viewMode} onChange={onViewModeChange} />
      <AnalysisGlossary />

      {data && (
        <div style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
          <div ref={exportRef}>
            <FundamentalExportCard
              ticker={ticker}
              stock={stock}
              fundamentalAnalyzers={data?.analyzers || []}
              fundamentals={data?.fundamentals || {}}
              profile={data?.profile || {}}
              consensus={data?.consensus}
              exportedAt={new Date()}
            />
          </div>
        </div>
      )}

      <Card padding="none" radius="xl" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-4 sm:p-5 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <TickerAvatar symbol={stock.symbol || ticker} size="lg" />
          <div>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <h1 className="shrink-0 text-xl font-bold tracking-tight text-white font-heading sm:text-2xl">{displayTicker(stock.symbol || ticker)}.JK</h1>
              <QuickWatchlistStar ticker={stock.symbol || ticker} />
              <span className="min-w-0 truncate text-xs text-tv-muted font-sans font-normal sm:text-sm">{stock.name || ticker.replace('.JK', '')}</span>
            </div>
            {(() => {
              const isLq45 = isBlueChipConstituent(ticker);
              const boardInfo = classifyTradingBoard(stock?.listing_board);
              return (
                <>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    {isLq45 && <Badge variant="info" title={LQ45_BADGE_TITLE}>Indeks LQ45</Badge>}
                    {boardInfo && <Badge variant={boardInfo.badgeVariant} title={boardInfo.description}>{boardInfo.shortLabel}</Badge>}
                  </div>
                  {boardInfo?.isFca && (
                    <div className="mt-2 flex items-start gap-2 rounded-xl border border-tv-gold/30 bg-tv-gold/10 p-2 text-xs text-tv-gold">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div><strong>Papan Pemantauan Khusus (FCA):</strong> Diperdagangkan dengan mekanisme Periodic Call Auction (5 sesi lelang/hari).</div>
                    </div>
                  )}
                </>
              );
            })()}
            <div className="flex items-center gap-3 mt-1">
              {typeof stock.current_price === 'number' && Number.isFinite(stock.current_price) ? (
                <AnimatedNumber
                  value={stock.current_price}
                  format={(n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`}
                  className="font-number text-xl font-bold text-white tabular-nums sm:text-2xl"
                />
              ) : (
                <span className="text-sm text-tv-muted">Harga tidak tersedia dari sumber data</span>
              )}
              {typeof stock.change_pct === 'number' && Number.isFinite(stock.change_pct) ? (
                <span className={`font-number text-sm font-bold flex items-center gap-0.5 ${stock.change_pct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                  {stock.change_pct >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {stock.change_pct > 0 ? `+${stock.change_pct}` : stock.change_pct}%
                </span>
              ) : (
                <span className="text-sm font-bold text-tv-muted">N/A</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-3 md:flex md:w-auto md:items-stretch md:gap-3">
          {data?.bestPerformer && (
            <div className="text-right border-r border-tv-border pr-6 hidden md:block">
              <div className="lens-meta text-tv-muted uppercase tracking-wide">TOP METHOD TODAY</div>
              <div className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-tv-green" />
                {data.bestPerformer.label} (rule {data.bestPerformer.confidence}/100)
              </div>
            </div>
          )}
          <div className="min-w-0">
            <div className="mb-1.5 flex min-h-[28px] items-center justify-center text-center lens-meta font-sans font-semibold uppercase tracking-wide text-tv-muted">Valuasi Harga</div>
            {(() => {
              const valuation = splitStatusText(data?.consensus);
              return (
                <div className={`min-h-[64px] w-full rounded-xl border px-3 py-2 flex flex-col items-center justify-center text-center font-sans ${
                  data?.consensus?.includes('UNDERVALUED')
                    ? 'bg-tv-green/10 text-tv-green border-tv-green/30'
                    : data?.consensus?.includes('OVERVALUED')
                      ? 'bg-tv-red/10 text-tv-red border-tv-red/30'
                      : 'bg-tv-yellow/10 text-tv-yellow border-tv-yellow/30'
                }`}>
                  <div className="flex items-center justify-center gap-1.5">
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4 shrink-0" />}
                    <span className="text-sm font-bold leading-tight">{loading ? 'Calculating...' : valuation.primary}</span>
                  </div>
                  {!loading && valuation.detail && <div className="mt-1 text-[11px] font-semibold opacity-80 sm:text-xs">{valuation.detail}</div>}
                </div>
              );
            })()}
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 flex min-h-[28px] items-center justify-center text-center lens-meta font-sans font-semibold uppercase tracking-wide text-tv-muted">Fundamental</div>
            <div className={`min-h-[64px] w-full rounded-xl border px-3 py-2 flex flex-col items-center justify-center text-center font-sans ${
              data?.fundamentalQuality?.label === 'BAGUS'
                ? 'bg-tv-green/10 text-tv-green border-tv-green/30'
                : data?.fundamentalQuality?.label === 'BURUK'
                  ? 'bg-tv-red/10 text-tv-red border-tv-red/30'
                  : 'bg-tv-yellow/10 text-tv-yellow border-tv-yellow/30'
            }`}>
              <div className="flex items-center justify-center gap-1.5">
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 shrink-0" />}
                <span className="text-sm font-bold leading-tight">{loading ? 'Calculating...' : data?.fundamentalQuality?.label || 'AWAITING'}</span>
              </div>
              {!loading && data?.fundamentalQuality && <div className="mt-1 text-[11px] font-semibold opacity-80 sm:text-xs">Score {data.fundamentalQuality.pct}%</div>}
            </div>
          </div>
        </div>
      </Card>

      {data?.consensus && data?.fundamentalQuality?.label && (() => {
        const murah = data.consensus.includes('UNDERVALUED');
        const mahal = data.consensus.includes('OVERVALUED');
        const bagus = data.fundamentalQuality.label === 'BAGUS';
        const buruk = data.fundamentalQuality.label === 'BURUK';
        if (!(murah || mahal) || !(bagus || buruk)) return null;
        const verdict = murah && bagus
          ? { tone: 'border-tv-green/30 bg-tv-green/5 text-tv-green', text: 'Bisnisnya dinilai bagus DAN harganya di bawah nilai wajar - kuadran yang paling dicari. Periksa apakah ada risiko yang belum tercermin di rasio (perkara hukum, ketergantungan pada satu pelanggan, tata kelola).' }
          : murah && buruk
            ? { tone: 'border-tv-warning/30 bg-tv-warning/5 text-tv-warning', text: 'Harganya murah TAPI kualitas fundamentalnya buruk. Ini pola perangkap nilai (value trap): harga rendah sering merupakan penilaian pasar yang benar atas bisnis yang sedang memburuk, bukan diskon.' }
            : mahal && bagus
              ? { tone: 'border-tv-blue/30 bg-tv-blue/5 text-tv-blue', text: 'Bisnisnya bagus TAPI harganya sudah di atas nilai wajar. Kualitas tidak menghapus risiko harga - membeli perusahaan bagus di harga terlalu tinggi tetap bisa merugi bertahun-tahun.' }
              : { tone: 'border-tv-red/30 bg-tv-red/5 text-tv-red', text: 'Harganya di atas nilai wajar DAN kualitas fundamentalnya buruk - kuadran dengan pembenaran paling lemah dari kedua sisi.' };
        return (
          <div className={`rounded-lg border px-4 py-3 ${verdict.tone}`}>
            <div className="lens-meta font-semibold uppercase tracking-wide opacity-70">Kombinasi Valuasi &times; Kualitas</div>
            <p className="mt-1 text-[11px] leading-relaxed text-tv-text">{verdict.text}</p>
          </div>
        );
      })()}

      <div className="flex flex-col gap-6">
        <Card padding="none" radius="xl" elevation="sm" overflow="visible" highlight={false} className="w-full border-tv-border p-5">
          <h3 className="text-xl font-extrabold text-white font-heading mb-4 border-b border-tv-border pb-3 flex items-center gap-2">
            <Layers className="w-5 h-5 text-tv-accent" />
            Profil Perusahaan & Data Fundamental
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <div>
                <div className="text-xs text-tv-muted uppercase tracking-wide mb-1">Sektor & Industri</div>
                <div className="text-sm text-white font-bold">
                  {data?.profile?.sector || data?.profile?.industry ? (
                    <>{data?.profile?.sector || 'Sektor belum diklasifikasi'}<span className="text-tv-muted font-normal"> / </span>{data?.profile?.industry || 'industri belum diklasifikasi'}</>
                  ) : (
                    <span className="text-tv-muted font-normal">Sumber data belum mengklasifikasi emiten ini</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-tv-muted uppercase tracking-wide mb-1">Deskripsi Bisnis</div>
                <div className="text-sm text-tv-muted line-clamp-6 hover:line-clamp-none transition-all">{data?.profile?.description || 'Memuat deskripsi perusahaan...'}</div>
              </div>
              {data?.profile?.website && (
                <div className="pt-2">
                  <a href={data.profile.website} target="_blank" rel="noreferrer" className="text-xs text-tv-accent hover:underline flex items-center gap-1">
                    Kunjungi Website <ArrowUpRight className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
              <FundamentalMetric label="Market Cap" value={fmtTriliun(data?.fundamentals?.marketCap)} />
              <FundamentalMetric label="P/E Ratio (TTM)" value={fmtKali(data?.fundamentals?.trailingPE)} />
              <FundamentalMetric label="Price to Book (PBV)" value={fmtKali(data?.fundamentals?.priceToBook)} />
              <FundamentalMetric
                label="Return on Equity (ROE)"
                value={fmtPersen(data?.fundamentals?.returnOnEquity)}
                tone={data?.fundamentals?.returnOnEquity == null ? 'text-tv-muted' : data.fundamentals.returnOnEquity > 0 ? 'text-tv-green' : 'text-tv-red'}
              />
              {!isBankProfile ? (
                <>
                  <FundamentalMetric label="Gross Margin" value={fmtPersen(data?.fundamentals?.grossMargins)} />
                  <FundamentalMetric label="Pendapatan (Revenue)" value={fmtTriliun(data?.fundamentals?.totalRevenue)} />
                </>
              ) : (
                <>
                  <FundamentalMetric label="NIM (Net Interest Margin)" value={fmtBankPct(bank?.nimPct)} tone={bank?.nimPct == null ? 'text-tv-muted' : 'text-tv-green'} />
                  <FundamentalMetric label="Pendapatan (Revenue)" value={fmtTriliun(data?.fundamentals?.totalRevenue)} />
                </>
              )}
            </div>

            {isBankProfile && (
              <div className="lg:col-span-3 mt-4 rounded-xl border border-tv-border bg-tv-bg/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-tv-text">Rasio Khusus Bank — Evidence DATA_ONLY</div>
                    <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-tv-muted">Rasio ini berasal dari pipeline laporan bank yang memiliki observed date dan sumber audit. Belum masuk LensScore sampai histori PIT dan validasinya cukup; nilai yang tidak tersedia tetap N/A, bukan diisi nol.</p>
                  </div>
                  <div className="text-right lens-meta text-tv-muted">
                    <div>{bank ? `Observed ${bank.observedDate}` : 'Belum ada snapshot bank terverifikasi'}</div>
                    {bankQuality && <div className="mt-0.5">Coverage {bankQuality.coveragePct}% · PIT {bankQuality.pitSafe ? 'OK' : 'BELUM'} · Score: OFF</div>}
                    {bank?.source && <div className="mt-0.5">Sumber: {bank.source}</div>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5">
                  {[
                    ['NIM', bank?.nimPct], ['NPL Gross', bank?.nplGrossPct], ['NPL Net', bank?.nplNetPct], ['CASA', bank?.casaPct], ['CAR', bank?.carPct],
                    ['LDR', bank?.ldrPct], ['Cost of Credit', bank?.costOfCreditPct], ['Cost / Income', bank?.costToIncomePct], ['Coverage', bank?.coverageRatioPct],
                  ].map(([label, value]) => (
                    <Card key={String(label)} padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-3">
                      <div className="lens-meta uppercase tracking-wide text-tv-muted">{String(label)}</div>
                      <div className={`mt-1 font-number text-base font-bold ${typeof value === 'number' ? 'text-tv-text' : 'text-tv-muted'}`}>{fmtBankPct(typeof value === 'number' ? value : null)}</div>
                    </Card>
                  ))}
                  <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-3">
                    <div className="lens-meta uppercase tracking-wide text-tv-muted">PPOP</div>
                    <div className={`mt-1 font-number text-base font-bold ${typeof bank?.ppopIdr === 'number' ? 'text-tv-text' : 'text-tv-muted'}`}>{typeof bank?.ppopIdr === 'number' ? fmtTriliun(bank.ppopIdr) : 'N/A'}</div>
                  </Card>
                </div>
                {bankQuality?.warnings?.length > 0 && <div className="mt-3 rounded-lg border border-tv-yellow/20 bg-tv-yellow/5 p-3 lens-meta leading-relaxed text-tv-muted">{bankQuality.warnings.join(' ')}</div>}
                {Array.isArray(bank?.evidence) && bank.evidence.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Array.from(new Map(bank.evidence.map((e: any) => [e.sourceUrl, e.sourceTitle])).entries()).slice(0, 4).map(([url, title]) => (
                      <a key={String(url)} href={String(url)} target="_blank" rel="noreferrer" className="rounded-full border border-tv-border px-2.5 py-1 lens-meta text-tv-blue hover:border-tv-blue/40">{String(title)}</a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
