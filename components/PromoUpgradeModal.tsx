'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Check, Crown } from 'lucide-react';
import { PRICING_PLANS, FULL_FEATURE_LIST, formatRupiah, type PricingPlan } from '@/shared/config/pricing';

interface PromoUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  onSelectPlan: (planId: PricingPlan['id']) => void;
}

const FREE_FEATURES = ['Watchlist maks. 3 saham', 'Alert maks. 2', '5 analisa saham/hari'];

// BUG FIX (permintaan eksplisit 2026-08-03): sebelumnya cuma 2 paket berbayar
// (Bulanan Rp99.000, Tahunan Rp990.000 - angka tahunan ini TIDAK konsisten dengan
// formula diskon yang dipakai di tempat lain). Sekarang 4 paket dari satu sumber
// (shared/config/pricing.ts): harga = harga bulanan x jumlah bulan, dipotong diskon
// 5%/8%/10% untuk 3/6/12 bulan - dan daftar fitur diperluas dari 4 item ke daftar
// LENGKAP (FULL_FEATURE_LIST) supaya calon Pro user lihat semua yang didapat, bukan
// cuma teaser singkat.
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
            className="relative w-full max-w-5xl bg-tv-bg border border-tv-blue/40 rounded-xl shadow-2 p-6 overflow-hidden max-h-[90vh] overflow-y-auto"
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
            <p className="text-sm text-tv-muted mb-5">Pilih paket yang cocok buat kamu - makin panjang durasi, makin besar diskonnya.</p>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="border border-tv-border rounded-lg p-4 flex flex-col">
                <h4 className="font-heading text-sm font-bold text-tv-text mb-3">Paket Gratis</h4>
                <div className="mb-4">
                  <span className="font-number text-xl font-bold text-tv-text">Rp 0</span>
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

              {PRICING_PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={`rounded-lg p-4 flex flex-col relative ${
                    plan.badge ? 'border-2 border-tv-blue' : 'border border-tv-border'
                  }`}
                >
                  {plan.badge && (
                    <span
                      className={`absolute -top-3 left-4 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded ${
                        plan.badge === 'Paling Hemat' ? 'bg-tv-gold text-tv-bg' : 'bg-tv-blue text-white'
                      }`}
                    >
                      {plan.badge}
                    </span>
                  )}
                  <h4 className="font-heading text-sm font-bold text-tv-text mb-3 mt-1">{plan.label} Pro</h4>
                  <div className="mb-1">
                    {plan.discountPct > 0 && (
                      <span className="block text-[11px] text-tv-muted line-through font-number">{formatRupiah(plan.normalPrice)}</span>
                    )}
                    <span className="font-number text-xl font-bold text-tv-text">{formatRupiah(plan.finalPrice)}</span>
                  </div>
                  {plan.discountPct > 0 ? (
                    <p className="text-[11px] text-tv-green font-bold mb-3">Hemat {plan.discountPct}% • {formatRupiah(plan.pricePerMonth)}/bulan</p>
                  ) : (
                    <p className="text-[11px] text-tv-muted mb-3">&nbsp;</p>
                  )}
                  <ul className="space-y-1.5 mb-4 flex-1 max-h-40 overflow-y-auto pr-1">
                    {FULL_FEATURE_LIST.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-[11px] text-tv-text">
                        <Check className="w-3 h-3 text-tv-blue flex-shrink-0 mt-0.5" /> {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => onSelectPlan(plan.id)}
                    className="w-full flex items-center justify-center gap-2 bg-tv-blue hover:bg-tv-blueHover text-white font-bold py-2.5 rounded-md text-sm transition-colors"
                  >
                    <Crown className="w-4 h-4" /> Upgrade
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
