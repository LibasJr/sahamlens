'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Newspaper, ExternalLink } from 'lucide-react';

export interface StockNewsItem {
  title: string;
  link?: string;
  source?: string;
  sentiment?: string;
  reason?: string;
  pubDate?: string;
}

interface StockNewsModalProps {
  open: boolean;
  onClose: () => void;
  symbol: string;
  items: StockNewsItem[];
}

function formatWaktu(pubDate?: string): string {
  if (!pubDate) return '';
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return '';
  const menit = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (menit < 60) return `${Math.max(1, menit)} menit lalu`;
  if (menit < 1440) return `${Math.floor(menit / 60)} jam lalu`;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Sentimen yang tidak dikenal diperlakukan sebagai netral - jangan sampai satu nilai
 * tak terduga dari sumber berita membuat seluruh baris gagal dirender. */
function gayaSentimen(sentiment?: string): { label: string; kelas: string } {
  if (sentiment === 'POSITIF') return { label: 'POSITIF', kelas: 'bg-tv-green/15 text-tv-green' };
  if (sentiment === 'NEGATIF') return { label: 'NEGATIF', kelas: 'bg-tv-red/15 text-tv-red' };
  return { label: 'NETRAL', kelas: 'bg-tv-hover text-tv-muted' };
}

export default function StockNewsModal({ open, onClose, symbol, items }: StockNewsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Escape untuk tutup + focus trap - pola sama dengan components/PaywallModal.tsx,
  // supaya pengguna keyboard tidak "tersesat" ke elemen halaman di belakang overlay.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
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
    window.addEventListener('keydown', handleKeyDown);
    const focusTimer = setTimeout(() => {
      modalRef.current?.querySelector<HTMLElement>('button, [href]')?.focus();
    }, 30);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Berita ${symbol}`}
            className="relative w-full max-w-lg bg-tv-bg border border-tv-border rounded-xl shadow-2 p-6 max-h-[85vh] overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-tv-muted hover:text-tv-text transition-colors"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-md bg-tv-blue/15 flex items-center justify-center text-tv-blue shrink-0">
                <Newspaper className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading text-lg font-bold text-tv-text">Berita {symbol}</h3>
                <p className="text-xs text-tv-muted">
                  {items.length > 0 ? `${items.length} berita terkait` : 'Tidak ada berita terkait'}
                </p>
              </div>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-tv-muted py-6 text-center">
                Belum ada berita untuk saham ini. Berita disaring dari RSS berdasarkan penyebutan
                kode dan nama perusahaan, jadi emiten yang jarang diberitakan bisa kosong.
              </p>
            ) : (
              <div className="space-y-3">
                {items.map((n, idx) => {
                  const s = gayaSentimen(n.sentiment);
                  return (
                    <div
                      key={n.link || `${n.title}-${idx}`}
                      className="border border-tv-border rounded-lg p-3 hover:border-tv-borderLight transition-colors"
                    >
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mb-2 ${s.kelas}`}>
                        {s.label}
                      </span>
                      {/* Tautan mati lebih membingungkan daripada teks biasa - kalau link
                          kosong, judul tetap tampil tapi tidak bisa diklik. */}
                      {n.link ? (
                        <a
                          href={n.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-sm font-medium text-tv-text hover:text-tv-blue transition-colors leading-snug group"
                        >
                          {n.title}
                          <ExternalLink className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </a>
                      ) : (
                        <p className="text-sm font-medium text-tv-text leading-snug">{n.title}</p>
                      )}
                      <p className="text-xs text-tv-muted mt-1">
                        {[n.source, formatWaktu(n.pubDate), n.reason].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[10px] text-tv-muted mt-5">
              Sentimen dinilai otomatis dari judul berita, bukan analisis mendalam isi artikel.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
