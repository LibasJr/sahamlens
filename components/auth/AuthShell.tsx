'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card } from '../ui/Card';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

// Redesign UI/UX Fase 1 - shell bersama untuk semua 4 halaman auth (login/signup/
// forgot-password/reset-password), yang sebelumnya masing-masing punya bahasa
// visual sendiri-sendiri (hex terang/gelap, tv-* + font-mono, dan teal/rose gradient
// yang ketiga). Satu wrapper: logo solid (bukan gradient - halaman auth butuh kesan
// tenang/terpercaya, bukan "AI startup flashy"), Card dari components/ui, entrance
// motion fadeUp. Gradient/glow ambient sengaja TIDAK dipakai di sini - direservasi
// untuk fitur AI (Council/Chat) saja, lihat catatan di tailwind.config.js.
//
// BARU (2026-08-14, temuan Cloudflare Web Analytics - sahamlens.id/login LCP terburuk
// di seluruh app: P99 10.864ms, 20% Needs Improvement/Poor). Dulu wrapper ini
// `motion.div` framer-motion dengan `initial="hidden"` (opacity:0) - Next.js mem-SSR
// state "hidden" itu APA ADANYA sebagai inline style di HTML awal, jadi logo+judul
// (kandidat LCP paling besar di halaman ini) BENAR-BENAR TAK TERLIHAT sampai React
// selesai hidrasi dan menjalankan animation controller-nya - tertunda penuh oleh waktu
// unduh+parse+eksekusi bundle JS, bukan cuma waktu render. Itu skenario persis yang
// membuat ekor P99 meledak di koneksi/perangkat lambat. Diganti CSS keyframe
// `animate-fadeIn` (tailwind.config.js) - animasinya dijalankan compositor browser
// begitu stylesheet diterapkan, TIDAK menunggu JS hidrasi React sama sekali.
export function AuthShell({ eyebrow, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-tv-bg flex items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-md relative z-10 animate-fadeIn">
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-8">
          <Image src="/sahamlens-scope.png" alt="SahamLens" width={40} height={40} className="h-10 w-10 rounded-xl object-contain shadow-sm" priority />
          <span className="font-heading font-bold text-[18px] tracking-tight text-tv-text">SahamLens</span>
        </Link>

        <Card variant="default" padding="lg" className="rounded-xl">
          <div className="text-center mb-7">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tv-blue mb-1.5">{eyebrow}</p>
            <h1 className="font-heading text-[22px] font-bold text-tv-text tracking-tight">{title}</h1>
            {subtitle && <p className="text-tv-muted mt-1.5 text-[13px]">{subtitle}</p>}
          </div>

          {children}
        </Card>

        {footer ? (
          footer
        ) : (
          <p className="text-center text-[11px] text-tv-muted mt-6">
            <Link href="/" className="hover:text-tv-blue transition-colors">&larr; Kembali ke Ringkasan Pasar</Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default AuthShell;
