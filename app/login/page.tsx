'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthAlert } from '@/components/auth/AuthAlert';
import { Input, Button, Toast, PasswordToggle } from '@/components/ui';
import { LOGIN_REQUIRED_NOTICE } from '@/shared/constants/access';
import { safeInternalPath } from '@/shared/navigation/safe-internal-path';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  // `next` datang dari URL browser. Jangan pass mentah ke router.push(): `//host`
  // adalah URL protocol-relative dan dapat mengarahkan user keluar situs setelah login.
  const next = safeInternalPath(searchParams.get('next'), '/');
  // Diisi proxy.ts saat guest mencoba membuka halaman terproteksi - tanpa ini user
  // mendarat di /login tanpa tahu kenapa ia dipindahkan dari halaman yang ia klik.
  const notice = searchParams.get('notice') === 'login_required' ? LOGIN_REQUIRED_NOTICE : null;

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
      await apiRequest<any>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember: rememberMe }),
      });
      if (rememberMe) localStorage.setItem('saham_remember_email', email);
      else localStorage.removeItem('saham_remember_email');
      router.push(next);
      router.refresh();
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
      <Toast message={notice} />
      {error && <AuthAlert variant="error">{error}</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* `name` + `autoComplete` WAJIB di sini. Tanpa keduanya pengelola password dan
            autofill browser tidak mengenali formulir ini sama sekali - gesekan nyata di
            setiap login, paling terasa di HP. Melanggar WCAG 1.3.5 (Identify Input
            Purpose). `name` juga memberi Input id yang stabil untuk htmlFor. */}
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

        <div>
          <div className="flex justify-between items-center mb-1.5">
            {/* htmlFor sengaja diisi: label ini dirender terpisah dari Input (karena ada
                tautan "Lupa Password?" di baris yang sama), jadi ia tidak ikut mekanisme
                label bawaan Input. Sebelumnya input password TIDAK punya nama aksesibel
                sama sekali - tanpa label, tanpa aria-label, bahkan tanpa placeholder. */}
            <label htmlFor="password" className="block text-xs font-medium text-tv-muted">Password</label>
            <Link href="/forgot-password" className="min-h-11 inline-flex items-center text-[11px] font-semibold text-tv-blue hover:underline">Lupa Password?</Link>
          </div>
          <Input
            id="password"
            name="password"
            autoComplete="current-password"
            type={showPassword ? 'text' : 'password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            rightIcon={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />}
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
