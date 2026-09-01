import { Eye, EyeOff, LogIn, LogOut, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loginDesktop } from '../api';
import { clearToken } from '../tokenStore';

export type DesktopAccount = { email?: string; role?: string; is_pro?: boolean } | null;

export function AccountModal({ open, account, onClose }: { open: boolean; account: DesktopAccount; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!open) { setError(''); setPassword(''); setShowPassword(false); } }, [open]);
  if (!open) return null;
  const signIn = async () => { setLoading(true); setError(''); try { await loginDesktop(email, password); setPassword(''); window.dispatchEvent(new Event('desktop-auth-changed')); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Login gagal.'); } finally { setLoading(false); } };
  const signOut = async () => { await clearToken(); window.dispatchEvent(new Event('desktop-auth-changed')); onClose(); };
  return <div className="account-modal-backdrop" role="presentation" onMouseDown={onClose}><section className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title" onMouseDown={(event) => event.stopPropagation()}><button className="account-modal-close" onClick={onClose} aria-label="Tutup"><X size={17} /></button>{account ? <><div className="account-modal-icon"><ShieldCheck size={22} /></div><span className="section-kicker">AKUN SAHAMLENS</span><h2 id="account-modal-title">{account.email ?? 'Akun aktif'}</h2><p>{account.is_pro ? 'Akses Pro aktif di perangkat ini.' : `Akun ${account.role ?? 'SahamLens'} aktif di perangkat ini.`}</p><button className="account-modal-action" onClick={() => void signOut()}><LogOut size={16} /> Keluar dari akun</button></> : <><div className="account-modal-icon"><LogIn size={22} /></div><span className="section-kicker">MASUK KE SAHAMLENS</span><h2 id="account-modal-title">Lanjutkan riset Anda</h2><p>Login dipakai untuk fitur akun dan akses riset yang memerlukannya. Token disimpan aman di perangkat ini.</p><label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" autoFocus /></label><label>Password<span className="password-input"><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="current-password" onKeyDown={(event) => { if (event.key === 'Enter') void signIn(); }} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label><button className="account-modal-action primary" onClick={() => void signIn()} disabled={loading || !email || !password}><LogIn size={16} /> {loading ? 'Memproses…' : 'Masuk'}</button>{error && <p className="account-modal-error">{error}</p>}</>}</section></div>;
}
