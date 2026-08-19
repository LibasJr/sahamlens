'use client';

import { Button } from '@/components/ui/Button';
import React, { useState, Suspense } from 'react';
import { ShieldCheck, Loader2, Eye, EyeOff } from 'lucide-react';

function AdminLoginContent() {
  const [key, setKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;

    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('key', key.trim());

      const res = await fetch('/admin-login/key', {
        method: 'POST',
        body: formData,
      });

      if (res.ok || res.redirected || res.status === 302) {
        setSuccessMsg('Login berhasil! Mengalihkan ke panel admin...');
        window.location.href = '/admin';
        return;
      }

      if (res.status === 404) {
        setErrorMsg('Password admin salah. Silakan periksa kembali.');
      } else if (res.status === 429) {
        setErrorMsg('Terlalu banyak percobaan. IP diblokir sementara (rate limit).');
      } else {
        const data = await res.json().catch(() => null);
        setErrorMsg(data?.error || `Gagal login (HTTP ${res.status}).`);
      }
    } catch {
      setErrorMsg('Gagal terhubung ke server. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-tv-bg p-6">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 mx-auto rounded-xl bg-tv-blue flex items-center justify-center mb-4 shadow-lg shadow-tv-blue/20">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <h1 className="font-heading text-tv-text font-bold text-xl mb-2">Admin Login</h1>
        <p className="text-tv-muted text-sm mb-6">
          Masuk pakai Admin Secret Key untuk akses panel admin.
        </p>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-3 py-2.5 rounded-lg mb-4 text-left">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-2.5 rounded-lg mb-4 text-left">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="text-left space-y-3">
          <div>
            <label htmlFor="admin-key" className="text-xs text-tv-muted uppercase font-semibold tracking-wide mb-1.5 block">
              Admin Secret Key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="admin-key"
                  type={showPassword ? 'text' : 'password'}
                  name="key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Password admin"
                  disabled={loading}
                  className="w-full bg-tv-bg/60 border border-tv-border rounded-md pl-3 pr-9 py-2 text-tv-text text-sm outline-none focus:border-tv-blue focus:ring-1 focus:ring-tv-blue/40 transition-colors disabled:opacity-60"
                  autoComplete="current-password"
                  required
                />
                <Button variant="bare" size="none"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tv-muted hover:text-tv-text transition-colors p-0.5"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <Button variant="bare" size="none"
                type="submit"
                disabled={loading || !key.trim()}
                className="bg-tv-blue hover:bg-tv-blueHover disabled:opacity-50 text-white font-bold px-4 py-2 rounded-md text-sm transition-all whitespace-nowrap flex items-center gap-1.5 shadow-sm"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loading ? 'Memeriksa...' : 'Masuk'}</span>
              </Button>
            </div>
          </div>
          <p className="text-tv-muted text-[11px]">
            Key salah akan menampilkan peringatan di atas. Panel admin akan terbuka otomatis setelah berhasil.
          </p>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-tv-bg" />}>
      <AdminLoginContent />
    </Suspense>
  );
}
