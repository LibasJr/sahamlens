'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useModalBehavior } from '@/lib/hooks/useModalBehavior';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { WA_NUMBER } from '@/shared/constants/app.constants';
import { getPaymentMethods } from '@/shared/config/payment';
import { PRICING_PLANS, FULL_FEATURE_LIST, formatRupiah, type PricingPlan } from '@/shared/config/pricing';
import { Card } from '@/components/ui/Card';
import { apiErrorMessage, apiRequest, isApiClientError } from '@/shared/http/api-client';


function createPaymentReference(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  // RFC 4122 v4 bits. If getRandomValues is unavailable, mix timestamp only as a
  // last-resort format-preserving identifier; server reconciliation still requires
  // an exact UUID and never treats this identifier as proof of payment.
  if (!bytes.some(Boolean)) {
    const seed = Date.now();
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (seed >> ((i % 6) * 8)) & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

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
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API tidak tersedia (non-HTTPS/no permission) - biarkan diam,
      // user masih bisa select-and-copy manual dari teks yang tampil.
    }
  };

  return (
    <Card padding="none" radius="md" elevation="none" highlight={false} overflow="visible" className="flex items-center justify-between gap-3 border-tv-border px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-tv-muted">{label}</p>
        <p className="text-sm font-bold text-tv-text truncate">{value}</p>
        <p className="text-xs text-tv-muted truncate">a.n. {name}</p>
      </div>
      <Button variant="bare" size="none"
        type="button"
        onClick={handleCopy}
        className="flex-shrink-0 flex items-center gap-1 text-xs font-bold text-tv-blue hover:text-tv-blueHover transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? 'Tersalin' : 'Salin'}
      </Button>
    </Card>
  );
}

