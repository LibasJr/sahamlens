import React, { useState } from 'react';
import { LogIn, Lock, Mail, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { loginDesktop } from '../api';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (session: { email: string; role: string }) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email dan kata sandi wajib diisi.');
      return;
    }
    setLoading(true);
    setError(null);

    const res = await loginDesktop(email.trim(), password);
    setLoading(false);

    if (res.ok && res.role) {
      onLoginSuccess({ email: res.email || email, role: res.role });
      onClose();
    } else {
      setError(res.error || 'Gagal masuk. Periksa kembali akun Anda.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none">
      <div className="w-full max-w-md bg-pro-card border border-pro-borderStrong rounded-2xl shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-pro-textSubtle hover:text-pro-text p-1.5 rounded-lg hover:bg-pro-surface transition"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-pro-accentMuted border border-pro-accent/40 flex items-center justify-center text-pro-accent font-bold">
            <LogIn size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-pro-text">Masuk ke SahamLens Pro</h2>
            <p className="text-xs text-pro-textMuted">Gunakan akun terdaftar Anda untuk akses penuh.</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-pro-lossBg border border-pro-loss/40 text-pro-loss text-xs flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-pro-textSubtle uppercase tracking-wider mb-1.5">
              Alamat Email
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                required
                className="w-full bg-pro-surface border border-pro-border focus:border-pro-accent rounded-lg pl-9 pr-3 py-2.5 text-xs text-pro-text placeholder:text-pro-textSubtle outline-hidden font-medium transition"
              />
              <Mail size={15} className="absolute left-3 top-3 text-pro-textSubtle" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-pro-textSubtle uppercase tracking-wider mb-1.5">
              Kata Sandi
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-pro-surface border border-pro-border focus:border-pro-accent rounded-lg pl-9 pr-3 py-2.5 text-xs text-pro-text placeholder:text-pro-textSubtle outline-hidden font-medium transition"
              />
              <Lock size={15} className="absolute left-3 top-3 text-pro-textSubtle" />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-pro-accent hover:bg-[#b8e62d] text-pro-bg font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-pro-bg border-t-transparent animate-spin" />
                  <span>Memverifikasi Akun...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  <span>Masuk ke Akun</span>
                </>
              )}
            </button>
          </div>

          <p className="text-[11px] text-center text-pro-textSubtle pt-1">
            Belum punya akun? Buka situs resmi <a href="https://sahamlens.id/signup" target="_blank" rel="noreferrer" className="text-pro-accent hover:underline">sahamlens.id</a> untuk mendaftar.
          </p>
        </form>
      </div>
    </div>
  );
};
