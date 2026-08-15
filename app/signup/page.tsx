'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthAlert } from '@/components/auth/AuthAlert';
import { Input, Button, PasswordToggle } from '@/components/ui';

const RESEND_COOLDOWN_SEC = 45;

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [code, setCode] = useState('');
  const [website, setWebsite] = useState('');

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
        body: JSON.stringify({ email, password, website }),
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
        body: JSON.stringify({ email, password, website }),
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
        router.push('/');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Akses Pengujian"
      title={step === 1 ? 'Buat Akun Baru' : 'Verifikasi Email'}
      subtitle={step === 1 ? 'Mulai perjalanan investasimu bersama SahamLens' : `Kode dikirim ke ${email}`}
    >
      {error && <AuthAlert variant="error">{error}</AuthAlert>}
      {successMsg && <AuthAlert variant="success">{successMsg}</AuthAlert>}

      {step === 1 ? (
        <form onSubmit={handleSendCode} className="space-y-4">
          {/* autoComplete di formulir pendaftaran memakai "new-password", bukan
              "current-password": itu yang memberi tahu pengelola password untuk MENAWARKAN
              password baru, bukan mengisi yang lama. */}
          <Input
            type="email"
            name="email"
            autoComplete="email"
            label="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@email.com"
          />
          <Input
            type={showPassword ? 'text' : 'password'}
            name="new-password"
            autoComplete="new-password"
            label="Password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimal 8 karakter"
            rightIcon={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />}
          />
          <Input
            type={showConfirmPassword ? 'text' : 'password'}
            name="confirm-password"
            autoComplete="new-password"
            label="Konfirmasi Password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Ulangi password"
            rightIcon={<PasswordToggle shown={showConfirmPassword} onToggle={() => setShowConfirmPassword(!showConfirmPassword)} label="konfirmasi password" />}
          />
          <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <label htmlFor="signup-website">Website</label>
            <input
              id="signup-website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>
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
