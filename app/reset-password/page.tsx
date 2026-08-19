'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthAlert } from '@/components/auth/AuthAlert';
import { Input, Button, PasswordToggle } from '@/components/ui';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';

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
      await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSuccess('Kode reset baru telah dikirim (jika email terdaftar).');
      setResendCooldown(RESEND_COOLDOWN_SEC);
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

    if (newPassword.length < 8) {
      setError('Password minimal 8 karakter.');
      return;
    }

    setLoading(true);

    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      });
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

  if (resetDone) {
    return (
      <AuthShell eyebrow="Pemulihan Akun" title="Reset Password">
        <div className="text-center py-2">
          <div className="w-12 h-12 rounded-full bg-tv-green/10 border border-tv-green/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6 text-tv-green" />
          </div>
          <p className="text-sm text-tv-text font-semibold mb-1">Password berhasil diubah</p>
          <p className="text-xs text-tv-muted mb-6">Mengarahkan otomatis ke halaman login...</p>
          <Link href="/login">
            <Button variant="primary" size="lg" className="w-full">
              Login Sekarang <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Pemulihan Akun" title="Reset Password" subtitle="Masukkan kode verifikasi dan buat password baru">
      {error && <AuthAlert variant="error">{error}</AuthAlert>}
      {success && <AuthAlert variant="success">{success}</AuthAlert>}

      <form onSubmit={handleReset} className="space-y-4">
        <Input
          type="email"
          name="email"
          autoComplete="email"
          label="Alamat Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={!!initialEmail}
          className={initialEmail ? 'opacity-50 cursor-not-allowed' : ''}
        />

        <div>
          {/* inputMode numeric + autoComplete one-time-code: di HP ini memunculkan papan
              angka, dan iOS/Android bisa menawarkan kode dari SMS/email secara otomatis. */}
          <Input
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            label="Kode Verifikasi (6 Digit)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            className="font-number tracking-widest"
          />
          <Button variant="bare" size="none"
            type="button"
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
            className="mt-1.5 text-xs text-tv-blue hover:text-tv-blue/80 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {resending
              ? 'Mengirim ulang...'
              : resendCooldown > 0
              ? `Kirim ulang kode (${resendCooldown}s)`
              : 'Kirim ulang kode'}
          </Button>
        </div>

        <Input
          type={showPassword ? 'text' : 'password'}
          name="new-password"
          autoComplete="new-password"
          label="Password Baru"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Minimal 8 karakter"
          rightIcon={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} label="password baru" />}
        />

        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-2">
          {!loading && (
            <>
              Ubah Password <ArrowRight className="w-4 h-4" />
            </>
          )}
          {loading && 'Memproses...'}
        </Button>
      </form>

      <div className="mt-6 text-center text-xs text-tv-muted">
        Kembali ke <Link href="/login" className="text-tv-blue hover:underline">Login</Link>
      </div>
    </AuthShell>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-tv-bg" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
