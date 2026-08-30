'use client';

import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Skeleton, TickerAvatar } from '@/components/ui';
import { useLanguage } from '@/lib/i18n';

// Running text ticker - saham + harga terkini, scroll otomatis di bawah header. List
// digandakan 2x supaya loop-nya mulus (translateX 0 -> -50% = tepat 1 putaran list asli).
export function TickerTape({ items, failed }: { items: { symbol: string; price: number; changePct: number }[]; failed?: boolean }) {
  if (!items.length) {
    return (
      <div className="bg-tv-surface border-b border-tv-border h-[34px] flex items-center px-4">
        {failed ? (
          // Tanpa ini, kegagalan mengambil ringkasan pasar membuat baris ini tertulis
          // "Memuat harga saham..." selamanya di bagian paling atas halaman publik.
          <span className="text-[11px] text-tv-muted">
            Harga berjalan tidak tersedia saat ini. Bagian lain halaman tetap berfungsi.
          </span>
        ) : (
          <div className="flex items-center gap-4">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} variant="text" className="w-24 h-3" />)}
          </div>
        )}
      </div>
    );
  }

  const loopItems = [...items, ...items];
  // Durasi proporsional ke jumlah item (bukan angka tetap) - dulu 70s fix terlalu cepat
  // begitu daftarnya panjang (~100 saham gabungan gainer+loser jadi cuma ~1.4 detik per
  // saham, kebaca sekilas doang). ~3.2 detik/saham konstan, minimum 60s biar daftar
  // pendek pun tetap santai dibaca.
  const durationSec = Math.max(60, Math.round(items.length * 3.2));

  return (
    // Bar warnanya SENGAJA tetap penuh layar (bg-tv-surface di div terluar) - itu bagian
    // dari desain full-bleed header+ticker, bukan bug. Yang bug adalah batas KONTEN-nya:
    // header pakai max-w-[1600px] mx-auto (di layar lebar, logo "SahamLens" mulai jauh
    // dari tepi sungguhan), tapi ticker cuma px-4 tanpa batas lebar - item pertamanya
    // mulai nyaris di tepi layar, terlihat "menembus" lewat batas tulisan SahamLens.
    // overflow-hidden dipindah ke wrapper max-w-[1600px] yang sama supaya area scroll
    // ticker sejajar dengan konten lain, warnanya tetap penuh.
    <div className="sahamlens-ticker-wrap bg-tv-surface border-b border-tv-border">
      {/* px-4 sm:px-6 lg:px-8 sama persis dengan header (baris ~299) supaya item
          pertama ticker sejajar tepat dengan huruf "S" di logo, bukan cuma mendekati. */}
      <div className="max-w-[1600px] mx-auto overflow-hidden px-4 sm:px-6 lg:px-8">
      <div className="sahamlens-ticker-track flex whitespace-nowrap py-2" style={{ animationDuration: `${durationSec}s` }}>
        {loopItems.map((item, i) => (
          // min-h-6 = 24px, ambang WCAG 2.5.8. Tanpa ini tautan hanya setinggi
          // barisnya (terukur 19px): py-2 ada di track, bukan di tautannya, jadi area
          // yang benar-benar bisa disentuh lebih pendek dari yang terlihat.
          //
          // Pemisah antar item kini border-r, bukan glyph "|". Sebagai teks ia terukur
          // 1,29:1 dan dihitung 200 kali sebagai kegagalan kontras - padahal ia murni
          // dekoratif. Sebagai border ia tidak lagi teks (tidak tunduk 1.4.3, tidak
          // dibacakan pembaca layar) dan 200 simpul DOM ikut hilang.
          <Link
            key={`${item.symbol}-${i}`}
            href={`/technical/${item.symbol}.JK`}
            className="flex min-h-6 shrink-0 items-center gap-1.5 border-r border-tv-border px-4 text-[12px] font-number transition-opacity hover:opacity-80"
          >
            <span className="font-bold text-tv-text">{item.symbol.replace(/\.JK$/i, '')}</span>
            <span className="text-tv-muted">
              {Number.isFinite(item.price) ? `Rp ${Math.round(item.price).toLocaleString('id-ID')}` : 'Harga N/A'}
            </span>
            {item.changePct == null ? (
              <span className="font-semibold text-tv-muted">N/A</span>
            ) : (
              <span className={`font-semibold flex items-center gap-0.5 ${item.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {item.changePct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
              </span>
            )}
          </Link>
        ))}
      </div>
      </div>
    </div>
  );
}

export type StockSignalItem = {
  symbol: string; price: number; changePct: number | null; finalScore: number;
  signals?: string[]; tp1: number | null; tp2: number | null;
  cl1: number | null; cl2: number | null; flagged?: boolean;
  brokerCode?: string | null; brokerNetValue?: number | null; brokerTradeDate?: string | null;
};

function formatBrokerFlow(value: number): string {
  return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(value));
}

export function StockSignalRunningText({ items, advisoryEnabled }: { items: StockSignalItem[]; advisoryEnabled: boolean }) {
  const { t, language } = useLanguage();
  const durationSec = Math.max(28, items.length * 7);
  const renderGroup = (copy: number) => (
    <div className="flex shrink-0 gap-3 pr-3" aria-hidden={copy === 1 ? true : undefined}>
      {items.map((item) => {
        const label = item.flagged ? t('radar.cautionLabel') : advisoryEnabled ? t('radar.buyLabel') : t('radar.infoLabel');
        const tone = item.flagged
          ? 'border-tv-red/40 bg-tv-red/15 text-tv-red shadow-[0_0_12px_rgba(239,68,68,0.15)]'
          : advisoryEnabled
            ? 'border-tv-green/40 bg-tv-green/15 text-tv-green shadow-[0_0_12px_rgba(34,197,94,0.15)]'
            : 'border-tv-gold/40 bg-tv-gold/15 text-tv-gold shadow-[0_0_12px_rgba(234,179,8,0.15)]';
        return (
          <Link
            key={`${copy}-${item.symbol}`}
            href={`/technical/${item.symbol}`}
            tabIndex={copy === 1 ? -1 : undefined}
            className="group/signal flex w-[290px] shrink-0 items-center gap-3.5 rounded-2xl border border-tv-border bg-tv-card/95 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-cardAlt hover:shadow-lg sm:w-[330px]"
          >
            <TickerAvatar symbol={item.symbol} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-number text-sm font-bold text-tv-text group-hover/signal:text-tv-blue transition-colors">{item.symbol.replace('.JK', '')}</span>
                <span className={`font-number text-xs font-bold ${item.changePct == null ? 'text-tv-muted' : item.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                  {item.changePct == null ? 'N/A' : `${item.changePct >= 0 ? '+' : ''}${item.changePct.toFixed(2)}%`}
                </span>
              </div>
              <div className="mt-1 truncate text-[11px] font-medium text-tv-muted">{item.signals?.[0] || `Skor total ${Math.round(item.finalScore)}/100`}</div>
              {item.tp1 != null && item.cl1 != null ? (
                <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 font-number text-[11px] font-bold leading-tight">
                  <span className="text-tv-green">TP1 {item.tp1.toLocaleString(language === 'id' ? 'id-ID' : 'en-US')}</span>
                  <span className="text-tv-red">CL1 {item.cl1.toLocaleString(language === 'id' ? 'id-ID' : 'en-US')}</span>
                  {item.tp2 != null && <span className="text-tv-green/80 font-semibold">TP2 {item.tp2.toLocaleString(language === 'id' ? 'id-ID' : 'en-US')}</span>}
                  {item.cl2 != null && <span className="text-tv-red/80 font-semibold">CL2 {item.cl2.toLocaleString(language === 'id' ? 'id-ID' : 'en-US')}</span>}
                </div>
              ) : (
                <div className="mt-1.5 text-[11px] font-medium text-tv-muted">{t('radar.tpClUnavailable')}</div>
              )}
              {typeof item.brokerNetValue === 'number' && item.brokerNetValue !== 0 && (
                <div className={`mt-1.5 text-[11px] font-semibold ${item.brokerNetValue > 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                  {t('radar.bandarFlow', { code: item.brokerCode || '?', action: item.brokerNetValue > 0 ? 'Buy' : 'Sell', amount: formatBrokerFlow(item.brokerNetValue) })}
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${tone}`}>{label}</span>
              <div className="mt-2 font-number text-xs font-bold text-tv-text">Rp {Math.round(item.price).toLocaleString(language === 'id' ? 'id-ID' : 'en-US')}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
  return (
    <div className="sahamlens-signal-wrap overflow-hidden py-1" role="region" aria-label="Running text signal saham">
      <div className="sahamlens-signal-track flex w-max" style={{ animationDuration: `${durationSec}s` }}>
        {renderGroup(0)}{renderGroup(1)}
      </div>
    </div>
  );
}
