'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { getMarketAwareTtlMs } from '@/shared/cache/ttl-policy';

type Emiten = { symbol: string; name: string; board: string };
type Preview = { closes: number[]; price: number; changePct: number } | null;
const MARKET_INDEXES: Emiten[] = [
  { symbol: '^JKSE', name: 'Indeks Harga Saham Gabungan (IHSG)', board: 'INDEKS' },
];

// BUG FIX (search homepage harga basi, 2026-08-05): previewCache di bawah dulu gak
// punya TTL - sekali simbol di-hover, hasilnya (termasuk harga) FROZEN di memori
// browser sepanjang komponen ini mount, walau harga real sudah berubah (contoh nyata:
// DGWG tetap tampil 290 di search walau harga sudah 300). /api/public-chart sendiri
// Preview mengikuti policy cache pasar: 60 detik saat bursa buka, 30 menit saat
// bursa tutup. Cache ini hanya menyimpan preview client, bukan source of truth harga.


interface CommandPaletteProps {
  // Kalau diisi, memilih saham (klik/Enter) memanggil ini alih-alih pindah halaman ke
  // LensConsensus (/technical/[symbol]) - dipakai halaman depan (components/Dashboard.tsx)
  // supaya chart utama di halaman itu sendiri yang berubah, bukan navigasi keluar.
  // Halaman lain yang belum diisi prop ini tetap pakai perilaku lama (navigasi).
  onSelect?: (symbol: string, name: string) => void;
  // BUG FIX (2026-08-05, unifikasi search): default true - TopMarketBar (global,
  // AppShell, tampil di semua halaman) SATU-SATUNYA pemilik shortcut Ctrl/Cmd+K.
  // Header.tsx (dipakai /fundamental, /technical, /dcf, dst) sekarang juga me-render
  // CommandPalette (menggantikan input inline sendiri, lihat Header.tsx) dengan
  // enableShortcut={false} - tanpa ini, Ctrl+K akan membuka DUA modal sekaligus
  // (instance global + instance per-halaman) karena keduanya listen keydown yang sama.
  enableShortcut?: boolean;
}

