'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

function AdminLoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="min-h-screen flex items-center justify-center bg-tv-bg p-6">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 mx-auto rounded-xl bg-tv-blue flex items-center justify-center mb-4">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <h1 className="font-heading text-tv-text font-bold text-xl mb-2">Admin Login</h1>
        <p className="text-tv-muted text-sm mb-6">
          Masuk pakai Admin Secret Key untuk akses panel admin.
        </p>

        {error && (
          <p className="text-tv-red text-xs mb-4">
            Login gagal / kadaluarsa, coba lagi.
          </p>
        )}

        <form action="/admin-login/key" method="POST" className="text-left">
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
              className="bg-tv-blue hover:bg-tv-blueHover text-white font-bold px-4 py-2 rounded-md text-sm transition-all whitespace-nowrap"
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