export default function PaywallModal({
  open,
  onClose,
  title,
  body,
  benefits = [],
  waText,
  ctaLabel = 'Kirim Bukti Transfer via WhatsApp',
  secondaryLabel = 'Nanti',
  ctaHref,
}: PaywallModalProps) {
  // BUG FIX (permintaan eksplisit 2026-08-03): dulu HANYA satu harga tetap (Rp99.000/
  // bulan) hardcoded di sini, dipakai identik oleh ~10 halaman berbeda (backtest,
  // compare, dashboard, fundamental, dst.) - tidak ada cara pengguna memilih durasi
  // lain. Sekarang pemilih paket (1/3/6/12 bulan, dari shared/config/pricing.ts) dan
  // daftar fitur LENGKAP ditambahkan di sini, satu tempat, otomatis berlaku ke semua
  // pemanggil - bukan mengulang array 3-item yang sama di setiap halaman.
  const [selectedPlanId, setSelectedPlanId] = useState<PricingPlan['id']>('1m');
  const [showAllFeatures, setShowAllFeatures] = useState(false);
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const selectedPlan = PRICING_PLANS.find((p) => p.id === selectedPlanId) || PRICING_PLANS[0];
  const isUpgradeFlow = !ctaHref; // ctaHref dipakai untuk modal ajakan DAFTAR (bukan bayar) - tidak relevan pilih paket/harga di sana.
  const resolvedWaText = waText || (isUpgradeFlow
    ? `Halo, saya sudah transfer untuk upgrade ke SahamLens Pro paket ${selectedPlan.label} (${formatRupiah(selectedPlan.finalPrice)}). Referensi SahamLens: ${paymentReference || 'belum dibuat'}. Ini bukti transfernya.`
    : 'Halo, saya sudah transfer untuk upgrade ke SahamLens Pro. Ini bukti transfernya.');
  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(resolvedWaText)}`;
  const modalRef = useRef<HTMLDivElement>(null);
  const paymentMethods = ctaHref ? [] : getPaymentMethods();

  const handleSendProof = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (!isUpgradeFlow || !paymentReference || paymentSubmitting) return;
    setPaymentSubmitting(true);
    setPaymentError(null);
    try {
      await apiRequest('/api/payment/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode: selectedPlan.id, reference: paymentReference }),
      });
      window.location.assign(waLink);
    } catch (error) {
      if (isApiClientError(error) && error.code === 'UNAUTHENTICATED') {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      setPaymentError(apiErrorMessage(error, 'Klaim pembayaran belum dapat dicatat. Periksa koneksi lalu coba lagi.', true));
    } finally {
      setPaymentSubmitting(false);
    }
  };

  useEffect(() => {
    if (!open || !isUpgradeFlow) return;
    setPaymentReference(createPaymentReference());
    setPaymentError(null);
  }, [open, isUpgradeFlow, selectedPlanId]);

  useModalBehavior({ open, onClose, containerRef: modalRef });

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
        <Button variant="bare" size="none"
          onClick={onClose}
          className="absolute top-4 right-4 text-tv-muted hover:text-tv-text transition-colors"
          aria-label="Tutup"
        >
          <X className="w-5 h-5" />
        </Button>

        <div className="w-12 h-12 rounded-lg bg-tv-blue flex items-center justify-center text-2xl mb-4">
          🔒
        </div>

        <h3 className="font-heading text-xl font-bold text-tv-text mb-2">{title}</h3>
        <p className="text-sm text-tv-muted leading-relaxed mb-5">{body}</p>

        {benefits.length > 0 && (
          <ul className="space-y-2 mb-5">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-tv-text">
                <span className="text-tv-blue flex-shrink-0">✓</span> {b}
              </li>
            ))}
          </ul>
        )}

        {isUpgradeFlow && (
          <div className="mb-5">
            <p className="text-xs font-bold text-tv-muted uppercase tracking-wide mb-2">Pilih Paket</p>
            <div className="grid grid-cols-2 gap-2">
              {PRICING_PLANS.map((plan) => (
                <Button variant="bare" size="none"
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`relative text-left rounded-md border px-3 py-2 transition-colors ${
                    selectedPlanId === plan.id
                      ? 'border-tv-blue bg-tv-blue/10'
                      : 'border-tv-border hover:bg-tv-hover'
                  }`}
                >
                  <p className="text-xs font-bold text-tv-text">{plan.label}</p>
                  {plan.discountPct > 0 && (
                    <p className="text-[10px] text-tv-muted line-through font-number">{formatRupiah(plan.normalPrice)}</p>
                  )}
                  <p className="text-sm font-bold text-tv-blue font-number">{formatRupiah(plan.finalPrice)}</p>
                  {plan.discountPct > 0 && <p className="text-[10px] text-tv-green font-bold">Hemat {plan.discountPct}%</p>}
                </Button>
              ))}
            </div>
          </div>
        )}

        {isUpgradeFlow && (
          <div className="mb-5">
            <Button variant="bare" size="none"
              type="button"
              onClick={() => setShowAllFeatures((v) => !v)}
              className="w-full flex items-center justify-between text-xs font-bold text-tv-muted uppercase tracking-wide mb-2 hover:text-tv-text transition-colors"
            >
              <span>Semua Fitur Pro ({FULL_FEATURE_LIST.length})</span>
              {showAllFeatures ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
            {showAllFeatures && (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {FULL_FEATURE_LIST.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-tv-text">
                    <span className="text-tv-blue flex-shrink-0">✓</span> {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
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

        {isUpgradeFlow && paymentReference && (
          <p className="mb-3 rounded-md border border-tv-border bg-tv-card px-3 py-2 text-[11px] text-tv-muted">
            Referensi pembayaran: <span className="font-number text-tv-text">{paymentReference}</span>. Kode ini ikut terkirim ke WhatsApp untuk rekonsiliasi.
          </p>
        )}

        {paymentError && (
          <p className="mb-3 rounded-md border border-tv-red/40 bg-tv-red/10 px-3 py-2 text-xs text-tv-red">
            {paymentError}
          </p>
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
              aria-disabled={paymentSubmitting}
              className={`flex-1 text-center bg-tv-blue hover:bg-tv-blueHover text-white font-bold py-3 rounded-md transition-all ${paymentSubmitting ? 'pointer-events-none opacity-60' : ''}`}
            >
              {paymentSubmitting ? 'Mencatat klaim…' : ctaLabel}
            </a>
          )}
          <Button variant="bare" size="none"
            onClick={onClose}
            className="flex-1 border border-tv-border text-tv-muted hover:bg-tv-hover hover:text-tv-text font-bold py-3 rounded-md transition-colors"
          >
            {secondaryLabel}
          </Button>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
