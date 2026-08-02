'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Sparkles, X } from 'lucide-react';
import { Badge } from '@/components/ui';
import { FREE_LIMITS, hasProAccess } from '@/lib/limits';
import PaywallModal from '@/components/PaywallModal';

const SESSION_KEY = 'sahamlens_promo_popup_seen';

// Fitur di bawah harus selalu cocok dengan gerbang Pro yang benar-benar aktif
// (lihat lib/limits.ts + status 402 di app/api/*/route.ts) - kartu ini sempat
// dibuat dari mockup gambar yang fitur & harganya cuma placeholder, bukan yang
// benar-benar berjalan (mis. harga tahunan di mockup lebih mahal dari 12x
// harga bulanan promo - tidak masuk akal sebagai paket "hemat").
const FREE_FEATURES = [
  `Watchlist maks. ${FREE_LIMITS.WATCHLIST} saham`,
  `Alert maks. ${FREE_LIMITS.ALERTS}`,
  `${FREE_LIMITS.analisaPerHari} analisa saham/hari`,
];

const PRO_FEATURES = [
  'Unlimited Technical Analyzer (10 filter)',
  'AI Pick LIVE & Stock Recommendations',
  'Fundamental Analyzer + Watchlist unlimited',
  'Council AI, Bandar Flow Pro & Backtest',
];

type PlanId = 'monthly' | 'yearly';

const PRO_PLANS: Record<PlanId, { title: string; body: string; waText: string; price: string; period: string; badge: string }> = {
  monthly: {
    title: 'Upgrade ke SahamLens Pro Bulanan',
    body: 'Rp 99.000/bulan untuk akses penuh: Technical Analyzer tanpa batas, AI Pick LIVE, Fundamental Analyzer, Council AI, Bandar Flow Pro, dan Backtest.',
    waText: 'Halo, saya sudah transfer untuk upgrade ke SahamLens Pro Bulanan (Rp99.000/bulan). Ini bukti transfernya.',
    price: 'Rp 99.000',
    period: '/bulan',
    badge: 'Populer',
  },
  yearly: {
    title: 'Upgrade ke SahamLens Pro Tahunan',
    body: 'Rp 990.000/tahun (setara 10 bulan, hemat 2 bulan dibanding bulanan) untuk akses penuh: Technical Analyzer tanpa batas, AI Pick LIVE, Fundamental Analyzer, Council AI, Bandar Flow Pro, dan Backtest.',
    waText: 'Halo, saya sudah transfer untuk upgrade ke SahamLens Pro Tahunan (Rp990.000/tahun). Ini bukti transfernya.',
    price: 'Rp 990.000',
    period: '/tahun',
    badge: 'Hemat 2 Bulan',
  },
};

export default function ProPromoBanner() {
  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Popup iklan - muncul otomatis sekali per sesi browser saat masuk Beranda,
  // bukan tiap kali halaman dibuka/refresh supaya tidak mengganggu.
  useEffect(() => {
    if (hasProAccess()) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handlePickPlan = (plan: PlanId) => {
    setOpen(false);
    setSelectedPlan(plan);
  };

  return (
    <>
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
              aria-label="Promo SahamLens Pro"
              className="relative w-full max-w-3xl bg-tv-bg border border-tv-blue/40 rounded-xl shadow-2 p-6 overflow-y-auto max-h-[90vh]"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                onClick={() => setOpen(false)}
                className="absolute top-4 right-4 text-tv-muted hover:text-tv-text transition-colors"
                aria-label="Tutup"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="font-heading text-xl font-bold text-white">Butuh Analisis Lebih Dalam?</h2>
              <p className="text-sm text-tv-muted mt-1">Pilih paket yang cocok buat kamu</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
                <Card>
                  <h3 className="font-heading text-base font-bold text-white">Paket Gratis</h3>
                  <p className="text-2xl font-number font-bold text-white mt-2">
                    Rp 0<span className="text-xs font-normal text-tv-muted"> /bulan</span>
                  </p>
                  <FeatureList features={FREE_FEATURES} />
                  <Link
                    href="/signup"
                    onClick={() => setOpen(false)}
                    className="mt-4 block text-center text-xs font-bold text-tv-text border border-tv-border rounded-md py-2.5 hover:bg-tv-hover transition-colors"
                  >
                    Mulai Gratis
                  </Link>
                </Card>

                <Card highlighted badge={PRO_PLANS.monthly.badge}>
                  <h3 className="font-heading text-base font-bold text-white">Bulanan Pro</h3>
                  <p className="text-2xl font-number font-bold text-white mt-2">
                    {PRO_PLANS.monthly.price}<span className="text-xs font-normal text-tv-muted">{PRO_PLANS.monthly.period}</span>
                  </p>
                  <FeatureList features={PRO_FEATURES} highlighted />
                  <button
                    type="button"
                    onClick={() => handlePickPlan('monthly')}
                    className="mt-4 w-full text-center text-xs font-bold text-white bg-tv-blue rounded-md py-2.5 hover:bg-tv-blueHover transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Upgrade ke Pro
                  </button>
                </Card>

                <Card highlighted badge={PRO_PLANS.yearly.badge}>
                  <h3 className="font-heading text-base font-bold text-white">Tahunan Pro</h3>
                  <p className="text-2xl font-number font-bold text-white mt-2">
                    {PRO_PLANS.yearly.price}<span className="text-xs font-normal text-tv-muted">{PRO_PLANS.yearly.period}</span>
                  </p>
                  <FeatureList features={PRO_FEATURES} highlighted />
                  <button
                    type="button"
                    onClick={() => handlePickPlan('yearly')}
                    className="mt-4 w-full text-center text-xs font-bold text-white bg-tv-blue rounded-md py-2.5 hover:bg-tv-blueHover transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Upgrade ke Pro
                  </button>
                </Card>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedPlan && (
        <PaywallModal
          open={!!selectedPlan}
          onClose={() => setSelectedPlan(null)}
          title={PRO_PLANS[selectedPlan].title}
          body={PRO_PLANS[selectedPlan].body}
          waText={PRO_PLANS[selectedPlan].waText}
          benefits={PRO_FEATURES}
        />
      )}
    </>
  );
}

function Card({ children, highlighted, badge }: { children: React.ReactNode; highlighted?: boolean; badge?: string }) {
  return (
    <div
      className={`rounded-lg border p-4 flex flex-col ${
        highlighted ? 'border-tv-blue/40 bg-tv-blue/[0.06]' : 'bg-tv-card border-tv-border'
      }`}
    >
      {badge && (
        <Badge variant="info" dot className="self-start mb-1">
          {badge}
        </Badge>
      )}
      {children}
    </div>
  );
}

function FeatureList({ features, highlighted }: { features: string[]; highlighted?: boolean }) {
  return (
    <ul className="space-y-1.5 mt-4 flex-1">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-xs text-tv-text">
          <Check className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${highlighted ? 'text-tv-blue' : 'text-tv-muted'}`} /> {f}
        </li>
      ))}
    </ul>
  );
}
