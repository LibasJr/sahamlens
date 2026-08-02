# Ganti Metode Pembayaran Upgrade Pro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti alur upgrade Pro dari "chat WhatsApp untuk tanya cara bayar" jadi menampilkan metode pembayaran (DANA/GoPay/bank transfer) langsung di modal upgrade, dengan notifikasi Telegram instan ke admin dan tombol aktivasi/nonaktivasi Pro di halaman admin.

**Architecture:** Nomor pembayaran dibaca dari environment variable client-safe (`NEXT_PUBLIC_PAYMENT_*`) lewat fungsi baru `getPaymentMethods()`, dirender di `PaywallModal`. Tombol kirim-bukti memicu notifikasi Telegram (memakai `sendTelegramMessage` yang sudah ada) sebelum membuka WhatsApp. Aktivasi Pro jadi aksi baru di halaman admin yang sudah ada (`/admin`, digerbang cookie admin terpisah), lewat controller function baru yang memanggil `updateUser()` yang sudah ada.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, environment variables Vercel.

## Global Constraints

- Env var nomor pembayaran memakai prefix `NEXT_PUBLIC_PAYMENT_*` (client-safe, di-inline saat build) - nilai asli TIDAK PERNAH ditulis ke file yang ter-commit ke git (spec, kode, dokumentasi) - hanya nama variabelnya.
- Semua route API baru wajib mulai dengan `import { guard } from '@/lib/sahamLensGuard'; guard();` di baris pertama (pola wajib semua route di repo ini).
- Aksi admin (`set-pro`) digerbang `isAdminFromRequestCookies()` (cookie admin terpisah dari sesi akun biasa) - BUKAN `session.role === 'admin'`.
- Error dari controller dilempar sebagai `AppError` subclass (`ForbiddenError`, `ValidationError`, `NotFoundError`) dari `shared/errors/app-error.ts`, ditangkap otomatis oleh `runController()` - controller tidak pernah mengembalikan `{status, body}` error secara manual.
- Tidak ada gambar QRIS pada iterasi ini - hanya nomor/rekening + tombol salin.
- Status Pro (`is_pro`) tetap boolean on/off tanpa tanggal kedaluwarsa otomatis - tidak menambah kolom baru di database.
- Tidak menambah test untuk komponen client (`PaywallModal.tsx`, `SetProForm.tsx`) atau untuk `/api/payment/notify` (konsisten dengan spec - lihat `docs/superpowers/specs/2026-08-02-manual-payment-method-design.md` bagian Testing).

---

## Task 1: Konfigurasi metode pembayaran (`shared/config/payment.ts`)

**Files:**
- Create: `shared/config/payment.ts`
- Test: `shared/config/__tests__/payment.test.ts`

**Interfaces:**
- Produces: `export interface PaymentMethod { id: 'dana' | 'gopay' | 'bank'; label: string; accountNumber: string; accountName: string; }` dan `export function getPaymentMethods(): PaymentMethod[]` - dipakai Task 2 (`PaywallModal.tsx`).

- [ ] **Step 1: Buat folder test dan tulis test yang gagal**

Buat file `shared/config/__tests__/payment.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getPaymentMethods } from '../payment';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getPaymentMethods', () => {
  it('mengembalikan array kosong kalau semua env var payment kosong', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME', '');

    expect(getPaymentMethods()).toEqual([]);
  });

  it('hanya mengembalikan DANA kalau cuma env var DANA yang lengkap', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NUMBER', '085200000000');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NAME', 'BUDI SANTOSO');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME', '');

    expect(getPaymentMethods()).toEqual([
      { id: 'dana', label: 'DANA', accountNumber: '085200000000', accountName: 'BUDI SANTOSO' },
    ]);
  });

  it('mengembalikan ketiga metode dengan urutan DANA, GoPay, bank kalau semua lengkap', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NUMBER', '085200000000');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NAME', 'BUDI SANTOSO');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER', '085211111111');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NAME', 'BUDI SANTOSO');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_NAME', 'BCA');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER', '1234567890');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME', 'BUDI SANTOSO');

    expect(getPaymentMethods()).toEqual([
      { id: 'dana', label: 'DANA', accountNumber: '085200000000', accountName: 'BUDI SANTOSO' },
      { id: 'gopay', label: 'GoPay', accountNumber: '085211111111', accountName: 'BUDI SANTOSO' },
      { id: 'bank', label: 'BCA', accountNumber: '1234567890', accountName: 'BUDI SANTOSO' },
    ]);
  });

  it('melewati bank kalau salah satu dari tiga env var bank kosong', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_DANA_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_GOPAY_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_NAME', 'BCA');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER', '1234567890');
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME', '');

    expect(getPaymentMethods()).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run shared/config/__tests__/payment.test.ts`
