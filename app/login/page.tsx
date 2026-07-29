'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
          <p className="text-tv-muted mt-2 text-sm">Masuk ke akun Anda</p>
        </div>

        {error && (
          <div className="bg-tv-red/10 border border-tv-red/30 text-tv-red p-3 rounded-lg mb-6 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
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
            <div className="flex justify-between items-center mb-2">
              <label className="block text-tv-muted text-xs font-mono uppercase">Password</label>
              <Link href="/forgot-password" className="text-[10px] font-mono text-tv-green hover:underline">Lupa Password?</Link>
            </div>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-tv-bg border border-tv-border rounded-lg pl-4 pr-12 py-3 text-white focus:outline-none focus:border-tv-green transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-tv-muted hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            
            <div className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded bg-tv-bg border-tv-border text-tv-green focus:ring-tv-green focus:ring-offset-tv-bg"
              />
              <label htmlFor="remember" className="text-sm text-tv-muted cursor-pointer hover:text-white transition-colors select-none">
                Ingat Saya
              </label>
            </div>
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-tv-green hover:bg-tv-green/90 text-black font-bold py-3 rounded-lg transition-colors disabled:opacity-50 mt-4"
          >
            {loading ? 'Memproses...' : 'Login'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-tv-muted">
          Belum punya akun? <Link href="/signup" className="text-tv-green hover:underline">Sign Up</Link>
        </div>
      </div>
    </div>
  );
}
