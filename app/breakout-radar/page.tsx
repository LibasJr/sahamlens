'use client';

import React, { useState, useEffect } from 'react';
import { Target, Clock, Menu, TrendingUp } from 'lucide-react';

import PaywallModal from '@/components/PaywallModal';
import { Badge } from '@/components/ui';

const displayTicker = (s: string) => s.replace('.JK', '');

type PickBonus = { label: string; points: number };

type AiPickItem = {
  symbol: string;
  price: number;
  changePct: number;
  baseScore: number;
  bonuses: PickBonus[];
  finalScore: number;
  flagged: boolean;
  flagReason: string | null;
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
  const [loading, setLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

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
                AI Pick Live
                <Badge variant="danger" dot>Live</Badge>
              </h1>
              <p className="text-xs text-tv-muted flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3" /> {updateLabel ? `Data per ${updateLabel}` : 'Memuat...'}
              </p>
            </div>
          </div>
        </header>

        <div className="p-6 max-w-[1200px] mx-auto w-full">
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tv-border text-sm">
                      {items.map((it, idx) => (
                        <tr key={it.symbol} className="hover:bg-tv-hover/30">
                          <td className="py-3 px-4 text-tv-muted">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold font-number text-tv-text whitespace-nowrap">
                            {displayTicker(it.symbol)}
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
                        </tr>
                      ))}
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
        body="AI Pick Live butuh akun Pro setelah trial 7 hari berakhir."
        benefits={[
          'Unlimited Technical Analyzer (10 filter)',
          'AI Pick LIVE, Council AI & Compare Tool',
          'Watchlist & Alert unlimited',
        ]}
        secondaryLabel="Tunggu Besok"
      />
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Hasil"
        body="AI Pick butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </div>
  );
}