Expected: FAIL - `Cannot find module '../payment'` (file `shared/config/payment.ts` belum ada).

- [ ] **Step 3: Buat implementasi**

Buat file `shared/config/payment.ts`:

```ts
// Nomor pembayaran (DANA/GoPay/bank) untuk upgrade Pro - dibaca dari env var
// NEXT_PUBLIC_PAYMENT_* (client-safe, di-inline saat build oleh Next.js).
// Nilai asli HANYA ada di Vercel dashboard + .env.local lokal (gitignored),
// TIDAK PERNAH ditulis di file manapun yang ter-commit - lihat DEPLOYMENT.md
// untuk daftar nama variabelnya.
//
// Metode yang env var-nya tidak lengkap (kosong/belum di-set) dilewati, bukan
// dianggap error - supaya rollout bertahap (mis. cuma bank dulu) tetap jalan.

export interface PaymentMethod {
  id: 'dana' | 'gopay' | 'bank';
  label: string;
  accountNumber: string;
  accountName: string;
}

export function getPaymentMethods(): PaymentMethod[] {
  const methods: PaymentMethod[] = [];

  if (process.env.NEXT_PUBLIC_PAYMENT_DANA_NUMBER && process.env.NEXT_PUBLIC_PAYMENT_DANA_NAME) {
    methods.push({
      id: 'dana',
      label: 'DANA',
      accountNumber: process.env.NEXT_PUBLIC_PAYMENT_DANA_NUMBER,
      accountName: process.env.NEXT_PUBLIC_PAYMENT_DANA_NAME,
    });
  }

  if (process.env.NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER && process.env.NEXT_PUBLIC_PAYMENT_GOPAY_NAME) {
    methods.push({
      id: 'gopay',
      label: 'GoPay',
      accountNumber: process.env.NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER,
      accountName: process.env.NEXT_PUBLIC_PAYMENT_GOPAY_NAME,
    });
  }

  if (
    process.env.NEXT_PUBLIC_PAYMENT_BANK_NAME &&
    process.env.NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER &&
    process.env.NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME
  ) {
    methods.push({
      id: 'bank',
      label: process.env.NEXT_PUBLIC_PAYMENT_BANK_NAME,
      accountNumber: process.env.NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER,
      accountName: process.env.NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME,
    });
  }

  return methods;
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `npx vitest run shared/config/__tests__/payment.test.ts`
Expected: PASS - 4 test lolos.

- [ ] **Step 5: Commit**

```bash
git add shared/config/payment.ts shared/config/__tests__/payment.test.ts
git commit -m "feat: tambah konfigurasi metode pembayaran DANA/GoPay/bank dari env var"
```

---

## Task 2: Tampilkan metode pembayaran di modal + notifikasi Telegram

**Files:**
- Create: `app/api/payment/notify/route.ts`
- Modify: `components/PaywallModal.tsx`
- Modify: `app/breakout-radar/page.tsx`, `app/compare/page.tsx`, `app/dashboard/page.tsx`, `app/fundamental/page.tsx`, `app/market-pulse/page.tsx`, `app/recommendations/page.tsx`, `app/watchlist/page.tsx` (hapus override `waText`/`ctaLabel` lama supaya ikut default baru - lihat Step 6)

**Interfaces:**
- Consumes: `getPaymentMethods()` dan `PaymentMethod` dari `shared/config/payment.ts` (Task 1); `getSession` dari `@/modules/user`; `sendTelegramMessage` dari `@/lib/telegram` (sudah ada, tidak berubah).
- Produces: tidak ada yang dikonsumsi task lain (task ini murni user-facing, tidak ada task berikutnya yang bergantung pada file-file ini).

- [ ] **Step 1: Buat route notifikasi Telegram**

Buat file `app/api/payment/notify/route.ts`:

```ts
import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession } from '@/modules/user';
import { sendTelegramMessage } from '@/lib/telegram';

