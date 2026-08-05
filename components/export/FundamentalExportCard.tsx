'use client';

import React, { useState } from 'react';
import { Coins, TrendingUp, Scale, Percent, PieChart, Wallet, Layers, type LucideIcon } from 'lucide-react';
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
import { getSectorTheme, type SectorTheme } from './sector-theme';

interface FundamentalExportCardProps {
  ticker: string;
  stock: { symbol?: string; name?: string; current_price?: number; change_pct?: number };
  fundamentals: {
    marketCap?: number | null;
    trailingPE?: number | null;
    priceToBook?: number | null;
    returnOnEquity?: number | null;
    grossMargins?: number | null;
    totalRevenue?: number | null;
    nim?: number | null;
  };
  profile: { sector?: string; industry?: string; description?: string; website?: string };
  consensus?: string;
  exportedAt: Date;
}

function MetricBox({ label, value, Icon }: { label: string; value: string; Icon: LucideIcon }) {
  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-5 flex flex-col gap-2">
      <Icon className="w-6 h-6 text-tv-muted" />
      <div className="text-xs text-tv-muted uppercase font-mono">{label}</div>
      <div className="text-3xl font-number font-bold text-white">{value}</div>
    </div>
  );
}

// Logo perusahaan ASLI via domain resmi (profile.website, field yang sama dipakai link
// "Kunjungi Website" di app/fundamental/page.tsx) - bukan foto dekoratif karangan. Kalau
// website tidak ada di data ATAU logo gagal dimuat, fallback ke icon sektor (SectorIcon)
// - tidak pernah menampilkan gambar palsu/generik yang bisa dikira logo asli.
//
// BUG FIX (2026-08-05, #1): SEBELUMNYA langsung ke logo.clearbit.com - servis itu sudah
// MATI (DNS tidak resolve, shutdown pasca akuisisi HubSpot, dikonfirmasi empiris). Diganti
// ke /api/company-logo (proxy backend sendiri, lihat komentar di route itu) - sekaligus
// menghindari canvas "tainted" karena gambar cross-origin tanpa header CORS yang
// sebelumnya bikin html-to-image gagal total.
//
// BUG FIX (2026-08-05, #2): `.replace(/^www\./, '')` DIHAPUS - dikonfirmasi empiris
// Google favicon service index domain APA ADANYA, bukan domain ternormalisasi.
// www.telkom.co.id ADA favicon terindeks, telkom.co.id (setelah "www." dibuang) TIDAK -
// stripping "www." yang niatnya "membersihkan" domain justru mematahkan lookup untuk
// domain yang situs resminya memang di-serve di subdomain www.
function getLogoUrl(website?: string): string | null {
  if (!website) return null;
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    const hostname = new URL(url).hostname;
    return `/api/company-logo?domain=${encodeURIComponent(hostname)}`;
  } catch {
    return null;
  }
}

