'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, TrendingUp, TrendingDown, ArrowRight, CheckCircle2, Eye, EyeOff } from 'lucide-react';

const RESEND_COOLDOWN_SEC = 45;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') || '';

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(initialEmail ? RESEND_COOLDOWN_SEC : 0);
  const [resetDone, setResetDone] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleResend = async () => {
    if (!email) {
      setError('Isi email terlebih dahulu.');
      return;
    }
    if (resendCooldown > 0 || resending) return;
    setError('');
    setResending(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal mengirim ulang kode.');
      } else {
        setSuccess('Kode reset baru telah dikirim (jika email terdaftar).');
        setResendCooldown(RESEND_COOLDOWN_SEC);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!email || !code || !newPassword) {
      setError('Semua field wajib diisi.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password minimal 6 karakter.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Terjadi kesalahan.');
      }

      setSuccess('Password berhasil diubah.');
      setResetDone(true);

      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0E14] px-4 font-sans relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-teal-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-rose-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        
        {/* Logo */}
        <div className="flex justify-center items-center gap-3 mb-8">
          <div className="flex items-center -space-x-1">
            <div className="bg-teal-500/20 p-2 rounded-l-lg border border-teal-500/30">
              <TrendingUp className="w-5 h-5 text-teal-400" />
            </div>
            <div className="bg-rose-500/20 p-2 rounded-r-lg border border-rose-500/30">
              <TrendingDown className="w-5 h-5 text-rose-400" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-rose-400">
              SahamLens
            </h1>
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest text-center">
              Reset Password
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#121822]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {resetDone ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 text-teal-400" />
              </div>
              <p className="text-sm text-white font-semibold mb-1">Password berhasil diubah</p>
              <p className="text-xs text-slate-400 mb-6">Mengarahkan otomatis ke halaman login...</p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full py-3 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold rounded-lg transition-all shadow-[0_0_15px_rgba(13,148,136,0.3)]"
              >
                Login Sekarang <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
          <>
          <p className="text-sm text-slate-400 mb-6 text-center">
            Masukkan kode verifikasi 6 digit yang baru saja dikirimkan, lalu buat password baru.
          </p>

          <form onSubmit={handleReset} className="space-y-4">

            {error && (
              <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-lg">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2 bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs p-3 rounded-lg">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{success}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Alamat Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={!!initialEmail}
                className={`w-full px-4 py-2.5 bg-black/20 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors ${initialEmail ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Kode Verifikasi (6 Digit)
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                className="w-full px-4 py-2.5 bg-black/20 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors font-mono tracking-widest"
              />
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || resendCooldown > 0}
                className="mt-1.5 text-xs text-teal-400 hover:text-teal-300 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resending
                  ? 'Mengirim ulang...'
                  : resendCooldown > 0
                  ? `Kirim ulang kode (${resendCooldown}s)`
                  : 'Kirim ulang kode'}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Password Baru
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full px-4 py-2.5 bg-black/20 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 mt-6 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold rounded-lg transition-all shadow-[0_0_15px_rgba(13,148,136,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Memproses...' : 'Ubah Password'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            Kembali ke <Link href="/login" className="text-teal-400 hover:text-teal-300 transition-colors">Login</Link>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0B0E14] flex items-center justify-center"><div className="text-teal-400">Loading...</div></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
