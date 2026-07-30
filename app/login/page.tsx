'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Eye, EyeOff } from 'lucide-react';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/dashboard';

  useEffect(() => {
    const savedEmail = localStorage.getItem('saham_remember_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember: rememberMe }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Terjadi kesalahan');
      } else {
        if (rememberMe) {
          localStorage.setItem('saham_remember_email', email);
        } else {
          localStorage.removeItem('saham_remember_email');
        }
        router.push(next);
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || 'Tidak bisa terhubung ke server. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1121] flex items-center justify-center p-4">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'); *{font-family:'Plus Jakarta Sans', Inter, sans-serif}`}</style>

      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-8">
          <div className="h-9 w-9 rounded-lg bg-[#3A86FF] grid place-items-center font-bold text-[15px] text-white tracking-tight">SL</div>
          <span className="font-bold text-[18px] tracking-tight text-[#0A1931] dark:text-white">SahamLens</span>
        </Link>

        <div className="bg-white dark:bg-[#152238] border border-slate-200 dark:border-slate-800 rounded-[20px] w-full p-8 shadow-[0_10px_40px_-12px_rgba(10,25,49,0.12)]">
          <div className="text-center mb-7">
            <h1 className="text-[22px] font-bold text-[#0A1931] dark:text-white tracking-tight">Masuk ke Akun Anda</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-[13px]">Analisis teknikal &amp; fundamental lengkap menunggu Anda</p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-300 p-3 rounded-xl mb-5 text-[13px] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#F8FAFC] dark:bg-[#0B1121] border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-[14px] text-[#0A1931] dark:text-white focus:outline-none focus:border-[#3A86FF] transition-colors"
                placeholder="nama@email.com"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-widest">Password</label>
                <Link href="/forgot-password" className="text-[11px] font-semibold text-[#3A86FF] hover:underline">Lupa Password?</Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#F8FAFC] dark:bg-[#0B1121] border border-slate-200 dark:border-slate-800 rounded-xl pl-4 pr-12 py-3 text-[14px] text-[#0A1931] dark:text-white focus:outline-none focus:border-[#3A86FF] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0A1931] dark:hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#3A86FF] focus:ring-[#3A86FF]"
                />
                <label htmlFor="remember" className="text-[13px] text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                  Ingat Saya
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#3A86FF] hover:bg-[#2f6fd6] text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 text-[14px] shadow-[0_8px_20px_-8px_#3A86FF] mt-2"
            >
              {loading ? 'Memproses...' : 'Login'}
            </button>
          </form>

          <div className="mt-6 text-center text-[13px] text-slate-500 dark:text-slate-400">
            Belum punya akun? <Link href="/signup" className="text-[#3A86FF] font-semibold hover:underline">Daftar</Link>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-6">
          <Link href="/" className="hover:text-[#3A86FF] transition-colors">&larr; Kembali ke Ringkasan Pasar</Link>
        </p>
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1121]" />}>
      <LoginForm />
    </Suspense>
  );
}