// Dipanggil dari PaywallModal tiap kali user klik "Kirim Bukti Transfer via
// WhatsApp" - notifikasi heads-up instan ke Telegram admin SEBELUM admin
// sempat buka WhatsApp untuk cek bukti fisiknya. Best-effort: selalu balas 200,
// kegagalan kirim Telegram (lihat sendTelegramMessage) tidak boleh menghalangi
// user membuka link WhatsApp di sisi client.
export async function POST() {
  const session = await getSession();
  const identifier = session?.email ?? 'Pengunjung (belum login)';
  await sendTelegramMessage(
    `💰 <b>Klaim Transfer Pro</b>\n${identifier} klaim sudah transfer Rp99.000/bulan untuk upgrade Pro.\nCek WhatsApp untuk bukti transfer, lalu aktifkan di /admin.`
  );
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verifikasi manual route (server dev harus jalan)**

Run: `npm run dev` (kalau belum jalan), lalu di terminal lain:
```bash
curl -X POST http://localhost:3001/api/payment/notify
```
Expected: response `{"ok":true}` (HTTP 200). Kalau `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` sudah di-set di `.env.local`, cek juga pesan masuk ke chat Telegram admin.

- [ ] **Step 3: Ubah `PaywallModal.tsx` - tambah bagian metode pembayaran + panggil endpoint notifikasi**

Modify `components/PaywallModal.tsx`. Ganti seluruh isi file jadi:

```tsx
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
```

Catatan perubahan dari versi lama: `waText` default dan `ctaLabel` default diubah jadi soal kirim bukti (bukan ajakan upgrade), `paymentMethods` dihitung dari `getPaymentMethods()` (kosong kalau `ctaHref` diisi - konteks signup, bukan pembayaran), ditambah `max-h-[90vh] overflow-y-auto` di container modal supaya tidak overflow layar kecil saat daftar metode pembayaran membuat modal lebih tinggi.

- [ ] **Step 4: Jalankan typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: tidak ada error baru terkait `PaywallModal.tsx` atau `app/api/payment/notify/route.ts`.

- [ ] **Step 5: Hapus override `waText`/`ctaLabel` lama di 7 halaman**

7 halaman memanggil `PaywallModal` untuk kasus "kena limit" dengan `waText`/`ctaLabel` di-hardcode ke teks lama ("Halo, saya mau upgrade..." / "Upgrade Pro") - override ini akan MENIMPA default baru dari Step 3 kalau tidak dihapus, membuat 7 dari 8 titik paywall di aplikasi tetap menampilkan ajakan upgrade lama alih-alih ajakan kirim bukti transfer, padahal bagian "Metode Pembayaran" yang baru sudah ikut tampil di situ juga (kontradiktif - user disuruh transfer lalu tombolnya masih bertanya "gimana caranya"). Hapus baris `waText=` dan `ctaLabel="Upgrade Pro"` di tiap file berikut supaya jatuh ke default baru:

`app/breakout-radar/page.tsx` - hapus baris ini (sekitar baris 867-868):
```tsx
        waText="Halo, saya mau upgrade ke SahamLens Pro (Rp99.000/bulan) - kena limit analisa harian"
        ctaLabel="Upgrade Pro"
```

`app/compare/page.tsx` - hapus baris yang sama persis (sekitar baris 239-240).

`app/dashboard/page.tsx` - hapus baris yang sama persis (sekitar baris 1049-1050).

`app/fundamental/page.tsx` - hapus baris yang sama persis (sekitar baris 480-481).

`app/market-pulse/page.tsx` - hapus baris yang sama persis (sekitar baris 544-545).

`app/recommendations/page.tsx` - hapus baris yang sama persis (sekitar baris 397-398).

`app/watchlist/page.tsx` - hapus baris ini (sekitar baris 555-556, teksnya sedikit beda - "kena limit watchlist" bukan "kena limit analisa harian"):
```tsx
        waText="Halo, saya mau upgrade ke SahamLens Pro (Rp99.000/bulan) - kena limit watchlist"
        ctaLabel="Upgrade Pro"
```

Di ketujuh file, baris `secondaryLabel="..."` yang ada tepat setelahnya TETAP DIPERTAHANKAN (tidak dihapus) - itu bukan bagian dari override yang usang.

- [ ] **Step 6: Jalankan typecheck ulang**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: tidak ada error (menghapus prop opsional tidak pernah menyebabkan type error, komponen tetap jatuh ke default).

- [ ] **Step 7: Verifikasi manual di browser**

Run `npm run dev`, buka halaman manapun yang memicu `PaywallModal` tanpa `ctaHref` (mis. buka `/watchlist` sebagai user non-Pro, atau trigger paywall lain). Pastikan:
- Bagian "Metode Pembayaran" muncul dengan 3 baris (DANA/GoPay/BCA) sesuai `.env.local`.
- Klik "Salin" pada salah satu baris mengubah teks tombol jadi "Tersalin" selama ~2 detik, dan nilai benar tersalin ke clipboard (paste ke tempat lain untuk cek).
- Tombol utama sekarang bertuliskan "Kirim Bukti Transfer via WhatsApp" (bukan lagi "Upgrade Pro") di SEMUA halaman yang sebelumnya di-cek di Step 5, termasuk `/watchlist`.
- Klik tombol utama membuka tab baru WhatsApp DAN (cek Network tab devtools) mengirim `POST /api/payment/notify`.
- Modal yang dipicu dengan `ctaHref` (ajakan daftar, mis. banner login-wall) TIDAK menampilkan bagian "Metode Pembayaran".

- [ ] **Step 8: Commit**

```bash
git add app/api/payment/notify/route.ts components/PaywallModal.tsx app/breakout-radar/page.tsx app/compare/page.tsx app/dashboard/page.tsx app/fundamental/page.tsx app/market-pulse/page.tsx app/recommendations/page.tsx app/watchlist/page.tsx
git commit -m "feat: tampilkan metode pembayaran DANA/GoPay/bank di modal upgrade + notif Telegram instan"
```

---

## Task 3: Aksi admin `handleSetProStatus` + route `POST /api/admin/set-pro`

**Files:**
- Modify: `modules/user/controller/admin.controller.ts`
- Modify: `modules/user/index.ts`
- Create: `app/api/admin/set-pro/route.ts`
- Test: `modules/user/controller/__tests__/admin.controller.test.ts`

**Interfaces:**
- Consumes: `getUserByEmail`, `updateUser` dari `modules/user/repository/user.repository.ts` (sudah ada); `ForbiddenError`, `ValidationError`, `NotFoundError` dari `shared/errors/app-error.ts` (sudah ada); `isAdminFromRequestCookies` dari `../service/admin.service` (sudah diimpor di file ini).
- Produces: `export async function handleSetProStatus(cookieStore: { get(name: string): { value: string } | undefined }, body: { email?: unknown; isPro?: unknown }): Promise<HttpResult>` - dipakai Task 4 secara tidak langsung lewat route `POST /api/admin/set-pro` (dipanggil `SetProForm.tsx`).

- [ ] **Step 1: Tulis test yang gagal**

Buat file `modules/user/controller/__tests__/admin.controller.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../repository/user.repository', () => ({
  getUserByEmail: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('../../../../shared/database/postgres.client', () => ({
  pool: { query: vi.fn() },
}));

import { handleSetProStatus } from '../admin.controller';
import { getUserByEmail, updateUser } from '../../repository/user.repository';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE } from '../../../../shared/constants/cookie-names';
import { ForbiddenError, ValidationError, NotFoundError } from '../../../../shared/errors/app-error';
import type { User } from '../../types/user.types';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@test.com',
    password_hash: 'hash',
    role: 'free',
    is_verified: true,
    is_pro: false,
    created_at: '2026-01-15T00:00:00.000Z',
    trial_ends_at: null,
    demo_ends_at: null,
    verification_code: null,
    verification_code_expires: null,
    reset_code: null,
    reset_code_expires: null,
    ...overrides,
  };
}

function adminCookieStore(isAdmin: boolean) {
  return {
    get: (name: string) => {
      if (name !== ADMIN_COOKIE) return undefined;
      return isAdmin ? { value: ADMIN_COOKIE_VALUE } : undefined;
    },
  };
}

describe('handleSetProStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tanpa cookie admin valid -> melempar ForbiddenError, updateUser tidak dipanggil', async () => {
    await expect(
      handleSetProStatus(adminCookieStore(false), { email: 'user@test.com', isPro: true })
    ).rejects.toThrow(ForbiddenError);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('email bukan string -> melempar ValidationError', async () => {
    await expect(
      handleSetProStatus(adminCookieStore(true), { email: undefined, isPro: true })
    ).rejects.toThrow(ValidationError);
  });

  it('isPro bukan boolean -> melempar ValidationError', async () => {
    await expect(
      handleSetProStatus(adminCookieStore(true), { email: 'user@test.com', isPro: 'yes' })
    ).rejects.toThrow(ValidationError);
  });

  it('user tidak ketemu -> melempar NotFoundError', async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(null);

    await expect(
      handleSetProStatus(adminCookieStore(true), { email: 'notfound@test.com', isPro: true })
    ).rejects.toThrow(NotFoundError);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('path sukses -> updateUser dipanggil dengan is_pro yang benar, balas 200', async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(makeUser({ id: 'user-42', email: 'user@test.com' }));
    vi.mocked(updateUser).mockResolvedValue(undefined);

    const result = await handleSetProStatus(adminCookieStore(true), { email: 'user@test.com', isPro: true });

    expect(updateUser).toHaveBeenCalledWith('user-42', { is_pro: true });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ email: 'user@test.com', isPro: true });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run modules/user/controller/__tests__/admin.controller.test.ts`
Expected: FAIL - `handleSetProStatus is not exported` atau serupa (fungsi belum ada).

- [ ] **Step 3: Tambah `handleSetProStatus` ke `admin.controller.ts`**

Modify `modules/user/controller/admin.controller.ts`. Ubah baris import di paling atas dari:

```ts
import crypto from 'crypto';
import { ForbiddenError } from '../../../shared/errors/app-error';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE, ADMIN_BADGE_COOKIE, ROLE_BADGE_COOKIE } from '../../../shared/constants/cookie-names';
import { isAdminFromRequestCookies, getAdminStatsToday, getAdminExportData } from '../service/admin.service';
import type { HttpResult, CookieToSet } from '../../../shared/types/http-result.types';
```

jadi:

```ts
import crypto from 'crypto';
import { ForbiddenError, ValidationError, NotFoundError } from '../../../shared/errors/app-error';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE, ADMIN_BADGE_COOKIE, ROLE_BADGE_COOKIE } from '../../../shared/constants/cookie-names';
import { isAdminFromRequestCookies, getAdminStatsToday, getAdminExportData } from '../service/admin.service';
import { getUserByEmail, updateUser } from '../repository/user.repository';
import type { HttpResult, CookieToSet } from '../../../shared/types/http-result.types';
```

Lalu tambahkan fungsi baru di akhir file (setelah `handleAdminExport`):

```ts

export async function handleSetProStatus(
  cookieStore: { get(name: string): { value: string } | undefined },
  body: { email?: unknown; isPro?: unknown }
): Promise<HttpResult> {
  if (!isAdminFromRequestCookies(cookieStore)) throw new ForbiddenError();
  if (typeof body.email !== 'string' || !body.email || typeof body.isPro !== 'boolean') {
    throw new ValidationError('email dan isPro wajib diisi dengan tipe yang benar');
  }
  const user = await getUserByEmail(body.email);
  if (!user) throw new NotFoundError('User tidak ditemukan');
  await updateUser(user.id, { is_pro: body.isPro });
  return { status: 200, body: { email: body.email, isPro: body.isPro } };
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `npx vitest run modules/user/controller/__tests__/admin.controller.test.ts`
Expected: PASS - 5 test lolos.

- [ ] **Step 5: Ekspor `handleSetProStatus` dari `modules/user/index.ts`**

Modify `modules/user/index.ts`, ubah blok ekspor admin controller dari:

```ts
export {
  handleAdminLoginByKey,
  handleAdminStatus,
  handleAdminStats,
  handleAdminExport,
} from './controller/admin.controller';
```

jadi:

```ts
export {
  handleAdminLoginByKey,
  handleAdminStatus,
  handleAdminStats,
  handleAdminExport,
  handleSetProStatus,
} from './controller/admin.controller';
```

- [ ] **Step 6: Buat route handler**

Buat file `app/api/admin/set-pro/route.ts`:

```ts
import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { handleSetProStatus } from '@/modules/user';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return runController(async () => handleSetProStatus(cookies(), body));
}
```

- [ ] **Step 7: Jalankan seluruh suite test + typecheck**

Run: `npx vitest run`
Expected: semua test lolos (termasuk 5 test baru di Step 4).

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: tidak ada error.

- [ ] **Step 8: Commit**

```bash
git add modules/user/controller/admin.controller.ts modules/user/controller/__tests__/admin.controller.test.ts modules/user/index.ts app/api/admin/set-pro/route.ts
git commit -m "feat: tambah aksi admin set-pro untuk aktivasi/nonaktivasi status Pro user"
```

---

## Task 4: Form aktivasi Pro di halaman admin + dokumentasi env var

**Files:**
- Create: `app/admin/SetProForm.tsx`
- Modify: `app/admin/page.tsx`
- Modify: `DEPLOYMENT.md`

**Interfaces:**
- Consumes: `POST /api/admin/set-pro` (Task 3) - request body `{ email: string; isPro: boolean }`, response `{ email: string; isPro: boolean }` (200) atau `{ error: string; code: string }` (403/400/404).

- [ ] **Step 1: Buat komponen form**

Buat file `app/admin/SetProForm.tsx`:

```tsx
'use client';