export default function CommandPalette({ onSelect, enableShortcut = true }: CommandPaletteProps = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [emiten, setEmiten] = useState<Emiten[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [preview, setPreview] = useState<Preview>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewCache = useRef<Map<string, { data: Preview; fetchedAt: number }>>(new Map());
  const modalRef = useRef<HTMLDivElement>(null);
  const activeSymbolRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (enableShortcut && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [enableShortcut]);

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
    const searchable = [...MARKET_INDEXES, ...emiten];
    if (!q) return searchable.slice(0, 8);
    return searchable
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
    if (cached !== undefined && Date.now() - cached.fetchedAt < getMarketAwareTtlMs()) {
      setPreview(cached.data);
      return;
    }
    setPreviewLoading(true);
    fetch(`/api/public-chart/${encodeURIComponent(symbol)}?tf=1M`)
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
          previewCache.current.set(symbol, { data: result, fetchedAt: Date.now() });
          setPreview(result);
        } else {
          previewCache.current.set(symbol, { data: null, fetchedAt: Date.now() });
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
      const routeSymbol = emiten.symbol.startsWith('^') ? 'IHSG' : `${emiten.symbol}.JK`;
      router.push(`/technical/${encodeURIComponent(routeSymbol)}`);
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
        className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-tv-border bg-tv-hover/40 px-3 text-[11px] font-medium text-tv-muted transition-colors hover:border-tv-borderLight hover:bg-tv-hover hover:text-tv-text sm:justify-start"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline truncate">Cari saham, IHSG, kode emiten, atau perusahaan...</span>
        <kbd className="ml-auto hidden md:inline-flex items-center gap-0.5 rounded-md border border-tv-border bg-tv-hover px-1.5 py-0.5 text-[10px] font-mono text-tv-muted">⌘K</kbd>
      </button>

      {open && (
        // top-14 (bukan inset-0) - backdrop dulu nutup dari y=0, ikut nutup/dim TopMarketBar
        // (IHSG, jam bursa, notifikasi, profil) yang ada DI ATAS trigger ini juga. User cuma
        // mau buka pencarian, bukan kehilangan akses ke top bar. Modal sekarang mulai persis
        // di bawah TopMarketBar (tinggi baris itu ~56px - lihat TopMarketBar.tsx px-4 py-2.5).
        <div className="fixed inset-x-0 top-16 bottom-0 z-[100] flex items-start justify-center pt-[6vh] px-4 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[620px] overflow-hidden rounded-[22px] border border-tv-border bg-tv-surface shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleModalKeyDown}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-tv-border">
              <Search className="h-4 w-4 text-tv-muted shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Cari IHSG, kode saham, atau perusahaan (mis. IHSG atau BBCA)"
                aria-label="Cari saham atau indeks"
                className="flex-1 rounded-md bg-transparent text-[14px] text-tv-text placeholder:text-tv-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue"
              />
              {/* Tombol berisi ikon saja WAJIB punya nama aksesibel - tanpa aria-label
                  pembaca layar hanya mengumumkan "tombol". Ukurannya juga dinaikkan ke
                  44x44; sebelumnya hanya sebesar ikonnya. */}
              <button
                onClick={() => setOpen(false)}
                aria-label="Tutup pencarian"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-tv-muted transition-colors hover:text-tv-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex max-h-[60vh]">
              <div className="flex-1 overflow-y-auto py-1.5 max-w-[60%]">
                {!loaded && (
                  <div className="px-4 py-8 text-center text-[12px] text-tv-muted flex items-center justify-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat daftar emiten...
                  </div>
                )}
                {loaded && results.length === 0 && (
                  <div className="px-4 py-8 text-center text-[12px] text-tv-muted">Tidak ada saham yang cocok.</div>
                )}
                {results.map((r, idx) => (
                  <button
                    key={r.symbol}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => goTo(r)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors ${idx === activeIdx ? 'bg-tv-blue/10' : 'hover:bg-tv-hover'}`}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-tv-text font-mono">{r.symbol}</div>
                      <div className="text-[11px] text-tv-muted truncate">{r.name}</div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-tv-muted shrink-0">{r.board}</span>
                  </button>
                ))}
              </div>

              {/* Mini chart preview */}
              <div className="hidden sm:flex flex-col flex-1 border-l border-tv-border p-4 bg-tv-cardAlt">
                {!active ? (
                  <div className="m-auto text-[11px] text-tv-muted text-center">Arahkan kursor ke saham untuk melihat preview chart</div>
                ) : (
                  <>
                    <div className="text-[13px] font-bold text-tv-text font-mono">{active.symbol}</div>
                    <div className="text-[10px] text-tv-muted truncate mb-3">{active.name}</div>
                    {previewLoading ? (
                      <div className="flex-1 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-tv-muted" /></div>
                    ) : preview ? (
                      <>
                        <div className="flex items-baseline gap-2 mb-2">
                          <span className="font-number text-[16px] font-bold text-tv-text">Rp {Math.round(preview.price).toLocaleString('id-ID')}</span>
                          <span className={`font-number inline-flex items-center gap-0.5 text-[11px] font-semibold ${preview.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                            {preview.changePct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {preview.changePct >= 0 ? '+' : ''}{preview.changePct.toFixed(2)}%
                          </span>
                        </div>
                        <Sparkline closes={preview.closes} />
                        <div className="text-[10px] text-tv-muted mt-2">1 bulan terakhir</div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-[11px] text-tv-muted">Data chart tidak tersedia</div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="px-4 py-2 border-t border-tv-border flex items-center justify-between text-[10px] text-tv-muted">
              <span>↑↓ navigasi • {onSelect ? 'Enter tampilkan di chart' : 'Enter buka analisis'}</span>
              {!onSelect && <span>Grafik & indikator gratis • LensConsensus penuh perlu akun</span>}
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
      <polyline points={points} fill="none" stroke={isUp ? '#23C483' : '#FF5D6C'} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
