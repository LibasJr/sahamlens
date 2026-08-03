'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';

type Emiten = { symbol: string; name: string; board: string };
type Preview = { closes: number[]; price: number; changePct: number } | null;

interface CommandPaletteProps {
  // Kalau diisi, memilih saham (klik/Enter) memanggil ini alih-alih pindah halaman ke
  // LensAI (/technical/[symbol]) - dipakai halaman depan (components/Dashboard.tsx)
  // supaya chart utama di halaman itu sendiri yang berubah, bukan navigasi keluar.
  // Halaman lain yang belum diisi prop ini tetap pakai perilaku lama (navigasi).
  onSelect?: (symbol: string, name: string) => void;
}

export default function CommandPalette({ onSelect }: CommandPaletteProps = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [emiten, setEmiten] = useState<Emiten[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [preview, setPreview] = useState<Preview>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewCache = useRef<Map<string, Preview>>(new Map());
  const modalRef = useRef<HTMLDivElement>(null);
  const activeSymbolRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (open && !loaded) {
      fetch('/api/emiten')
        .then((r) => r.json())
        .then((data) => {
          if (data && data.emiten) setEmiten(data.emiten);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open, loaded]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return emiten.slice(0, 8);
    return emiten
      .filter((e) => e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, emiten]);

  useEffect(() => setActiveIdx(0), [query]);

  const active = results[activeIdx];

  useEffect(() => {
    activeSymbolRef.current = active?.symbol;
    if (!active) { setPreview(null); return; }
    const symbol = active.symbol;
    const cached = previewCache.current.get(symbol);
    if (cached !== undefined) { setPreview(cached); return; }
    setPreviewLoading(true);
    fetch(`/api/public-chart/${symbol}?tf=1M`)
      .then((r) => r.json())
      .then((data) => {
        // Kalau user sudah hover ke baris lain sebelum response ini balik, jangan timpa
        // preview yang sedang ditampilkan dengan data saham yang sudah tidak di-hover
        // (race condition - lihat ref activeSymbolRef, bukan `active` yang di-closure
        // saat effect ini jalan).
        if (activeSymbolRef.current !== symbol) return;
        if (data && data.history && data.history.length > 1) {
          const closes = data.history.map((h: any) => h.close);
          const price = closes[closes.length - 1];
          const prev = closes[closes.length - 2];
          const changePct = prev ? ((price - prev) / prev) * 100 : 0;
          const result = { closes, price, changePct };
          previewCache.current.set(symbol, result);
          setPreview(result);
        } else {
          previewCache.current.set(symbol, null);
          setPreview(null);
        }
      })
      .catch(() => { if (activeSymbolRef.current === symbol) setPreview(null); })
      .finally(() => { if (activeSymbolRef.current === symbol) setPreviewLoading(false); });
  }, [active?.symbol]);

  const goTo = (emiten: Emiten) => {
    setOpen(false);
    setQuery('');
    if (onSelect) {
      onSelect(emiten.symbol, emiten.name);
    } else {
      router.push(`/technical/${emiten.symbol}.JK`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active) goTo(active); }
  };

  // Focus trap - tanpa ini Tab bisa memindahkan fokus keyboard ke elemen di belakang
  // overlay (yang cuma tertutup visual, bukan aria-hidden), user keyboard-only bisa
  // "tersesat" fokus di luar dialog padahal dialog masih terlihat terbuka.
  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const container = modalRef.current;
    if (!container) return;
    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.hasAttribute('disabled'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      {/* Visible search trigger, header-mounted */}
      <button
        onClick={() => setOpen(true)}
        title="Cari saham (Ctrl+K)"
        className="flex items-center justify-center sm:justify-start gap-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 px-2.5 sm:px-3 py-1.5 text-[12px] text-white/70 transition-colors w-full h-9"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline truncate">Cari saham...</span>
        <kbd className="ml-auto hidden md:inline-flex items-center gap-0.5 rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-mono text-white/50">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[560px] rounded-2xl bg-white dark:bg-[#152238] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleModalKeyDown}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Cari kode saham atau nama perusahaan (mis. BBCA atau Bank Central Asia)"
                className="flex-1 bg-transparent text-[14px] text-[#0A1931] dark:text-white focus:outline-none placeholder:text-slate-400"
              />
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-[#0A1931] dark:hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex max-h-[60vh]">
              <div className="flex-1 overflow-y-auto py-1.5 max-w-[60%]">
                {!loaded && (
                  <div className="px-4 py-8 text-center text-[12px] text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat daftar emiten...
                  </div>
                )}
                {loaded && results.length === 0 && (
                  <div className="px-4 py-8 text-center text-[12px] text-slate-400">Tidak ada saham yang cocok.</div>
                )}
                {results.map((r, idx) => (
                  <button
                    key={r.symbol}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => goTo(r)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors ${idx === activeIdx ? 'bg-[#3A86FF]/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-[#0A1931] dark:text-white font-mono">{r.symbol}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{r.name}</div>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 shrink-0">{r.board}</span>
                  </button>
                ))}
              </div>

              {/* Mini chart preview */}
              <div className="hidden sm:flex flex-col flex-1 border-l border-slate-100 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/30">
                {!active ? (
                  <div className="m-auto text-[11px] text-slate-400 text-center">Arahkan kursor ke saham untuk melihat preview chart</div>
                ) : (
                  <>
                    <div className="text-[13px] font-bold text-[#0A1931] dark:text-white font-mono">{active.symbol}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mb-3">{active.name}</div>
                    {previewLoading ? (
                      <div className="flex-1 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
                    ) : preview ? (
                      <>
                        <div className="flex items-baseline gap-2 mb-2">
                          <span className="font-number text-[16px] font-bold text-[#0A1931] dark:text-white">Rp {Math.round(preview.price).toLocaleString('id-ID')}</span>
                          <span className={`font-number inline-flex items-center gap-0.5 text-[11px] font-semibold ${preview.changePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {preview.changePct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {preview.changePct >= 0 ? '+' : ''}{preview.changePct.toFixed(2)}%
                          </span>
                        </div>
                        <Sparkline closes={preview.closes} />
                        <div className="text-[10px] text-slate-400 mt-2">1 bulan terakhir</div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400">Data chart tidak tersedia</div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
              <span>↑↓ navigasi • {onSelect ? 'Enter tampilkan di chart' : 'Enter buka analisis'}</span>
              {!onSelect && <span>Grafik & indikator gratis • LensAI penuh perlu akun</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Sparkline({ closes }: { closes: number[] }) {
  const width = 200;
  const height = 60;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const points = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * width;
    const y = height - ((c - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  const isUp = closes[closes.length - 1] >= closes[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <polyline points={points} fill="none" stroke={isUp ? '#10B981' : '#EF4444'} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
