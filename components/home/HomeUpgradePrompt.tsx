'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { FULL_FEATURE_LIST, PRICING_PLANS, formatRupiah, type PricingPlan } from '@/shared/config/pricing';
import { PRO_UI_ENABLED } from '@/shared/constants/access';

const PromoUpgradeModal = dynamic(() => import('@/components/PromoUpgradeModal'), { ssr: false });
const PaywallModal = dynamic(() => import('@/components/PaywallModal'), { ssr: false });

const PROMO_STORAGE_KEY = 'sahamlens_promo_last_seen';

function todayJakarta(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function markPromoSeenToday() {
  window.localStorage.setItem(PROMO_STORAGE_KEY, todayJakarta());
}

function hasSeenPromoToday(): boolean {
  return window.localStorage.getItem(PROMO_STORAGE_KEY) === todayJakarta();
}

export default function HomeUpgradePrompt({ shouldOffer }: { shouldOffer: boolean }) {
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoPlan, setPromoPlan] = useState<PricingPlan['id']>('1m');
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (!PRO_UI_ENABLED || !shouldOffer || hasSeenPromoToday()) return;
    setShowPromoModal(true);
  }, [shouldOffer]);

  const handleClosePromo = useCallback(() => {
    markPromoSeenToday();
    setShowPromoModal(false);
  }, []);

  const handleSelectPlan = useCallback((planId: PricingPlan['id']) => {
    markPromoSeenToday();
    setPromoPlan(planId);
    setShowPromoModal(false);
    setShowPaywall(true);
  }, []);

  const selectedPlan = PRICING_PLANS.find((plan) => plan.id === promoPlan) || PRICING_PLANS[0];

  // Keputusan produk 2026-08-23: fitur Pro belum ada, jadi promo yang menawarkan paket
  // berbayar tidak bisa dipenuhi siapa pun. Digerbang di sini - bukan di pemanggilnya -
  // supaya seluruh jalur yang merender promo ini ikut mati sekaligus.
  //
  // Gerbangnya SETELAH seluruh hook, bukan sebelumnya: `return null` di awal komponen
  // membuat useState/useEffect/useCallback di bawahnya terpanggil bersyarat dan melanggar
  // rules-of-hooks. Lint repo ini menangkapnya, dan itu memang benar.
  if (!PRO_UI_ENABLED) return null;

  return (
    <>
      <PromoUpgradeModal open={showPromoModal} onClose={handleClosePromo} onSelectPlan={handleSelectPlan} />
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title={`Upgrade ke ${selectedPlan.label} Pro`}
        body={`${formatRupiah(selectedPlan.finalPrice)}${selectedPlan.discountPct > 0 ? ` (hemat ${selectedPlan.discountPct}%)` : ''} - buka semua fitur Pro SahamLens.`}
        benefits={FULL_FEATURE_LIST}
        waText={`Halo, saya sudah transfer untuk upgrade ke SahamLens Pro paket ${selectedPlan.label} (${formatRupiah(selectedPlan.finalPrice)}). Ini bukti transfernya.`}
      />
    </>
  );
}
