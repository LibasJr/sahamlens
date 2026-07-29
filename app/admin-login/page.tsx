'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import TelegramLogin from '@/components/TelegramLogin';

function AdminLoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] p-6">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#14b8a6]/10 border border-[#14b8a6]/30 flex items-center justify-center mb-4">
          <ShieldCheck className="w-7 h-7 text-[#14b8a6]" />
        </div>
        <h1 className="text-white font-bold text-xl mb-2">Login via Telegram</h1>
        <p className="text-gray-500 text-sm font-mono mb-6">
          Login via Telegram untuk akses admin. Akun dengan Telegram ID yang terdaftar sebagai
          admin akan otomatis dapat akses unlimited.
        </p>

        {error && (
          <p className="text-tv-red text-xs font-mono mb-4">
            Login gagal / kadaluarsa, coba lagi.
          </p>
        )}

        <div className="flex justify-center">
          <TelegramLogin />
        </div>

        <p className="text-gray-600 text-[11px] font-mono mt-6">
          Widget di atas cuma muncul kalau domain halaman ini sudah didaftarkan ke bot lewat
          @BotFather (/setdomain). Tidak akan tampil di localhost.
        </p>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-tv-border" />
          <span className="text-gray-600 text-[11px] font-mono">ATAU</span>
          <div className="flex-1 h-px bg-tv-border" />
        </div>

        <form action="/admin-login/key" method="GET" className="text-left">
          <label className="text-xs font-mono text-gray-500 uppercase mb-1 block">
            Admin Secret Key
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              name="key"
              placeholder="Paste ADMIN_SECRET_KEY"
              className="flex-1 bg-[#0f172a] border border-tv-border rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[#14b8a6]"
              autoComplete="off"
            />
            <button
              type="submit"
              className="bg-[#14b8a6] hover:bg-[#0d9488] text-black font-bold font-mono px-4 py-2 rounded text-sm transition-colors whitespace-nowrap"
            >
              Masuk
            </button>
          </div>
          <p className="text-gray-600 text-[11px] font-mono mt-2">
            Key salah menampilkan halaman "Not found" biasa (disengaja, biar gak ketebak apakah
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
