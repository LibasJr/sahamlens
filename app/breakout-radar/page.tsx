'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Target, Clock, Menu, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

import PaywallModal from '@/components/PaywallModal';
import { Badge } from '@/components/ui';

const displayTicker = (s: string) => s.replace('.JK', '');

type PickBonus = { label: string; points: number };
type ScoreBreakdown = { technical: number; fundamental: number; flow: number };

type AiPickItem = {
  symbol: string;
  price: number;
  changePct: number;
  baseScore: number;
  bonuses: PickBonus[];
  finalScore: number;
  flagged: boolean;
  flagReason: string | null;
  // Audit BUILD 003 (Explainable AI) - opsional (bukan required) supaya frontend
  // tidak error kalau response API sempat berasal dari cache lama sebelum field ini
  // ada (lihat guard `?? fallback` di ai-pick.service.ts rankAiPicks()).
  breakdown?: ScoreBreakdown;
  topReasons?: string[];
};

// Halaman ini dulu punya 8 tab (Breakout, Rekomendasi, Menarik, Undervalue, Berisiko,
// Golden Cross, Dead Cross, Akumulasi Asing). Audit 2026-08-03 menemukan tab-tab itu
// memindai universe berbeda (15 vs 250 vs 220) sehingga angkanya tidak sebanding, isinya
// tumpang tindih (80 baris hanya berisi 69 saham unik), dan tab Rekomendasi memindai 220
// saham lewat ~22 request setiap dibuka. Semuanya dilebur jadi satu daftar berperingkat -
// lihat docs/superpowers/specs/2026-08-03-ai-pick-satu-tab-design.md.
export default function AiPickPage() {
  const [items, setItems] = useState<AiPickItem[]>([]);
  const [ready, setReady] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  // Audit BUILD 003 (Explainable AI) - baris diklik untuk buka rincian
  // Technical/Fundamental/Arus Dana + 3 alasan teratas, bukan halaman/modal terpisah
  // (perubahan UI minimal, bukan redesign).
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ai-pick')
      .then(async (res) => {
        if (res.status === 401) {
          setShowLoginPrompt(true);
          return null;
        }
        if (res.status === 402) {
          setShowPaywall(true);
          return null;
        }
        return res.json();
      })
      .then((d) => {
        if (!d || d.error) return;
        setItems(d.items || []);
        setReady(d.ready !== false);
        setNote(d.note || null);
        setComputedAt(d.computedAt || null);
        setStale(d.stale === true);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Jam diambil dari computedAt milik cache, BUKAN jam client saat halaman dibuka -
  // label lama memakai new Date() sehingga selalu menampilkan waktu klik seolah-olah
  // itu waktu data dihitung.
  const updateLabel = computedAt
    ? new Date(computedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB'
    : null;

  return (
    <div className="flex h-screen bg-tv-bg">
      <div className="flex-1 flex flex-col min-h-screen overflow-y-auto custom-scrollbar">
        <header className="bg-tv-surface border-b border-tv-border px-6 py-4 sticky top-0 z-20 shadow-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
              className="md:hidden p-2 -ml-2 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="p-2 rounded-md bg-tv-blue text-white">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-xl text-tv-text tracking-tight flex items-center gap-2">
                LensRadar Live
                {/* BUG FIX (audit integritas data 2026-08-03): badge "Live" dulu TETAP
                    tampil walau data sebenarnya dari sesi bursa sebelumnya (bisa 2+ hari
                    basi di akhir pekan, setelah TTL cache diperpanjang supaya tidak
                    kosong total di luar jam bursa - lihat shared/cache/ai-pick-cache.ts).
                    Sekarang badge jujur: "Live" cuma kalau data benar-benar segar. */}
                {stale ? <Badge variant="neutral" dot>Data Sesi Terakhir</Badge> : <Badge variant="danger" dot>Live</Badge>}
              </h1>
              <p className="text-xs text-tv-muted flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3" /> {updateLabel ? `${stale ? 'Data sesi terakhir' : 'Data'} per ${updateLabel}` : 'Memuat...'}
              </p>
            </div>
          </div>
        </header>

        {/* max-w-[1600px] menyamakan lebar dengan Technical/Fundamental - sebelumnya
            1200px membuat sisi kiri-kanan penuh ruang kosong menganggur di layar lebar. */}
        <div className="p-6 max-w-[1600px] mx-auto w-full">
          <div className="bg-tv-card border border-tv-border rounded-lg shadow-1 overflow-hidden">
            <div className="p-4 border-b border-tv-border bg-tv-bg/40">
              <h2 className="font-heading text-sm font-bold text-tv-text flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-tv-blue" />
                Kandidat Terkuat Hari Ini
              </h2>
              <p className="text-[11px] text-tv-muted mt-1">
                Diurutkan dari skor komposit tertinggi. Hanya saham berskor 60 ke atas yang tampil.
              </p>
            </div>

            {loading && <p className="p-6 text-sm text-tv-muted">Memuat...</p>}

            {!loading && !ready && (
              <p className="p-6 text-sm text-tv-muted">
                Data sedang disiapkan. Coba lagi beberapa menit lagi.
              </p>
            )}

            {!loading && ready && items.length === 0 && (
              <p className="p-6 text-sm text-tv-muted">Belum ada sinyal kuat hari ini.</p>
            )}

            {!loading && ready && items.length > 0 && (
              <>
                {note && <p className="px-4 pt-3 text-xs text-tv-yellow">{note}</p>}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-tv-border text-xs text-tv-muted uppercase font-semibold tracking-wide">
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Saham</th>
                        <th className="py-3 px-4 text-right">Harga</th>
                        <th className="py-3 px-4 text-right">Chg</th>
                        <th className="py-3 px-4 text-right">Skor</th>
                        <th className="py-3 px-4">Rincian</th>
                        <th className="py-3 px-4 text-center">Kenapa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tv-border text-sm">
                      {items.map((it, idx) => {
                        const isExpanded = expandedSymbol === it.symbol;
                        return (
                        <React.Fragment key={it.symbol}>
                        <tr className="hover:bg-tv-hover/30">
                          <td className="py-3 px-4 text-tv-muted">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold font-number whitespace-nowrap">
                            <Link
                              href={`/technical/${it.symbol}`}
                              className="text-tv-text hover:text-tv-blue transition-colors"
                            >
                              {displayTicker(it.symbol)}
                            </Link>
                            {it.flagged && (
                              <span className="ml-2 text-tv-red text-xs font-normal">! {it.flagReason}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-number text-tv-muted">
                            {Math.round(it.price).toLocaleString('id-ID')}
                          </td>
                          <td className={`py-3 px-4 text-right font-number ${it.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                            {it.changePct >= 0 ? '+' : ''}{it.changePct.toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 text-right font-bold font-number text-tv-text">
                            {it.finalScore}
                          </td>
                          <td className="py-3 px-4 text-xs text-tv-muted font-number whitespace-nowrap">
                            {it.baseScore}
                            {it.bonuses.map((b) => ` +${b.points} ${b.label}`).join('')}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => setExpandedSymbol(isExpanded ? null : it.symbol)}
                              className="inline-flex items-center gap-1 text-[11px] text-tv-blue hover:text-tv-text transition-colors"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-tv-bg/60">
                            <td colSpan={7} className="py-3 px-4">
                              <div className="flex flex-col md:flex-row gap-4 text-xs">
                                <div className="flex gap-4 shrink-0">
                                  <div>
                                    <div className="text-tv-muted uppercase text-[10px] tracking-wide">Technical</div>
                                    <div className="font-bold font-number text-tv-text">{it.breakdown?.technical ?? 'N/A'}/40</div>
                                  </div>
                                  <div>
                                    <div className="text-tv-muted uppercase text-[10px] tracking-wide">Fundamental</div>
                                    <div className="font-bold font-number text-tv-text">{it.breakdown?.fundamental ?? 'N/A'}/30</div>
                                  </div>
                                  <div>
                                    <div className="text-tv-muted uppercase text-[10px] tracking-wide">Arus Dana</div>
                                    <div className="font-bold font-number text-tv-text">{it.breakdown?.flow ?? 'N/A'}/30</div>
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-tv-muted uppercase text-[10px] tracking-wide mb-1">Alasan Utama</div>
                                  {it.topReasons && it.topReasons.length > 0 ? (
                                    <ul className="space-y-0.5">
                                      {it.topReasons.map((r, i) => (
                                        <li key={i} className="text-tv-text">✓ {r}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="text-tv-muted">Rincian belum tersedia untuk saham ini.</span>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <p className="text-[11px] text-tv-muted mt-4 leading-relaxed">
            Skor = komposit teknikal, fundamental, dan arus dana, ditambah bonus sinyal langka
            (breakout +15, akumulasi +10, golden cross +10, oversold +5). Bonus akumulasi memakai
            estimasi Chaikin Money Flow dari posisi close di range High-Low, BUKAN data broker/asing
            resmi. Tanda merah menandai sinyal yang bertentangan - saham tetap ditampilkan supaya
            kontradiksinya terlihat, bukan disembunyikan.
          </p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html:`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0F141D; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2C3A5A; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3A4B75; }
      `}} />

      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Masa Trial Habis"
        body="LensRadar Live butuh akun Pro setelah trial 7 hari berakhir."
        benefits={[
          'Unlimited Technical Analyzer (10 filter)',
          'LensRadar LIVE, LensAI & Compare Tool',
          'Watchlist & Alert unlimited',
        ]}
        secondaryLabel="Tunggu Besok"
      />
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Hasil"
        body="LensRadar butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </div>
  );
}
