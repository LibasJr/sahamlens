'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Copy, Check } from 'lucide-react';
import Link from 'next/link';
import { WA_NUMBER } from '@/shared/constants/app.constants';
import { getPaymentMethods } from '@/shared/config/payment';

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  benefits?: string[];
  waText?: string;
  ctaLabel?: string;
  secondaryLabel?: string;
  // ATURAN BARU (2026-08-01) - halaman analisis sekarang bisa diakses tanpa login
  // (lihat middleware.ts), jadi modal ini juga dipakai untuk ajakan DAFTAR (bukan
  // cuma upgrade Pro). Kalau diisi, CTA utama jadi link internal (mis. /signup)
  // alih-alih link WhatsApp upgrade Pro - dua konteks yang beda, jangan dicampur
  // (user belum daftar tidak relevan diajak WhatsApp soal upgrade Pro).
  ctaHref?: string;
}

function CopyRow({ label, value, name }: { label: string; value: string; name: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-tv-border bg-tv-card px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-tv-muted">{label}</p>
        <p className="text-sm font-bold text-tv-text truncate">{value}</p>
        <p className="text-xs text-tv-muted truncate">a.n. {name}</p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="flex-shrink-0 flex items-center gap-1 text-xs font-bold text-tv-blue hover:text-tv-blueHover transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? 'Tersalin' : 'Salin'}
      </button>
    </div>
  );
}

export default function PaywallModal({
  open,
  onClose,
  title,
  body,
  benefits = [],
  waText = 'Halo, saya sudah transfer untuk upgrade ke SahamLens Pro (Rp99.000/bulan). Ini bukti transfernya.',
  ctaLabel = 'Kirim Bukti Transfer via WhatsApp',
  secondaryLabel = 'Nanti',
  ctaHref,
}: PaywallModalProps) {
  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waText)}`;
  const modalRef = useRef<HTMLDivElement>(null);
  const paymentMethods = ctaHref ? [] : getPaymentMethods();

  const handleSendProof = () => {
    // Fire-and-forget - notifikasi Telegram cuma nilai tambah, kegagalan/lambatnya
    // tidak boleh menghalangi user membuka WhatsApp untuk kirim bukti transfer.
    fetch('/api/payment/notify', { method: 'POST' }).catch(() => {});
  };

  // Escape untuk tutup + focus trap - sebelumnya tidak ada satu pun, Tab bisa
  // memindahkan fokus keyboard ke elemen halaman di belakang overlay yang secara
  // visual tertutup tapi tetap ada di tab order (user keyboard-only bisa "tersesat").
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
    >
      <motion.div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md bg-tv-bg border border-tv-blue/40 rounded-xl shadow-2 p-6 overflow-hidden max-h-[90vh] overflow-y-auto"
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

        {paymentMethods.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-bold text-tv-muted uppercase tracking-wide mb-2">Metode Pembayaran</p>
            <div className="space-y-2">
              {paymentMethods.map((m) => (
                <CopyRow key={m.id} label={m.label} value={m.accountNumber} name={m.accountName} />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          {ctaHref ? (
            <Link
              href={ctaHref}
              className="flex-1 text-center bg-tv-blue hover:bg-tv-blueHover text-white font-bold py-3 rounded-md transition-all"
            >
              {ctaLabel}
            </Link>
          ) : (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleSendProof}
              className="flex-1 text-center bg-tv-blue hover:bg-tv-blueHover text-white font-bold py-3 rounded-md transition-all"
            >
              {ctaLabel}
            </a>
          )}
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
