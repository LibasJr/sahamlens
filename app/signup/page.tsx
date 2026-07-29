'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

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
  const router = useRouter();

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
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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
    <div className="min-h-screen bg-tv-bg flex items-center justify-center p-4">
      <div className="bg-tv-card border border-tv-border rounded-2xl w-full max-w-md p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-white font-mono">SahamLens</h1>
          <p className="text-tv-muted mt-2 text-sm">
            {step === 1 ? 'Buat Akun (Free Trial 7 Hari)' : 'Verifikasi Email'}
          </p>
        </div>

        {error && (
          <div className="bg-tv-red/10 border border-tv-red/30 text-tv-red p-3 rounded-lg mb-6 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 min-w-4" />
            {error}
          </div>
        )}

        {successMsg && (
          <div className="bg-tv-green/10 border border-tv-green/30 text-tv-green p-3 rounded-lg mb-6 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 min-w-4" />
            {successMsg}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleSendCode} className="space-y-5">
            <div>
              <label className="block text-tv-muted text-xs font-mono uppercase mb-2">Email</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-tv-bg border border-tv-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-tv-green transition-colors"
                placeholder="nama@email.com"
              />
            </div>
            <div>
              <label className="block text-tv-muted text-xs font-mono uppercase mb-2">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-tv-bg border border-tv-border rounded-lg pl-4 pr-12 py-3 text-white focus:outline-none focus:border-tv-green transition-colors"
                  placeholder="Minimal 6 karakter"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-tv-muted hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-tv-muted text-xs font-mono uppercase mb-2">Konfirmasi Password</label>
              <div className="relative">
                <input 
                  type={showConfirmPassword ? "text" : "password"} 
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-tv-bg border border-tv-border rounded-lg pl-4 pr-12 py-3 text-white focus:outline-none focus:border-tv-green transition-colors"
                  placeholder="Ulangi password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-tv-muted hover:text-white transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-tv-green hover:bg-tv-green/90 text-black font-bold py-3 rounded-lg transition-colors disabled:opacity-50 mt-4"
            >
              {loading ? 'Memproses...' : 'Kirim Kode Verifikasi'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-5">
            <div>
              <label className="block text-tv-muted text-xs font-mono uppercase mb-2">Kode Verifikasi 6 Digit</label>
              <input 
                type="text" 
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-tv-bg border border-tv-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-tv-green text-center text-2xl tracking-[0.5em] transition-colors"
              />
              <p className="text-xs text-tv-muted mt-2 text-center">Cek kotak masuk (atau folder Spam) email Anda untuk melihat kode verifikasi</p>
            </div>
            
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-tv-green hover:bg-tv-green/90 text-black font-bold py-3 rounded-lg transition-colors disabled:opacity-50 mt-4"
            >
              {loading ? 'Memverifikasi...' : 'Verifikasi & Login'}
            </button>
            <button 
              type="button"
              onClick={() => { setStep(1); setSuccessMsg(''); }}
              className="w-full text-tv-muted hover:text-white py-2 text-sm transition-colors"
            >
              Kembali
            </button>
          </form>
        )}

        {step === 1 && (
          <div className="mt-6 text-center text-sm text-tv-muted">
            Sudah punya akun? <Link href="/login" className="text-tv-green hover:underline">Login</Link>
          </div>
        )}
      </div>
    </div>
  );
}
