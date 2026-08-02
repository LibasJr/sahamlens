# Ganti Metode Pembayaran Upgrade Pro: DANA/GoPay/Transfer Bank Manual

## Konteks & Tujuan

Upgrade ke SahamLens Pro (Rp99.000/bulan) saat ini hanya menawarkan satu jalur:
klik tombol di `PaywallModal` yang langsung membuka chat WhatsApp ke admin.
User diminta mengarah ke admin dulu untuk tahu cara bayar, alih-alih langsung
melihat metode transfer di halaman upgrade.

Tujuan perubahan ini: tampilkan metode pembayaran (DANA, GoPay, transfer bank)
langsung di `PaywallModal`, sehingga WhatsApp hanya dipakai untuk **mengirim
bukti transfer**, bukan lagi sebagai satu-satunya cara mengetahui cara bayar.
Verifikasi tetap manual oleh admin (bukan integrasi payment gateway otomatis
seperti Midtrans/Xendit — belum ada akun merchant untuk itu).

Sebagai pelengkap, admin saat ini tidak punya cara mengaktifkan status Pro
seorang user selain mengedit database secara langsung. Perubahan ini
menambahkan aksi "Aktifkan Pro" / "Nonaktifkan Pro" di halaman admin yang
sudah ada, supaya proses verifikasi manual tidak lagi butuh akses database.

## Arsitektur

**Konfigurasi nomor pembayaran** disimpan sebagai environment variable
(`NEXT_PUBLIC_PAYMENT_*`), bukan hardcode di source code — nilainya berupa
data pribadi (nomor DANA/GoPay, nomor rekening, nama pemilik) yang sengaja
tidak boleh ikut ter-commit ke git, mengikuti pola `ADMIN_SECRET_KEY` dan
`INTERNAL_API_SECRET` yang sudah didokumentasikan di `DEPLOYMENT.md`. Nilai
sudah di-set di Vercel (Production) dan `.env.local` lokal pada sesi ini —
lihat `DEPLOYMENT.md` untuk daftar nama variabelnya (nilai asli tidak ditulis
di dokumen manapun yang ter-commit).

Tidak ada gambar QRIS pada iterasi ini (butuh file gambar asli dari akun
DANA/GoPay pemilik, belum tersedia) — user transfer manual dengan mengetik
nomor di aplikasi DANA/GoPay masing-masing, sama seperti transfer P2P biasa.

Sebagai tambahan, begitu user menekan tombol kirim bukti transfer, sistem
langsung mengirim notifikasi otomatis ke Telegram admin (memakai
`sendTelegramMessage` di `lib/telegram.ts` yang sudah ada untuk alert
harga/RSI/breakout — dipakai ulang, bukan pipeline baru) supaya admin dapat
sinyal instan sebelum sempat membuka WhatsApp untuk cek bukti fisiknya.

**Empat bagian yang berubah:**

1. `shared/config/payment.ts` (baru) — baca env var, ekspos daftar metode
   pembayaran yang tersedia (skip metode yang env var-nya kosong).
2. `components/PaywallModal.tsx` — tambah bagian "Metode Pembayaran" yang
   me-render daftar dari (1), tiap baris ada tombol salin ke clipboard. Tombol
   WhatsApp yang sudah ada diubah label/teksnya jadi mengirim bukti transfer,
   bukan menanyakan cara bayar. Sebelum membuka link WhatsApp, tombol ini
   memanggil `POST /api/payment/notify` (lihat bagian baru di bawah).
3. `app/api/payment/notify/route.ts` (baru) — kirim notifikasi Telegram
   instan ke admin saat tombol kirim-bukti ditekan.
4. Aksi "Aktifkan Pro" / "Nonaktifkan Pro" di `app/admin/page.tsx` (halaman
   admin yang sudah ada, digerbang `isAdminServer()` — cookie admin terpisah
   dari sesi akun biasa, bukan `role === 'admin'` pada akun biasa) + API route
   baru `POST /api/admin/set-pro`.

## Detail Komponen

### `shared/config/payment.ts`

```ts
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

Fungsi ini murni baca `process.env` (client-safe, karena semua pakai prefix
`NEXT_PUBLIC_` yang di-inline saat build) — tidak ada I/O, gampang diuji
dengan memanipulasi `process.env` di test lalu memanggil fungsi ini.

### `components/PaywallModal.tsx`

Render `getPaymentMethods()` sebagai daftar sebelum tombol WhatsApp. Tiap
baris: label metode, nomor/rekening + nama pemilik, tombol "Salin" yang
menyalin nomor ke clipboard (`navigator.clipboard.writeText`) dan menampilkan
feedback singkat ("Tersalin!") selama ~2 detik lalu kembali ke label semula.

Kalau `getPaymentMethods()` mengembalikan array kosong (belum ada env var
yang di-set sama sekali), bagian ini tidak dirender — modal jatuh kembali ke
perilaku lama (langsung tombol WhatsApp), supaya tidak ada state kosong yang
aneh kalau suatu saat semua env var payment dihapus.

Teks tombol WhatsApp (`ctaLabel`/link) diubah dari ajakan upgrade jadi ajakan
kirim bukti transfer, contoh: "Kirim Bukti Transfer via WhatsApp", dengan
pesan prefilled yang menyebut sudah transfer dan menunggu aktivasi.

Saat tombol ini diklik, sebelum membuka link WhatsApp: panggil
`fetch('/api/payment/notify', { method: 'POST' })` secara *fire-and-forget*
(tidak menunggu/tidak memblokir - kalau gagal atau lambat, link WhatsApp tetap
dibuka seperti biasa; notifikasi Telegram cuma nilai tambah, bukan syarat).

### `POST /api/payment/notify` (notifikasi Telegram instan ke admin)

Dipanggil dari `PaywallModal` tiap kali tombol kirim-bukti ditekan. Tidak
memerlukan body maupun status Pro/login (siapapun yang menekan tombol upgrade
dianggap sah memicu notifikasi - ini cuma notifikasi heads-up, bukan aksi yang
mengubah data). Route baru, langsung di route handler (tidak perlu lapisan
controller/repository terpisah untuk aksi sesederhana ini):

```ts
import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession } from '@/modules/user';
import { sendTelegramMessage } from '@/lib/telegram';

