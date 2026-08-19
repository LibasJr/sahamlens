'use client';

import React, { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { ApiError } from '@/lib/api/fetcher';
import type { PresenceEntry } from '@/shared/auth/presence';
import { useModalBehavior } from '@/lib/hooks/useModalBehavior';
import { AnimatePresence, motion } from 'framer-motion';
import { X, User, ShieldCheck, Users, Loader2, Crown } from 'lucide-react';
import PaywallModal from './PaywallModal';
import { TESTING_OPEN_ACCESS } from '@/shared/constants/access';

interface ProfileData {
  email: string;
  role: string;
  isPro: boolean;
  hasProAccess: boolean;
  isVerified: boolean;
  trialEndsAt: string | null;
  /** null = tanpa batas waktu (admin, atau akun lama sebelum migrasi 2026-08-03). */
  proExpiresAt: string | null;
  createdAt: string;
  activeUsers?: { id: string; email: string; role: string; lastSeen: string }[];
}

interface UserProfileModalProps {
  open: boolean;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return 'baru saja';
  if (minutes === 1) return '1 menit lalu';
  return `${minutes} menit lalu`;
}

// Struktur overlay/panel sama dengan components/PaywallModal.tsx (focus trap, Escape
// untuk tutup) - kontennya beda (info profil, bukan ajakan upgrade/daftar) jadi
// komponen terpisah, bukan reuse PaywallModal yang props-nya spesifik untuk paywall.
export default function UserProfileModal({ open, onClose }: UserProfileModalProps) {
  const [showPaywall, setShowPaywall] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const handleUpgradeClick = () => {
    onClose();
    setShowPaywall(true);
  };

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    if (!data || data.role === 'admin') return;
    const confirmation = window.prompt('Penghapusan akun bersifat permanen. Ketik HAPUS AKUN untuk melanjutkan.');
    if (confirmation !== 'HAPUS AKUN') return;
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/user/delete-account', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Gagal menghapus akun');
      window.location.href = '/';
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Gagal menghapus akun');
      setDeletingAccount(false);
    }
  };

  // Kunci null selama modal tertutup - profil tidak diambil sampai benar-benar dibuka,
  // sama seperti `if (!open) return;` sebelumnya. Saat dibuka, kuncinya SAMA dengan yang
  // dipakai app/home/page.tsx, jadi membuka modal dari Beranda tidak mengambil ulang.
  // Tipe eksplisit, bukan `any`. Sebelum migrasi ini `data` juga longgar, tapi sekarang
  // ia melewati satu tempat saja - jadi menuliskannya sekali di sini memberi seluruh
  // pemakaian di bawah pengecekan yang nyata.
  // Bentuknya diambil dari kontrak server yang sebenarnya (handleProfile di
  // modules/user/controller/auth.controller.ts), bukan ditebak:
  //   - `activeUsers` HANYA dikirim untuk role admin, jadi opsional - bukan array kosong.
  //   - elemennya PresenceEntry, tipe yang sudah ada di shared/auth/presence.ts.
  //   - `createdAt` non-null: user.created_at bertipe string di user.types.ts.
  type ProfileData = {
    email: string;
    role: string;
    isPro: boolean;
    isVerified: boolean;
    hasProAccess: boolean;
    createdAt: string;
    trialEndsAt: string | null;
    proExpiresAt: string | null;
    activeUsers?: PresenceEntry[];
  };

  const {
    data,
    error: profileError,
    isLoading: loading,
  } = useSWR<ProfileData>(open ? '/api/user/profile' : null);

  // 401 = sesi habis saat modal terbuka. Menutupnya adalah tindakan yang benar: profil
  // orang yang tidak login tidak ada isinya, dan pesan error di dalam modal hanya
  // membuat pengguna menatap kotak kosong.
  useEffect(() => {
    if (profileError instanceof ApiError && profileError.status === 401) onClose();
  }, [profileError, onClose]);

  // Error MUTASI (hapus akun) dipisah dari error pembacaan profil: keduanya punya sebab
  // dan pesan yang berbeda, dan SWR tidak mengurus yang pertama. Ditampilkan lewat satu
  // variabel `error` supaya render di bawah tidak perlu tahu bedanya.
  const readError =
    profileError && !(profileError instanceof ApiError && profileError.status === 401)
      ? 'Gagal memuat profil'
      : null;
  const error = deleteError ?? readError;

  useModalBehavior({ open, onClose, containerRef: modalRef });

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Detail Profil"
            className="relative w-full max-w-md bg-tv-bg border border-tv-blue/40 rounded-xl shadow-2 p-6 overflow-hidden max-h-[85vh] overflow-y-auto"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-tv-muted hover:text-tv-text transition-colors"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-lg bg-tv-blue flex items-center justify-center mb-4">
              <User className="w-6 h-6 text-white" />
            </div>

            <h3 className="font-heading text-xl font-bold text-tv-text mb-4">Detail Profil</h3>

            {loading && (
              <div className="flex items-center gap-2 text-sm text-tv-muted py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Memuat profil...
              </div>
            )}

            {error && !loading && (
              <div className="text-sm text-tv-red py-4">{error}</div>
            )}

            {data && !loading && (
              <>
                <div className="space-y-3 mb-5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-tv-muted">Email</span>
                    <span className="text-tv-text font-medium">{data.email}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-tv-muted">Role</span>
                    <span className="text-tv-text font-medium uppercase">{data.role}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-tv-muted">Status Verifikasi</span>
                    <span className={`flex items-center gap-1 font-medium ${data.isVerified ? 'text-tv-green' : 'text-tv-yellow'}`}>
                      <ShieldCheck className="w-3.5 h-3.5" /> {data.isVerified ? 'Terverifikasi' : 'Belum Terverifikasi'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-tv-muted">Status Akun</span>
                    <span className="text-tv-text font-medium">{data.hasProAccess ? 'Pro' : 'Free'}</span>
                  </div>
                  {/* Masa berlaku Pro (2026-08-03). null berarti tanpa batas - akun admin dan
                      akun lama sebelum migrasi - jadi barisnya disembunyikan alih-alih
                      menampilkan tanggal palsu. */}
                  {data.isPro && data.proExpiresAt && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-tv-muted">Pro Berakhir</span>
                      <span className="text-tv-text font-medium">
                        {formatDate(data.proExpiresAt)}
                        {new Date(data.proExpiresAt) > new Date() && (
                          <span className="text-tv-muted font-normal">
                            {' '}({Math.ceil((new Date(data.proExpiresAt).getTime() - Date.now()) / 86_400_000)} hari lagi)
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {/* Tanggal trial cuma relevan kalau itu SATU-SATUNYA alasan akses Pro-nya
                      aktif - akun Pro punya barisnya sendiri di atas, admin tidak bergantung
                      tanggal sama sekali. Jangan tampilkan seolah akun itu akan "kehabisan"
                      akses pada tanggal trial. */}
                  {!TESTING_OPEN_ACCESS && data.role !== 'admin' && data.role !== 'pro' && !data.isPro && data.trialEndsAt && new Date(data.trialEndsAt) > new Date() && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-tv-muted">Akses Berakhir</span>
                      <span className="text-tv-text font-medium">{formatDate(data.trialEndsAt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-tv-muted">Bergabung Sejak</span>
                    <span className="text-tv-text font-medium">{formatDate(data.createdAt)}</span>
                  </div>
                </div>

                {data.role !== 'admin' && data.role !== 'pro' && !data.isPro && (
                  <button
                    onClick={handleUpgradeClick}
                    className="w-full flex items-center justify-center gap-2 bg-tv-blue hover:bg-tv-blueHover text-white font-bold py-2.5 rounded-md transition-all mb-5"
                  >
                    <Crown className="w-4 h-4" />
                    Upgrade ke Pro
                  </button>
                )}

                {data.role !== 'admin' && (
                  <div className="mb-5 border-t border-tv-border pt-4">
                    <p className="mb-2 text-xs text-tv-muted">Privasi & akun</p>
                    <button
                      type="button"
                      disabled={deletingAccount}
                      onClick={() => void handleDeleteAccount()}
                      className="w-full rounded-md border border-tv-red/30 bg-tv-red/[0.05] px-3 py-2 text-sm font-bold text-tv-red hover:bg-tv-red/10 disabled:opacity-50"
                    >
                      {deletingAccount ? 'Menghapus akun…' : 'Hapus akun & data pribadi'}
                    </button>
                    <p className="mt-2 text-[11px] leading-relaxed text-tv-muted">Watchlist, alert, portofolio virtual, histori autentikasi, dan feedback LensAI milik akun akan dihapus. Catatan pembayaran yang wajib untuk rekonsiliasi dipertahankan tanpa identitas akun.</p>
                  </div>
                )}

                {data.activeUsers && (
                  <div className="border-t border-tv-border pt-4">
                    <h4 className="font-heading text-sm font-bold text-tv-text flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-tv-blue" /> User Aktif Sekarang ({data.activeUsers.length})
                    </h4>
                    {data.activeUsers.length === 0 ? (
                      <p className="text-xs text-tv-muted">Tidak ada user lain yang aktif saat ini.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {data.activeUsers.map((u) => (
                          <div key={u.id} className="flex items-center justify-between text-xs bg-tv-card border border-tv-border rounded-md px-3 py-2">
                            <div className="min-w-0">
                              <div className="text-tv-text font-medium truncate">{u.email}</div>
                              <div className="text-tv-muted uppercase text-[10px]">{u.role}</div>
                            </div>
                            <span className="text-tv-muted shrink-0 ml-2">{timeAgo(u.lastSeen)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <PaywallModal
      open={showPaywall}
      onClose={() => setShowPaywall(false)}
      title="Upgrade ke SahamLens Pro"
      body="Buka semua fitur Pro tanpa batas: LensConsensus, LensRadar scan berkala, Compare Tool, Market Pulse, dan lainnya."
      benefits={[
        'Unlimited LensTechnical (10 filter)',
        'LensRadar scan berkala, LensConsensus & Compare Tool',
        'Watchlist & Alert unlimited',
      ]}
    />
    </>
  );
}
