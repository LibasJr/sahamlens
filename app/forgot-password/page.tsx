'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthAlert } from '@/components/auth/AuthAlert';
import { Input, Button } from '@/components/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email) {
      setError('Email harus diisi.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Terjadi kesalahan.');
      }

      setSuccess('Jika email terdaftar, kode reset telah dikirim. Mengarahkan ke halaman verifikasi...');

      setTimeout(() => {
        router.push(`/reset-password?email=${encodeURIComponent(email)}`);
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell eyebrow="Pemulihan Akun" title="Lupa Password" subtitle="Masukkan email Anda untuk menerima kode reset">
      {error && <AuthAlert variant="error">{error}</AuthAlert>}
      {success && (
        <AuthAlert variant="success">
          <p>{success}</p>
          <Link
            href={`/reset-password?email=${encodeURIComponent(email)}`}
            className="inline-block mt-1.5 font-semibold underline underline-offset-2 hover:text-tv-green/80"
          >
            Lanjut sekarang &rarr;
          </Link>
        </AuthAlert>
      )}

      <form onSubmit={handleRequest} className="space-y-4">
        <Input
          type="email"
          label="Alamat Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="cth: nama@email.com"
        />

        <Button type="submit" variant="primary" size="lg" loading={loading} disabled={!!success} className="w-full mt-2">
          {!loading && (
            <>
              Kirim Kode Reset <ArrowRight className="w-4 h-4" />
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