export async function POST() {
  const session = await getSession();
  const identifier = session?.email ?? 'Pengunjung (belum login)';
  await sendTelegramMessage(
    `💰 <b>Klaim Transfer Pro</b>\n${identifier} klaim sudah transfer Rp99.000/bulan untuk upgrade Pro.\nCek WhatsApp untuk bukti transfer, lalu aktifkan di /admin.`
  );
  return NextResponse.json({ ok: true });
}
```

`sendTelegramMessage` sudah menangani sendiri kasus token/chat ID kosong
(kembalikan `false`, log warning, tidak melempar error) - route ini tidak
perlu penanganan khusus untuk itu, selalu balas 200 ke client.

### Aksi admin: `POST /api/admin/set-pro`

Request body: `{ email: string; isPro: boolean }`.

Ditambahkan sebagai fungsi baru `handleSetProStatus` di
`modules/user/controller/admin.controller.ts`, persis mengikuti pola
`handleAdminStats`/`handleAdminExport` yang sudah ada di file yang sama:

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

`getUserByEmail`/`updateUser` sudah ada di
`modules/user/repository/user.repository.ts`. `ForbiddenError`,
`ValidationError`, `NotFoundError` sudah ada di
`shared/errors/app-error.ts`. Route handler `app/api/admin/set-pro/route.ts`
(baru) memanggil `runController(() => handleSetProStatus(cookies(), await
request.json()))`, mengikuti pola `app/api/admin/stats/route.ts`.

### `app/admin/page.tsx`

Tambah bagian baru di atas/bawah tabel "Aktif Sekarang": form kecil (input
email + tombol "Aktifkan Pro" dan tombol "Nonaktifkan Pro"), client component
terpisah (`app/admin/SetProForm.tsx`, mengikuti pola `ExportButton.tsx` yang
sudah jadi client component tersendiri di folder yang sama). Setelah submit,
tampilkan pesan sukses/gagal singkat di bawah form (misal "user@mail.com
sekarang Pro" atau "User tidak ditemukan").

## Error Handling

- Env var payment tidak lengkap/kosong → baris metode itu disembunyikan
  (bukan error), lihat `getPaymentMethods()` di atas.
- `POST /api/admin/set-pro` dipanggil tanpa cookie admin valid → 403.
- Email tidak ditemukan di database → 404, form admin menampilkan pesan
  error dari response, bukan menganggap sukses.
- Body request tidak valid (email kosong/bukan string, isPro bukan boolean)
  → 400.
- `POST /api/payment/notify` gagal kirim ke Telegram (token/chat ID kosong,
  atau Telegram API error) → tetap balas 200 ke client (lihat catatan
  `sendTelegramMessage` di atas) - kegagalan notifikasi tidak boleh
  menghalangi user membuka WhatsApp untuk kirim bukti.

## Testing

- Unit test `shared/config/payment.ts`: set/hapus kombinasi env var dengan
  `vi.stubEnv`, assert `getPaymentMethods()` mengembalikan daftar yang tepat
  (termasuk kasus semua kosong → array kosong, dan satu metode saja yang
  lengkap → hanya metode itu yang muncul).
- Unit test controller `handleSetProStatus`: mock `getUserByEmail`,
  `updateUser`, dan `isAdminFromRequestCookies` (dari
  `modules/user/service/admin.service.ts`, sama seperti yang dipakai
  `handleAdminStats`). Assert tiga path: gate admin gagal → `ForbiddenError`;
  body tidak valid → `ValidationError`; user tidak ketemu → `NotFoundError`;
  dan path sukses → `updateUser` dipanggil dengan `{ is_pro: isPro }` yang
  benar.
- Tidak menambah test untuk `/api/payment/notify` (aksi kirim notifikasi
  best-effort, tidak ada logika bercabang bernilai selain memanggil
  `sendTelegramMessage` yang sudah punya jaminan sendiri tidak pernah
  melempar error) maupun untuk `PaywallModal.tsx`/`SetProForm.tsx` (komponen
  client, tidak ada test existing untuk komponen modal sejenis di repo ini —
  konsisten dengan konvensi yang sudah ada, diverifikasi manual di browser
  sebagai gantinya).

## Dampak ke Dokumentasi

`DEPLOYMENT.md` mendapat baris baru di tabel environment variables untuk
ke-7 var `NEXT_PUBLIC_PAYMENT_*`, status "✅ sudah di-set di Vercel
Production (sesi 2026-08-02)", dengan catatan nilai asli hanya ada di
Vercel dashboard + `.env.local` lokal, tidak pernah di git.

## Di Luar Cakupan

- Integrasi payment gateway otomatis (Midtrans/Xendit) — butuh akun merchant
  yang belum ada.
- Gambar QRIS — butuh file gambar asli dari akun DANA/GoPay, belum tersedia.
- Tanggal kedaluwarsa otomatis untuk status Pro (`is_pro` tetap boolean
  on/off tanpa expiry, konsisten dengan `checkProAccess()` yang sudah ada di
  `shared/auth/session.ts` — admin yang tanggung jawab menonaktifkan manual
  tiap bulan kalau user berhenti bayar).
- Riwayat/log siapa yang pernah diaktifkan Pro kapan — tidak diminta, YAGNI.
