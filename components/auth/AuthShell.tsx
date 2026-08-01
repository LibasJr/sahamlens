'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Card } from '../ui/Card';
import { fadeUp } from '../../lib/motion';

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
// yang ketiga). Satu wrapper: logo gradient-accent, glow ambient (token glow-blue/
// glow-purple yang sudah ada di tailwind.config.js tapi belum pernah dipakai), Card
// dari components/ui, entrance motion fadeUp.
export function AuthShell({ eyebrow, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-tv-bg flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] bg-glow-blue pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] bg-glow-purple pointer-events-none" />

      <motion.div
        initial="hidden"
        animate="show"
        variants={fadeUp}
        className="w-full max-w-md relative z-10"
      >
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-8">
          <div className="h-9 w-9 rounded-md bg-gradient-accent grid place-items-center font-heading font-bold text-[15px] text-white tracking-tight">
            SL
          </div>
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
      </motion.div>
    </div>
  );
}

export default AuthShell;
