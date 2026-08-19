'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { MotionConfig } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { LanguageProvider } from '@/lib/i18n';
import Sidebar from '@/components/Sidebar';
import TopMarketBar from '@/components/TopMarketBar';
import MobileNav from '@/components/MobileNav';
import TrialExpiredGate from '@/components/TrialExpiredGate';
import SmartBackNavigation from '@/components/SmartBackNavigation';
import ThemeToggle from '@/components/ThemeToggle';
import PageTransition from '@/components/PageTransition';
import EnergySaver from '@/components/EnergySaver';
import SiteFooter from '@/components/SiteFooter';
import ScrollRestoration from '@/components/ScrollRestoration';
import { AuthUserProvider } from '@/lib/hooks/useAuthUser';
import { apiRequest } from '@/shared/http/api-client';

const AIChat = dynamic(() => import('@/components/AIChat'), { ssr: false, loading: () => null });

const BARE_AUTH_PAGES = ['/login', '/signup', '/forgot-password', '/reset-password', '/admin-login', '/admin'];

// Sebelum ini tidak ada jalan pintas ke konten sama sekali. Sidebar memuat 21 tujuan dan
// TopMarketBar menambah beberapa kontrol lagi, jadi pengguna keyboard maupun pembaca layar
// menelusuri seluruhnya SETIAP kali berpindah halaman sebelum sampai ke isi - sekitar 30
// perhentian tab yang isinya sama persis dengan halaman sebelumnya.
//
// `tabIndex={-1}` pada <main> itu WAJIB, bukan hiasan: tanpa itu tautan ini memindahkan
// gulir tapi TIDAK memindahkan fokus, jadi tab berikutnya kembali ke atas sidebar dan
// jalan pintasnya tidak menyelesaikan apa pun bagi pengguna keyboard.
const CONTENT_ID = 'lens-content';

function SkipToContent() {
  return (
    <a href={`#${CONTENT_ID}`} className="lens-skip-link">
      Lewati ke konten utama
    </a>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBareAuthPage = BARE_AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Presence heartbeat dibatasi lintas-tab. Request aplikasi normal sudah menyentuh
  // presence lewat getSession(); heartbeat ini hanya menjaga user yang sedang membaca
  // halaman tanpa interaksi tetap terlihat aktif. localStorage dipakai sebagai throttle
  // bersama supaya 3 tab tidak mengirim 3 heartbeat paralel.
  React.useEffect(() => {
    if (isBareAuthPage) return;

    const storageKey = 'sahamlens_presence_last_ping';
    const minIntervalMs = 5 * 60 * 1000;

    const pingIfDue = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      const lastPing = Number(window.localStorage.getItem(storageKey) || 0);
      if (Number.isFinite(lastPing) && now - lastPing < minIntervalMs) return;

      // Tulis SEBELUM fetch agar tab lain langsung melihat slot ini sudah diambil.
      window.localStorage.setItem(storageKey, String(now));
      void apiRequest('/api/auth/me', { method: 'GET', credentials: 'include' }).catch(() => undefined);
    };

    // AuthUserProvider sudah memanggil /api/auth/me saat mount dan request itu sendiri
    // menyentuh presence. Jangan ping lagi di frame yang sama; heartbeat pertama baru
    // diperlukan bila user tetap berada di halaman tanpa request lain.
    const interval = window.setInterval(pingIfDue, 60 * 1000);
    document.addEventListener('visibilitychange', pingIfDue);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', pingIfDue);
    };
  }, [isBareAuthPage]);

  // CELAH YANG DITUTUP DI SINI. Aturan @media (prefers-reduced-motion) di globals.css
  // hanya mengatur animasi CSS. Framer Motion menganimasi lewat JavaScript - ia tidak
  // melihat aturan itu sama sekali, padahal DIA-lah sumber gerak terbanyak di aplikasi
  // ini (fadeUp/scaleIn/stagger di hampir semua halaman). Jadi pengguna yang meminta
  // "kurangi gerakan" tetap mendapat seluruh animasi masuk.
  //
  // lib/motion.ts sebenarnya sudah mengecek preferensi itu, tapi hanya SEKALI saat modul
  // dimuat - kalau pengguna mengubah pengaturan OS-nya, nilainya sudah telanjur beku.
  // reducedMotion="user" mengurusnya secara reaktif dan menyeluruh, termasuk untuk
  // komponen yang menulis animasinya sendiri tanpa lewat lib/motion.
  const bungkus = (isi: React.ReactNode) => (
    <AuthUserProvider>
      <LanguageProvider>
        <MotionConfig reducedMotion="user">{isi}</MotionConfig>
      </LanguageProvider>
    </AuthUserProvider>
  );

  if (isBareAuthPage) return bungkus(<><EnergySaver /><ThemeToggle /><PageTransition>{children}</PageTransition></>);

  return bungkus(
    <div className="lens-app-shell flex min-h-screen w-full bg-tv-bg text-tv-text">
      <SkipToContent />
      <ScrollRestoration />
      <EnergySaver />
      <Sidebar />
      <div className="lens-shell-viewport relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopMarketBar />
        <main
          id={CONTENT_ID}
          tabIndex={-1}
          className="lens-main relative flex min-w-0 flex-1 flex-col overflow-y-auto"
        >
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 lens-ambient-bg" />
          <div className="relative z-[1] min-h-full">
            <PageTransition>{children}</PageTransition>
            {/* Sebelum ini, SELURUH halaman ber-shell tidak punya penutup sama sekali -
                termasuk jalan menuju /about. Ditaruh sebelum ruang bebas MobileNav supaya
                di HP tidak tertutup bilah navigasi bawah. */}
            <div className="px-4 pb-2 sm:px-6">
              <SiteFooter />
            </div>
            <div aria-hidden="true" className="lens-mobile-scroll-clearance pointer-events-none md:hidden" />
          </div>
        </main>
      </div>
      <SmartBackNavigation />
      <MobileNav />
      <AIChat />
      <TrialExpiredGate />
    </div>
  );
}

