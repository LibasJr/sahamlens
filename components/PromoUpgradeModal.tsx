'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Check, Crown } from 'lucide-react';

interface PromoUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  onSelectPlan: (plan: 'monthly' | 'annual') => void;
}

// Fitur Pro genuinely ter-gerbang checkProAccess/checkProAccessLive di kode -
// JANGAN tambah Fundamental Analyzer/Screener/Risk Calculator/Backtest/Calendar/
// Akun Demo ke daftar ini, semua itu gratis untuk semua orang (lihat spec
// docs/superpowers/specs/2026-08-02-promo-upgrade-popup-design.md).
const PRO_FEATURES = [
  'Unlimited Technical Analyzer (10 filter)',
  'AI Pick LIVE & Rekomendasi Saham',
  'Council AI, Compare Tool & Market Pulse',
  'Bandar Flow Pro & Watchlist/Alert Unlimited',
];

const FREE_FEATURES = ['Watchlist maks. 3 saham', 'Alert maks. 2', '5 analisa saham/hari'];

// Struktur overlay/focus-trap sama dengan PaywallModal.tsx/UserProfileModal.tsx -
// komponen terpisah karena kontennya beda (3 kartu perbandingan, bukan 1 CTA).
export default function PromoUpgradeModal({ open, onClose, onSelectPlan }: PromoUpgradeModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

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
            aria-label="Butuh Analisis Lebih Dalam?"
            className="relative w-full max-w-3xl bg-tv-bg border border-tv-blue/40 rounded-xl shadow-2 p-6 overflow-hidden max-h-[90vh] overflow-y-auto"
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

            <h3 className="font-heading text-xl font-bold text-tv-text mb-1">Butuh Analisis Lebih Dalam?</h3>
            <p className="text-sm text-tv-muted mb-5">Pilih paket yang cocok buat kamu</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-tv-border rounded-lg p-5 flex flex-col">
                <h4 className="font-heading text-base font-bold text-tv-text mb-3">Paket Gratis</h4>
                <div className="mb-4">
                  <span className="font-number text-2xl font-bold text-tv-text">Rp 0</span>
                  <span className="text-xs text-tv-muted">/bulan</span>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {FREE_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-tv-muted">
                      <Check className="w-3.5 h-3.5 text-tv-green flex-shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={onClose}
                  className="w-full border border-tv-border text-tv-text font-bold py-2.5 rounded-md text-sm hover:bg-tv-hover transition-colors"
                >
                  Mulai Gratis
                </button>
              </div>

              <div className="border-2 border-tv-blue rounded-lg p-5 flex flex-col relative">
                <span className="absolute -top-3 left-5 bg-tv-blue text-white text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded">
                  Populer
                </span>
                <h4 className="font-heading text-base font-bold text-tv-text mb-3 mt-1">Bulanan Pro</h4>
                <div className="mb-4">
                  <span className="font-number text-2xl font-bold text-tv-text">Rp 99.000</span>
                  <span className="text-xs text-tv-muted">/bulan</span>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-tv-text">
                      <Check className="w-3.5 h-3.5 text-tv-blue flex-shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => onSelectPlan('monthly')}
                  className="w-full flex items-center justify-center gap-2 bg-tv-blue hover:bg-tv-blueHover text-white font-bold py-2.5 rounded-md text-sm transition-colors"
                >
                  <Crown className="w-4 h-4" /> Upgrade ke Pro
                </button>
              </div>

              <div className="border border-tv-border rounded-lg p-5 flex flex-col relative">
                <span className="absolute -top-3 left-5 bg-tv-gold text-tv-bg text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded">
                  Hemat 2 Bulan
                </span>
                <h4 className="font-heading text-base font-bold text-tv-text mb-3 mt-1">Tahunan Pro</h4>
                <div className="mb-4">
                  <span className="font-number text-2xl font-bold text-tv-text">Rp 990.000</span>
                  <span className="text-xs text-tv-muted">/tahun</span>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-tv-text">
                      <Check className="w-3.5 h-3.5 text-tv-blue flex-shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => onSelectPlan('annual')}
                  className="w-full flex items-center justify-center gap-2 bg-tv-blue hover:bg-tv-blueHover text-white font-bold py-2.5 rounded-md text-sm transition-colors"
                >
                  <Crown className="w-4 h-4" /> Upgrade ke Pro
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
