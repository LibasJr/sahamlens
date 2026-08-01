'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { WA_NUMBER } from '@/shared/constants/app.constants';

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  benefits?: string[];
  waText?: string;
  ctaLabel?: string;
  secondaryLabel?: string;
}

export default function PaywallModal({
  open,
  onClose,
  title,
  body,
  benefits = [],
  waText = 'Halo, saya mau upgrade ke SahamLens Pro (Rp149.000/bulan)',
  ctaLabel = 'Upgrade Pro - Rp149k',
  secondaryLabel = 'Nanti',
}: PaywallModalProps) {
  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waText)}`;

  return (
    <AnimatePresence>
      {open && (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="relative w-full max-w-md bg-tv-bg border border-tv-blue/40 rounded-xl shadow-2 p-6 overflow-hidden"
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-tv-muted hover:text-tv-text transition-colors"
          aria-label="Tutup"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-lg bg-tv-blue flex items-center justify-center text-2xl mb-4">
          🔒
        </div>

        <h3 className="font-heading text-xl font-bold text-tv-text mb-2">{title}</h3>
        <p className="text-sm text-tv-muted leading-relaxed mb-5">{body}</p>

        {benefits.length > 0 && (
          <ul className="space-y-2 mb-6">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-tv-text">
                <span className="text-tv-blue flex-shrink-0">✓</span> {b}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center bg-tv-blue hover:bg-tv-blueHover text-white font-bold py-3 rounded-md transition-all"
          >
            {ctaLabel}
          </a>
          <button
            onClick={onClose}
            className="flex-1 border border-tv-border text-tv-muted hover:bg-tv-hover hover:text-tv-text font-bold py-3 rounded-md transition-colors"
          >
            {secondaryLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