function CompanyMark({ website, sectorTheme }: { website?: string; sectorTheme: SectorTheme }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = getLogoUrl(website);
  const SectorIcon = sectorTheme.Icon;

  if (!logoUrl || failed) {
    return (
      <div className={`w-32 h-32 shrink-0 rounded-2xl border flex items-center justify-center ${sectorTheme.chipBg} ${sectorTheme.chipBorder}`}>
        <SectorIcon className={`w-16 h-16 ${sectorTheme.chipText}`} />
      </div>
    );
  }
  return (
    <div className="w-32 h-32 shrink-0 rounded-2xl bg-white p-5 flex items-center justify-center overflow-hidden">
      <img
        src={logoUrl}
        alt=""
        className="max-w-full max-h-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// Kartu export offscreen untuk /fundamental (lihat wiring di app/fundamental/page.tsx).
// Layout 2 kolom (identitas+profil kiri, metrik kanan) di bawah banner brand - meniru
// GAYA laporan korporat (kolom majalah, header color-block), TAPI semua konten tetap
// data asli - tidak ada pilar bisnis/ekosistem/kekuatan perusahaan karangan (itu konten
// marketing manual spesifik per perusahaan, tidak tersedia dari data saham manapun,
// sudah didiskusikan & ditolak eksplisit).
// Deteksi sektor bank SENGAJA disamakan persis dengan app/fundamental/page.tsx (cabang
// NIM vs Gross Margin) - kartu export tidak boleh menampilkan rasio yang beda logic
// dari tampilan asli untuk emiten yang sama.
export default function FundamentalExportCard({ ticker, stock, fundamentals, profile, consensus, exportedAt }: FundamentalExportCardProps) {
  const isBank = Boolean(profile.sector?.includes('Financial') || profile.industry?.includes('Bank'));
  const displaySymbol = ticker.replace('.JK', '');
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';
  const sectorTheme = getSectorTheme(profile.sector, profile.industry);

  return (
    <div className="w-[1080px] h-[1350px] bg-gradient-to-b from-tv-bg to-tv-surface text-white flex flex-col overflow-hidden">
      {/* Banner brand color-block (gaya bar tebal DGWG di atas poster mereka) - warna
          gradient brand konsisten di semua kartu, TIDAK per-sektor (sektor dinyatakan
          lewat CompanyMark di bawah), supaya kartu tetap dikenali sebagai SahamLens
          apa pun emitennya. */}
      <div className="bg-gradient-accent px-16 py-9 flex items-center justify-between">
        <div>
          <div className="text-4xl font-heading font-extrabold text-white">SahamLens</div>
          <div className="text-sm font-mono text-white/80 uppercase tracking-wide mt-1">Laporan Fundamental</div>
        </div>
        <div className={`text-xl font-mono font-bold px-5 py-2 rounded-full ${
          consensus?.includes('BULLISH') ? 'bg-white text-tv-green'
            : consensus?.includes('BEARISH') ? 'bg-white text-tv-red'
            : 'bg-white text-tv-yellow'
        }`}>{consensus || 'AWAITING'}</div>
      </div>

      <div className="flex-1 flex gap-10 p-16">
        {/* Kolom kiri - identitas & profil */}
        <div className="w-[380px] shrink-0 flex flex-col">
          <CompanyMark website={profile.website} sectorTheme={sectorTheme} />

          <div className="mt-6">
            <div className="text-5xl font-heading font-extrabold leading-tight">{displaySymbol}.JK</div>
            <div className="text-xl text-tv-muted mt-1">{stock.name || displaySymbol}</div>
          </div>

          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <span className="text-3xl font-mono font-bold">
              Rp {stock.current_price?.toLocaleString('id-ID') || '-'}
            </span>
            {typeof stock.change_pct === 'number' && (
              <span className={`text-lg font-mono font-bold ${stock.change_pct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {stock.change_pct > 0 ? '+' : ''}{stock.change_pct}%
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-8 mb-2">
            <Layers className={`w-4 h-4 ${sectorTheme.chipText}`} />
            <span className="text-xs font-mono text-tv-muted uppercase">Sektor &amp; Industri</span>
          </div>
          <div className="text-base font-bold pb-6 border-b border-tv-border">{profile.sector || '-'} / {profile.industry || '-'}</div>

          {profile.description && (
            <div className="text-sm text-tv-muted leading-relaxed line-clamp-[14] mt-6">{profile.description}</div>
          )}
        </div>

        {/* Kolom kanan - metrik */}
        <div className="flex-1 flex flex-col justify-between">
          <div className="grid grid-cols-2 gap-5">
            <MetricBox label="Market Cap" value={fmtTriliun(fundamentals.marketCap)} Icon={Coins} />
            <MetricBox label="P/E Ratio (TTM)" value={fmtKali(fundamentals.trailingPE)} Icon={TrendingUp} />
            <MetricBox label="Price to Book" value={fmtKali(fundamentals.priceToBook)} Icon={Scale} />
            <MetricBox label="ROE" value={fmtPersen(fundamentals.returnOnEquity)} Icon={Percent} />
            {isBank ? (
              <>
                <MetricBox label="NIM" value={fmtPersen(fundamentals.nim)} Icon={Percent} />
                <MetricBox label="Revenue" value={fmtTriliun(fundamentals.totalRevenue)} Icon={Wallet} />
              </>
            ) : (
              <>
                <MetricBox label="Gross Margin" value={fmtPersen(fundamentals.grossMargins)} Icon={PieChart} />
                <MetricBox label="Revenue" value={fmtTriliun(fundamentals.totalRevenue)} Icon={Wallet} />
              </>
            )}
          </div>

          <div className="text-xs font-mono text-tv-muted border-t border-tv-border pt-4">
            Data via SahamLens • {timeLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
