import React from 'react';
import { Award, ShieldCheck, ShieldAlert, ShieldQuestion, type LucideIcon } from 'lucide-react';
import { getSectorTheme } from './sector-theme';
import type { MoatProxyResult, MoatProxyStatus } from '@/modules/fundamental/service/moat-proxy.service';

interface MoatExportCardProps {
  ticker: string;
  stock: { name?: string };
  profile: { sector?: string; industry?: string };
  moat: MoatProxyResult;
  durability?: { status: 'TAHAN' | 'CAMPURAN' | 'RAPUH' | 'DATA TERBATAS'; conclusion: string } | null;
  exportedAt: Date;
}

// Class Tailwind DITULIS LITERAL PENUH per status (bukan dirangkai lewat template
// string) - JIT scanner Tailwind cuma menangkap string statis di source, bukan hasil
// concat runtime (lihat catatan yang sama di sector-theme.tsx).
const STATUS_STYLE: Record<MoatProxyStatus, { Icon: LucideIcon; text: string; box: string }> = {
  KUAT: { Icon: ShieldCheck, text: 'text-tv-green', box: 'bg-tv-green/10 border-tv-green/40' },
  CAMPURAN: { Icon: ShieldQuestion, text: 'text-tv-yellow', box: 'bg-tv-yellow/10 border-tv-yellow/40' },
  LEMAH: { Icon: ShieldAlert, text: 'text-tv-red', box: 'bg-tv-red/10 border-tv-red/40' },
  'DATA TERBATAS': { Icon: ShieldQuestion, text: 'text-tv-muted', box: 'bg-tv-muted/10 border-tv-muted/40' },
};

// Kartu export offscreen untuk /moat (lihat wiring di app/moat/page.tsx). Gaya visual
// SAMA PERSIS dengan FundamentalExportCard/TechnicalExportCard (banner color-block,
// palet dikunci gelap lewat lens-export-dark) - satu sistem brand, bukan desain baru per
// halaman. HANYA data kuantitatif yang sudah dihitung buildMoatProxy() yang ditampilkan -
// TIDAK ADA pilar kualitatif (pangsa pasar/switching cost/brand/network effect) karangan,
// itu sudah eksplisit ditolak sebagai konten (lihat QUALITATIVE_GAPS di app/moat/page.tsx)
// karena datanya memang tidak tersedia dari sumber saham manapun.
export default function MoatExportCard({ ticker, stock, profile, moat, durability, exportedAt }: MoatExportCardProps) {
  const displaySymbol = ticker.replace('.JK', '');
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';
  const sectorTheme = getSectorTheme(profile.sector, profile.industry);
  const statusStyle = STATUS_STYLE[moat.status];
  const StatusIcon = statusStyle.Icon;
  const SectorIcon = sectorTheme.Icon;

  return (
    <div className="lens-export-dark w-[1080px] h-[1350px] bg-gradient-to-b from-tv-bg to-tv-surface text-white flex flex-col overflow-hidden">
      <div className="bg-gradient-accent px-16 py-9 flex items-center justify-between">
        <div>
          <div className="text-4xl font-heading font-extrabold text-white">SahamLens</div>
          <div className="text-sm font-mono text-white/80 uppercase tracking-wide mt-1">Proxy Kualitas Bisnis</div>
        </div>
        <div className={`text-xl font-mono font-bold px-5 py-2 rounded-full bg-white flex items-center gap-2 ${statusStyle.text}`}>
          <StatusIcon className="w-5 h-5" />
          {moat.status}
        </div>
      </div>

      <div className="flex-1 p-16 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-4 mb-8">
            <div className={`w-16 h-16 shrink-0 rounded-2xl border flex items-center justify-center ${sectorTheme.chipBg} ${sectorTheme.chipBorder}`}>
              <SectorIcon className={`w-8 h-8 ${sectorTheme.chipText}`} />
            </div>
            <div>
              <div className="text-5xl font-heading font-extrabold leading-tight">{displaySymbol}.JK</div>
              <div className="text-lg text-tv-muted mt-1">{stock.name || displaySymbol} &middot; {profile.sector || '-'}</div>
            </div>
          </div>

          <div className={`rounded-2xl border p-6 mb-8 ${statusStyle.box} ${statusStyle.text}`}>
            <div className="flex items-center gap-2 mb-1">
              <Award className="w-5 h-5" />
              <span className="text-sm font-mono uppercase tracking-wide">Ringkasan Kuantitatif</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {moat.supportive} dari {moat.available} indikator mendukung ({moat.coveragePct}% cakupan data)
            </div>
          </div>

          <div className="text-sm font-mono text-tv-muted uppercase mb-3">Empat Pilar Kuantitatif</div>
          <div className="grid grid-cols-2 gap-4 mb-8">
            {moat.pillars.map((pillar) => {
              const pillarStyle = STATUS_STYLE[pillar.status];
              return (
                <div key={pillar.key} className="bg-tv-card border border-tv-border rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base font-bold">{pillar.label}</span>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-white ${pillarStyle.text}`}>{pillar.status}</span>
                  </div>
                  <div className="text-xs text-tv-muted leading-relaxed">{pillar.description}</div>
                  <div className="text-xs font-mono text-tv-muted mt-2">{pillar.supportive} mendukung &middot; {pillar.caution} perlu diwaspadai &middot; {pillar.available} data</div>
                </div>
              );
            })}
          </div>

          {durability && (
            <div className="bg-tv-card border border-tv-border rounded-xl p-5 mb-4">
              <div className="text-sm font-mono text-tv-muted uppercase mb-1">Ketahanan Lintas Tahun Buku</div>
              <div className="text-lg font-bold mb-1">{durability.status}</div>
              <div className="text-sm text-tv-muted leading-relaxed line-clamp-3">{durability.conclusion}</div>
            </div>
          )}

          <div className="text-xs text-tv-muted leading-relaxed">
            Proxy kuantitatif dari data fundamental publik - BUKAN rating moat kualitatif (pangsa pasar,
            switching cost, kekuatan merek, network effect, lisensi/regulasi tidak tercakup) dan bukan
            rekomendasi transaksi.
          </div>
        </div>

        <div className="text-xs font-mono text-tv-muted border-t border-tv-border pt-4">
          Data via SahamLens &bull; {timeLabel}
        </div>
      </div>
    </div>
  );
}
