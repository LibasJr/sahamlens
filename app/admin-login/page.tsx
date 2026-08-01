'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import TelegramLogin from '@/components/TelegramLogin';

function AdminLoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="min-h-screen flex items-center justify-center bg-tv-bg p-6">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 mx-auto rounded-xl bg-gradient-accent flex items-center justify-center mb-4">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <h1 className="font-heading text-tv-text font-bold text-xl mb-2">Login via Telegram</h1>
        <p className="text-tv-muted text-sm mb-6">
          Login via Telegram untuk akses admin. Akun dengan Telegram ID yang terdaftar sebagai
          admin akan otomatis dapat akses unlimited.
        </p>

        {error && (
          <p className="text-tv-red text-xs mb-4">
            Login gagal / kadaluarsa, coba lagi.
          </p>
        )}

        <div className="flex justify-center">
          <TelegramLogin />
        </div>

        <p className="text-tv-muted text-[11px] mt-6">
          Widget di atas cuma muncul kalau domain halaman ini sudah didaftarkan ke bot lewat
          @BotFather (/setdomain). Tidak akan tampil di localhost.
        </p>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-tv-border" />
          <span className="text-tv-muted text-[11px]">Atau</span>
          <div className="flex-1 h-px bg-tv-border" />
        </div>

        <form action="/admin-login/key" method="GET" className="text-left">
          <label className="text-xs text-tv-muted uppercase font-semibold tracking-wide mb-1.5 block">
            Admin Secret Key
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              name="key"
              placeholder="Paste ADMIN_SECRET_KEY"
              className="flex-1 bg-tv-bg/60 border border-tv-border rounded-md px-3 py-2 text-tv-text text-sm outline-none focus:border-tv-blue focus:ring-1 focus:ring-tv-blue/40 transition-colors"
              autoComplete="off"
            />
            <button
              type="submit"
              className="bg-gradient-accent hover:brightness-110 text-white font-bold px-4 py-2 rounded-md text-sm transition-all whitespace-nowrap"
            >
              Masuk
            </button>
          </div>
          <p className="text-tv-muted text-[11px] mt-2">
            Key salah menampilkan halaman &quot;Not found&quot; biasa (disengaja, biar gak ketebak apakah
            key-nya salah atau route ini memang tidak ada) - tekan tombol back browser buat coba lagi.
          </p>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginContent />
    </Suspense>
  );
}
