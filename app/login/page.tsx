'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthAlert } from '@/components/auth/AuthAlert';
import { Input, Button } from '@/components/ui';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

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
    <AuthShell
      eyebrow="Selamat Datang Kembali"
      title="Masuk ke Akun Anda"
      subtitle="Analisis teknikal & fundamental lengkap menunggu Anda"
    >
      {error && <AuthAlert variant="error">{error}</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="email"
          label="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@email.com"
        />

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-xs font-medium text-tv-muted">Password</label>
            <Link href="/forgot-password" className="text-[11px] font-semibold text-tv-blue hover:underline">Lupa Password?</Link>
          </div>
          <Input
            type={showPassword ? 'text' : 'password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="pointer-events-auto text-tv-muted hover:text-tv-text transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="remember"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="w-4 h-4 rounded border-tv-border bg-tv-bg text-tv-blue focus:ring-tv-blue accent-tv-blue"
          />
          <label htmlFor="remember" className="text-[13px] text-tv-muted cursor-pointer select-none">
            Ingat Saya
          </label>
        </div>

        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-2">
          {loading ? 'Memproses...' : 'Login'}
        </Button>
      </form>

      <div className="mt-6 text-center text-[13px] text-tv-muted">
        Belum punya akun? <Link href="/signup" className="text-tv-blue font-semibold hover:underline">Daftar</Link>
      </div>
    </AuthShell>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-tv-bg" />}>
      <LoginForm />
    </Suspense>
  );
}