import React, { useState } from 'react';

export default function SetProForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const handleSubmit = async (isPro: boolean) => {
    if (!email.trim()) {
      setMessage({ text: 'Isi email dulu', isError: true });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/set-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), isPro }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || 'Gagal memproses', isError: true });
        return;
      }
      setMessage({ text: `${data.email} sekarang ${data.isPro ? 'Pro' : 'bukan Pro'}`, isError: false });
    } catch {
      setMessage({ text: 'Gagal terhubung ke server', isError: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-tv-card border border-tv-border rounded-lg p-6 mb-8">
      <h2 className="font-heading text-lg font-bold text-tv-text mb-4">Aktivasi Pro</h2>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@user.com"
          className="flex-1 bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => handleSubmit(true)}
          className="bg-tv-green hover:opacity-90 text-white font-bold px-4 py-2 rounded-md text-sm transition-opacity disabled:opacity-50"
        >
          Aktifkan Pro
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => handleSubmit(false)}
          className="bg-tv-red hover:opacity-90 text-white font-bold px-4 py-2 rounded-md text-sm transition-opacity disabled:opacity-50"
        >
          Nonaktifkan Pro
        </button>
      </div>
      {message && (
        <p className={`mt-3 text-sm ${message.isError ? 'text-tv-red' : 'text-tv-green'}`}>{message.text}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wiring ke `app/admin/page.tsx`**

Modify `app/admin/page.tsx`. Ubah import di baris atas dari:

```tsx
import React from 'react';
import { redirect } from 'next/navigation';
import { isAdminServer } from '@/modules/user';
import { getActiveUsers } from '@/shared/auth/presence';
import ExportButton from './ExportButton';
```

jadi:

```tsx
import React from 'react';
import { redirect } from 'next/navigation';
import { isAdminServer } from '@/modules/user';
import { getActiveUsers } from '@/shared/auth/presence';
import ExportButton from './ExportButton';
import SetProForm from './SetProForm';
```

Lalu tambahkan `<SetProForm />` tepat setelah baris `<div className="max-w-7xl mx-auto">` (sebelum blok "Aktif Sekarang"):

```tsx
      <div className="max-w-7xl mx-auto">
        <SetProForm />
        <div className="flex justify-between items-center mb-8">
```

- [ ] **Step 3: Jalankan typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: tidak ada error.

- [ ] **Step 4: Verifikasi manual di browser**

Run `npm run dev`, login admin lewat `/admin-login` (pakai `ADMIN_SECRET_KEY` di `.env.local`), buka `/admin`. Pastikan:
- Form "Aktivasi Pro" muncul di atas tabel "Aktif Sekarang".
- Masukkan email user yang benar-benar ada di database, klik "Aktifkan Pro" -> pesan sukses hijau muncul.
- Klik "Nonaktifkan Pro" pada email yang sama -> pesan sukses hijau muncul dengan status berbeda.
- Masukkan email yang tidak ada di database -> pesan error merah "User tidak ditemukan".
- Kosongkan email, klik salah satu tombol -> pesan error merah "Isi email dulu" tanpa memanggil API (cek Network tab devtools, tidak ada request terkirim).

- [ ] **Step 5: Update dokumentasi env var**

Modify `DEPLOYMENT.md`. Cari baris tabel environment variables (dimulai dengan header `| Var | Ada di Vercel? | Catatan |`), tambahkan baris baru setelah baris `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`:

```
| `NEXT_PUBLIC_PAYMENT_DANA_NUMBER` / `NEXT_PUBLIC_PAYMENT_DANA_NAME` / `NEXT_PUBLIC_PAYMENT_GOPAY_NUMBER` / `NEXT_PUBLIC_PAYMENT_GOPAY_NAME` / `NEXT_PUBLIC_PAYMENT_BANK_NAME` / `NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NUMBER` / `NEXT_PUBLIC_PAYMENT_BANK_ACCOUNT_NAME` | ✅ sudah di-set di Vercel Production (sesi 2026-08-02) | Dipakai `shared/config/payment.ts` untuk menampilkan metode pembayaran manual di `PaywallModal`. Nilai asli (nomor DANA/GoPay, nomor rekening, nama pemilik) HANYA ada di Vercel dashboard + `.env.local` lokal (gitignored) - jangan pernah commit nilainya ke git. Kalau salah satu metode belum diisi, baris itu otomatis tidak ditampilkan (lihat `getPaymentMethods()`). |
```

- [ ] **Step 6: Commit**

```bash
git add app/admin/SetProForm.tsx app/admin/page.tsx DEPLOYMENT.md
git commit -m "feat: tambah form aktivasi/nonaktivasi Pro di halaman admin + dokumentasi env var pembayaran"
```

---

## Verifikasi Akhir (setelah semua task selesai)

- [ ] Run `npx vitest run` - semua test lolos (termasuk 9 test baru dari Task 1 dan Task 3).
- [ ] Run `npx tsc --noEmit -p tsconfig.json` - tidak ada error.
- [ ] Uji end-to-end manual di browser: buka modal upgrade Pro (tanpa `ctaHref`) -> lihat 3 metode pembayaran -> salin salah satu -> klik kirim bukti -> WhatsApp terbuka & `POST /api/payment/notify` terkirim -> buka `/admin` -> aktifkan Pro untuk email test -> cek user tersebut sekarang punya akses Pro (mis. lewat modal profil `UserProfileModal` yang menampilkan `hasProAccess`).
