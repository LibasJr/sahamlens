'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { FULL_FEATURE_LIST, PRICING_PLANS, formatRupiah, type PricingPlan } from '@/shared/config/pricing';

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
    if (!shouldOffer || hasSeenPromoToday()) return;
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
