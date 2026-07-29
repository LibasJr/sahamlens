'use client';

import React from 'react';
import { X } from 'lucide-react';
import { WA_NUMBER } from '@/lib/constants';

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
  if (!open) return null;

  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waText)}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-[#0a0a0f] border border-[#14b8a6]/40 rounded-2xl shadow-[0_0_50px_rgba(20,184,166,0.15)] p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
          aria-label="Tutup"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-xl bg-[#14b8a6]/10 border border-[#14b8a6]/30 flex items-center justify-center text-2xl mb-4">
          🔒
        </div>

        <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-400 font-mono leading-relaxed mb-5">{body}</p>

        {benefits.length > 0 && (
          <ul className="space-y-2 mb-6">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-white font-mono">
                <span className="text-[#14b8a6] flex-shrink-0">✓</span> {b}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center bg-[#14b8a6] hover:bg-[#0d9488] text-white font-bold py-3 rounded-lg transition-colors"
          >
            {ctaLabel}
          </a>
          <button
            onClick={onClose}
            className="flex-1 border border-gray-700 text-gray-300 hover:bg-gray-800 font-bold py-3 rounded-lg transition-colors"
          >
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
