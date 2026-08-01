'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthAlert } from '@/components/auth/AuthAlert';
import { Input, Button } from '@/components/ui';

const RESEND_COOLDOWN_SEC = 45;

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [code, setCode] = useState('');

  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Password tidak cocok');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Terjadi kesalahan');
      } else {
        setSuccessMsg(data.message);
        setStep(2);
        setResendCooldown(RESEND_COOLDOWN_SEC);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setError('');
    setResending(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal mengirim ulang kode');
      } else {
        setSuccessMsg('Kode verifikasi baru telah dikirim.');
        setResendCooldown(RESEND_COOLDOWN_SEC);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Terjadi kesalahan');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Free Trial 7 Hari"
      title={step === 1 ? 'Buat Akun Baru' : 'Verifikasi Email'}
      subtitle={step === 1 ? 'Gratis, tanpa kartu kredit' : `Kode dikirim ke ${email}`}
    >
      {error && <AuthAlert variant="error">{error}</AuthAlert>}
      {successMsg && <AuthAlert variant="success">{successMsg}</AuthAlert>}

      {step === 1 ? (
        <form onSubmit={handleSendCode} className="space-y-4">
          <Input
            type="email"
            label="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@email.com"
          />
          <Input
            type={showPassword ? 'text' : 'password'}
            label="Password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimal 6 karakter"
            rightIcon={
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-tv-muted hover:text-tv-text transition-colors" tabIndex={-1}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
          <Input
            type={showConfirmPassword ? 'text' : 'password'}
            label="Konfirmasi Password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Ulangi password"
            rightIcon={
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="text-tv-muted hover:text-tv-text transition-colors" tabIndex={-1}>
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
          <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-2">
            {loading ? 'Memproses...' : 'Kirim Kode Verifikasi'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <Input
              type="text"
              label="Kode Verifikasi 6 Digit"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-center text-2xl tracking-[0.5em] font-number"
            />
            <p className="text-xs text-tv-muted mt-2 text-center">Cek kotak masuk (atau folder Spam) email Anda untuk melihat kode verifikasi</p>
          </div>

          <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-2">
            {loading ? 'Memverifikasi...' : 'Verifikasi & Login'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
            className="w-full"
          >
            {resending
              ? 'Mengirim ulang...'
              : resendCooldown > 0
              ? `Kirim ulang kode (${resendCooldown}s)`
              : 'Kirim ulang kode'}
          </Button>
          <button
            type="button"
            onClick={() => { setStep(1); setSuccessMsg(''); }}
            className="w-full text-tv-muted hover:text-tv-text py-2 text-sm transition-colors"
          >
            Kembali
          </button>
        </form>
      )}

      {step === 1 && (
        <div className="mt-6 text-center text-sm text-tv-muted">
          Sudah punya akun? <Link href="/login" className="text-tv-blue font-semibold hover:underline">Login</Link>
        </div>
      )}
    </AuthShell>
  );
}
