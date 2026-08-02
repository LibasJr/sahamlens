# Popup Promo Upgrade Pro di Beranda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Popup promo 3 kartu (Gratis/Bulanan/Tahunan Pro) muncul sekali sehari di Beranda untuk user login yang belum Pro, klik kartu berbayar lanjut ke alur pembayaran manual yang sudah ada - sekalian perbaiki daftar fitur Pro yang salah di 7 halaman lain.

**Architecture:** Komponen baru `PromoUpgradeModal.tsx` (murni presentational, harga di-hardcode) dipicu dari `app/home/page.tsx` berdasarkan `/api/user/profile` (endpoint yang sudah ada) + localStorage "sudah dilihat hari ini". Klik kartu berbayar membuka `PaywallModal` yang sudah ada dengan teks berbeda per paket - tidak ada logika backend baru sama sekali.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind, framer-motion, lucide-react.

## Global Constraints

- Popup TIDAK PERNAH muncul untuk: pengunjung anonim (fetch profile 401), user dengan `hasProAccess: true` (Pro/admin/trial aktif), atau user yang localStorage key `sahamlens_promo_last_seen` sudah berisi tanggal hari ini (format `YYYY-MM-DD`).
- Menutup popup (tombol X, klik backdrop, klik kartu "Paket Gratis", ATAU klik kartu berbayar) selalu menulis tanggal hari ini ke localStorage terlebih dulu.
- Harga: Bulanan Pro Rp99.000/bulan, Tahunan Pro Rp990.000/tahun - angka ini di-hardcode di kode (bukan env var, beda dari nomor pembayaran yang memang rahasia).
- Fitur Pro yang boleh disebut di manapun (popup baru maupun 7 halaman lama): HANYA yang genuinely digerbang `checkProAccess`/`checkProAccessLive` di kode - Technical Analyzer unlimited, AI Pick LIVE, Council AI, Multi-agent AI, Compare Tool, Market Pulse, Bandar Flow Pro, Watchlist & Alert unlimited. Fundamental Analyzer, Stock Screener, Risk Calculator, Backtest, Corporate Calendar, Akun Demo TIDAK BOLEH disebut sebagai perk Pro - itu gratis untuk semua orang.
- Tidak ada logika backend baru - aktivasi Pro tetap manual oleh admin lewat `/admin`, sistem tidak melacak durasi/tanggal kedaluwarsa langganan.
- Tidak ada test otomatis untuk komponen client baru (`PromoUpgradeModal.tsx`) - konsisten dengan `PaywallModal.tsx`/`SetProForm.tsx` yang juga tidak ada test.

---

## Task 1: Komponen `PromoUpgradeModal.tsx`

**Files:**
- Create: `components/PromoUpgradeModal.tsx`

**Interfaces:**
- Produces: `export interface PromoUpgradeModalProps { open: boolean; onClose: () => void; onSelectPlan: (plan: 'monthly' | 'annual') => void; }` dan `export default function PromoUpgradeModal(props: PromoUpgradeModalProps)` - dipakai Task 2 (`app/home/page.tsx`).

- [ ] **Step 1: Buat komponen**

Buat file `components/PromoUpgradeModal.tsx`:

```tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Check, Crown } from 'lucide-react';

interface PromoUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  onSelectPlan: (plan: 'monthly' | 'annual') => void;
}

// Fitur Pro genuinely ter-gerbang checkProAccess/checkProAccessLive di kode -
// JANGAN tambah Fundamental Analyzer/Screener/Risk Calculator/Backtest/Calendar/
// Akun Demo ke daftar ini, semua itu gratis untuk semua orang (lihat spec
// docs/superpowers/specs/2026-08-02-promo-upgrade-popup-design.md).
const PRO_FEATURES = [
  'Unlimited Technical Analyzer (10 filter)',
  'AI Pick LIVE & Rekomendasi Saham',
  'Council AI, Compare Tool & Market Pulse',
  'Bandar Flow Pro & Watchlist/Alert Unlimited',
];

const FREE_FEATURES = ['Watchlist maks. 3 saham', 'Alert maks. 2', '5 analisa saham/hari'];

// Struktur overlay/focus-trap sama dengan PaywallModal.tsx/UserProfileModal.tsx -
// komponen terpisah karena kontennya beda (3 kartu perbandingan, bukan 1 CTA).
export default function PromoUpgradeModal({ open, onClose, onSelectPlan }: PromoUpgradeModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

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
          onClick={onClose}
        >
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Butuh Analisis Lebih Dalam?"
            className="relative w-full max-w-3xl bg-tv-bg border border-tv-blue/40 rounded-xl shadow-2 p-6 overflow-hidden max-h-[90vh] overflow-y-auto"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-tv-muted hover:text-tv-text transition-colors"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-heading text-xl font-bold text-tv-text mb-1">Butuh Analisis Lebih Dalam?</h3>
            <p className="text-sm text-tv-muted mb-5">Pilih paket yang cocok buat kamu</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-tv-border rounded-lg p-5 flex flex-col">
                <h4 className="font-heading text-base font-bold text-tv-text mb-3">Paket Gratis</h4>
                <div className="mb-4">
                  <span className="font-number text-2xl font-bold text-tv-text">Rp 0</span>
                  <span className="text-xs text-tv-muted">/bulan</span>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {FREE_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-tv-muted">
                      <Check className="w-3.5 h-3.5 text-tv-green flex-shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={onClose}
                  className="w-full border border-tv-border text-tv-text font-bold py-2.5 rounded-md text-sm hover:bg-tv-hover transition-colors"
                >
                  Mulai Gratis
                </button>
              </div>

              <div className="border-2 border-tv-blue rounded-lg p-5 flex flex-col relative">
                <span className="absolute -top-3 left-5 bg-tv-blue text-white text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded">
                  Populer
                </span>
                <h4 className="font-heading text-base font-bold text-tv-text mb-3 mt-1">Bulanan Pro</h4>
                <div className="mb-4">
                  <span className="font-number text-2xl font-bold text-tv-text">Rp 99.000</span>
                  <span className="text-xs text-tv-muted">/bulan</span>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-tv-text">
                      <Check className="w-3.5 h-3.5 text-tv-blue flex-shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => onSelectPlan('monthly')}
                  className="w-full flex items-center justify-center gap-2 bg-tv-blue hover:bg-tv-blueHover text-white font-bold py-2.5 rounded-md text-sm transition-colors"
                >
                  <Crown className="w-4 h-4" /> Upgrade ke Pro
                </button>
              </div>

              <div className="border border-tv-border rounded-lg p-5 flex flex-col relative">
                <span className="absolute -top-3 left-5 bg-tv-gold text-tv-bg text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded">
                  Hemat 2 Bulan
                </span>
                <h4 className="font-heading text-base font-bold text-tv-text mb-3 mt-1">Tahunan Pro</h4>
                <div className="mb-4">
                  <span className="font-number text-2xl font-bold text-tv-text">Rp 990.000</span>
                  <span className="text-xs text-tv-muted">/tahun</span>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-tv-text">
                      <Check className="w-3.5 h-3.5 text-tv-blue flex-shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => onSelectPlan('annual')}
                  className="w-full flex items-center justify-center gap-2 bg-tv-blue hover:bg-tv-blueHover text-white font-bold py-2.5 rounded-md text-sm transition-colors"
                >
                  <Crown className="w-4 h-4" /> Upgrade ke Pro
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Jalankan typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: tidak ada error.

- [ ] **Step 3: Commit**

```bash
git add components/PromoUpgradeModal.tsx
git commit -m "feat: tambah komponen popup promo 3 paket (Gratis/Bulanan/Tahunan Pro)"
```

---

## Task 2: Wiring ke Beranda (`app/home/page.tsx`)

**Files:**
- Modify: `app/home/page.tsx`

**Interfaces:**
- Consumes: `PromoUpgradeModal` dari Task 1 (props: `open`, `onClose`, `onSelectPlan`); `PaywallModal` dari `@/components/PaywallModal` (sudah ada, props: `open`, `onClose`, `title`, `body`, `benefits`, `waText`).
- Consumes: `GET /api/user/profile` (sudah ada) - response `{ hasProAccess: boolean, ... }` pada 200, apapun selain 200 (termasuk 401 untuk pengunjung anonim) dianggap "jangan tampilkan popup".

- [ ] **Step 1: Tambah import dan konstanta localStorage**

Modify `app/home/page.tsx`. Ubah baris import dari:

```tsx
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { fadeUp, staggerContainer } from '@/lib/motion';
```

jadi:

```tsx
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { fadeUp, staggerContainer } from '@/lib/motion';
import PromoUpgradeModal from '@/components/PromoUpgradeModal';
import PaywallModal from '@/components/PaywallModal';
```

Tambahkan konstanta dan helper setelah baris `const PICK_UNIVERSE = ...`:

```tsx

