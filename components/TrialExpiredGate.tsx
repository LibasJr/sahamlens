'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import PromoUpgradeModal from './PromoUpgradeModal';
import PaywallModal from './PaywallModal';
import { PRICING_PLANS, FULL_FEATURE_LIST, formatRupiah, type PricingPlan } from '@/shared/config/pricing';

// Modal "Trial habis, upgrade ke premium" - muncul otomatis di halaman mana pun
// begitu masa trial 7 hari lewat (useAuthUser().isTrialExpired), tanpa perlu tiap
// halaman memasangnya sendiri. Sebelumnya logic ini cuma ada di app/dashboard dan
// app/home, jadi user yang trialnya habis bisa keliling halaman lain tanpa pernah
// diberi tahu kenapa datanya kosong.
//
// Sengaja TIDAK memblokir render halaman: gerbang data sesungguhnya ada di API
// (checkProAccess / checkProAccessLive) - modal ini menjelaskan situasinya, bukan
// menjadi satu-satunya penghalang.
export default function TrialExpiredGate() {
  const { isTrialExpired } = useAuthUser();
  const [dismissed, setDismissed] = useState(false);
  const [planId, setPlanId] = useState<PricingPlan['id']>('1m');
  const [showPaywall, setShowPaywall] = useState(false);

  // Reset saat pindah dari state expired (mis. admin baru mengaktifkan Pro lalu
  // user refresh) - tanpa ini, "dismissed" nempel selama tab tidak ditutup.
  useEffect(() => {
    if (!isTrialExpired) setDismissed(false);
  }, [isTrialExpired]);

  const handleSelectPlan = useCallback((id: PricingPlan['id']) => {
    setPlanId(id);
    setDismissed(true);
    setShowPaywall(true);
  }, []);

  const selectedPlan = PRICING_PLANS.find((p) => p.id === planId) || PRICING_PLANS[0];

  return (
    <>
      <PromoUpgradeModal
        open={isTrialExpired && !dismissed}
        onClose={() => setDismissed(true)}
        onSelectPlan={handleSelectPlan}
        title="Trial habis, upgrade ke premium"
        subtitle="Masa coba 7 hari kamu sudah berakhir. Pilih paket Pro untuk membuka lagi semua menu analisis."
      />
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