const PROMO_STORAGE_KEY = 'sahamlens_promo_last_seen';

function markPromoSeenToday() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROMO_STORAGE_KEY, new Date().toISOString().slice(0, 10));
}

function hasSeenPromoToday(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(PROMO_STORAGE_KEY) === new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Tambah state dan fetch profile**

Tambahkan state baru setelah baris `const [loadingNews, setLoadingNews] = useState(true);`:

```tsx
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoPlan, setPromoPlan] = useState<'monthly' | 'annual'>('monthly');
  const [showPaywallFromPromo, setShowPaywallFromPromo] = useState(false);
```

Tambahkan effect baru (terpisah dari effect data pasar yang sudah ada), setelah effect utama yang berisi `fetch('/api/news', ...)`:

```tsx

  useEffect(() => {
    fetch('/api/user/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((profile) => {
        if (profile && !profile.hasProAccess && !hasSeenPromoToday()) {
          setShowPromoModal(true);
        }
      })
      .catch(() => {});
  }, []);
```

- [ ] **Step 3: Tambah handler**

Tambahkan fungsi handler setelah baris `const topPick = aiPicks.find(...)`:

```tsx

  const handleClosePromo = () => {
    markPromoSeenToday();
    setShowPromoModal(false);
  };

  const handleSelectPlan = (plan: 'monthly' | 'annual') => {
    markPromoSeenToday();
    setPromoPlan(plan);
    setShowPromoModal(false);
    setShowPaywallFromPromo(true);
  };
```

- [ ] **Step 4: Render kedua modal**

Tambahkan sebelum baris penutup `</div>` paling akhir file (setelah `</motion.div>` penutup card "Berita & Sentimen Pasar"):

```tsx

      <PromoUpgradeModal open={showPromoModal} onClose={handleClosePromo} onSelectPlan={handleSelectPlan} />
      <PaywallModal
        open={showPaywallFromPromo}
        onClose={() => setShowPaywallFromPromo(false)}
        title={promoPlan === 'annual' ? 'Upgrade ke Tahunan Pro' : 'Upgrade ke Bulanan Pro'}
        body={
          promoPlan === 'annual'
            ? 'Rp990.000/tahun - buka semua fitur Pro SahamLens, hemat setara 2 bulan dibanding bulanan.'
            : 'Rp99.000/bulan - buka semua fitur Pro SahamLens.'
        }
        benefits={[
          'Unlimited Technical Analyzer (10 filter)',
          'AI Pick LIVE, Council AI & Compare Tool',
          'Watchlist & Alert unlimited',
        ]}
        waText={
          promoPlan === 'annual'
            ? 'Halo, saya sudah transfer untuk upgrade ke SahamLens Pro TAHUNAN (Rp990.000/tahun). Ini bukti transfernya.'
            : 'Halo, saya sudah transfer untuk upgrade ke SahamLens Pro BULANAN (Rp99.000/bulan). Ini bukti transfernya.'
        }
      />
```

- [ ] **Step 5: Jalankan typecheck + full suite**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: tidak ada error.

Run: `npx vitest run`
Expected: semua test lolos (tidak ada test yang menyentuh file ini, jadi jumlahnya harus sama seperti sebelumnya).

- [ ] **Step 6: Verifikasi manual di browser**

Run `npm run dev`, buka `/home` dalam kondisi:
- **Belum login** (buka di tab incognito) → popup TIDAK muncul.
- **Login sebagai akun Free/trial** → popup muncul otomatis sekali. Tutup pakai tombol X → refresh halaman → popup TIDAK muncul lagi (localStorage `sahamlens_promo_last_seen` sudah keisi hari ini, cek lewat Application tab devtools).
- Hapus manual key `sahamlens_promo_last_seen` di localStorage lewat devtools → refresh → popup muncul lagi.
- Klik "Bulanan Pro" → popup promo tertutup, `PaywallModal` muncul dengan judul "Upgrade ke Bulanan Pro" dan menyebut Rp99.000/bulan.
- Tutup, buka lagi (hapus localStorage), klik "Tahunan Pro" kali ini → `PaywallModal` muncul dengan judul "Upgrade ke Tahunan Pro" dan menyebut Rp990.000/tahun.
- **Login sebagai akun admin atau akun Pro** → popup TIDAK muncul sama sekali.

- [ ] **Step 7: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat: tampilkan popup promo upgrade Pro di Beranda"
```

---

## Task 3: Perbaiki daftar fitur Pro yang salah di 7 halaman (8 kemunculan)

**Files:**
- Modify: `app/dashboard/page.tsx` (2 kemunculan)
- Modify: `app/fundamental/page.tsx` (2 kemunculan)
- Modify: `app/breakout-radar/page.tsx`
- Modify: `app/compare/page.tsx`
- Modify: `app/market-pulse/page.tsx`
- Modify: `app/recommendations/page.tsx`
- Modify: `app/watchlist/page.tsx`

**Interfaces:** Tidak ada - task ini murni mengganti isi array string `benefits={[...]}` yang sudah ada, tidak menyentuh struktur komponen manapun.

- [ ] **Step 1: Ganti 6 kemunculan yang identik**

Di keenam file berikut, cari teks persis `'Fundamental Analyzer + Watchlist unlimited',` (baris sebelumnya selalu `'Unlimited Technical Analyzer (10 filter)',` dan `'AI Pick LIVE',`) - ganti blok 3 baris itu:

Dari:
```tsx
          'Unlimited Technical Analyzer (10 filter)',
          'AI Pick LIVE',
          'Fundamental Analyzer + Watchlist unlimited',
```

Jadi:
```tsx
          'Unlimited Technical Analyzer (10 filter)',
          'AI Pick LIVE, Council AI & Compare Tool',
          'Watchlist & Alert unlimited',
```

(Indentasi mengikuti yang sudah ada di tiap file - beberapa pakai 10 spasi, beberapa 8, sesuaikan dengan indentasi baris `'Unlimited Technical Analyzer...'` yang sudah ada persis di atasnya, jangan ubah levelnya.)

Terapkan di:
- `app/dashboard/page.tsx` - ADA 2 KEMUNCULAN, ganti KEDUANYA (sekitar baris 507-509 dan baris 1045-1047).
- `app/fundamental/page.tsx` - ADA 2 KEMUNCULAN, ganti KEDUANYA (sekitar baris 214-216 dan baris 476-478).
- `app/breakout-radar/page.tsx` - 1 kemunculan (sekitar baris 863-865).
- `app/compare/page.tsx` - 1 kemunculan (sekitar baris 237-239).
- `app/market-pulse/page.tsx` - 1 kemunculan (sekitar baris 540-542).
- `app/recommendations/page.tsx` - 1 kemunculan (sekitar baris 393-395).

- [ ] **Step 2: Ganti kemunculan `app/watchlist/page.tsx`**

Cari teks persis `'Sinkronisasi alert ke Telegram (Libas Bot)',` (sekitar baris 550-554). Ganti blok 3 baris:

Dari:
```tsx
          'Watchlist unlimited (bukan cuma 3 saham)',
          'Sinkronisasi alert ke Telegram (Libas Bot)',
          'Semua fitur Pro lainnya',
```

Jadi:
```tsx
          'Watchlist unlimited (bukan cuma 3 saham)',
          'Alert unlimited (bukan cuma 2)',
          'AI Pick LIVE, Council AI & fitur Pro lainnya',
```

- [ ] **Step 3: Verifikasi tidak ada yang tertinggal**

Run: `grep -rn "Fundamental Analyzer + Watchlist unlimited\|Sinkronisasi alert ke Telegram" app/`
Expected: tidak ada hasil sama sekali (semua 8 kemunculan sudah diganti).

- [ ] **Step 4: Jalankan typecheck + full suite**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: tidak ada error (ini murni string literal, tidak mungkin bikin type error, tapi konfirmasi tetap).

Run: `npx vitest run`
Expected: semua test lolos, jumlah sama seperti sebelumnya.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx app/fundamental/page.tsx app/breakout-radar/page.tsx app/compare/page.tsx app/market-pulse/page.tsx app/recommendations/page.tsx app/watchlist/page.tsx
git commit -m "fix: perbaiki daftar fitur Pro yang salah (Fundamental Analyzer & Telegram sync sebenarnya gratis)"
```

---

## Verifikasi Akhir (setelah semua task selesai)

- [ ] Run `npx vitest run` - semua test lolos.
- [ ] Run `npx tsc --noEmit -p tsconfig.json` - tidak ada error.
- [ ] Run `grep -rn "Fundamental Analyzer + Watchlist unlimited\|Sinkronisasi alert ke Telegram" app/` - kosong.
- [ ] Uji end-to-end manual sesuai Task 2 Step 6 - popup muncul/tidak muncul sesuai kondisi akun, klik kartu berbayar membuka PaywallModal dengan teks yang benar per paket.
