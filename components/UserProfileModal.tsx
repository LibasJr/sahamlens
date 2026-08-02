'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, User, ShieldCheck, Users, Loader2 } from 'lucide-react';

interface ProfileData {
  email: string;
  role: string;
  isPro: boolean;
  isVerified: boolean;
  trialEndsAt: string | null;
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
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setData(null);
    fetch('/api/user/profile')
      .then((res) => {
        if (res.status === 401) {
          onClose();
          return null;
        }
        return res.json();
      })
      .then((json) => { if (json) setData(json); })
      .catch(() => setError('Gagal memuat profil'))
      .finally(() => setLoading(false));
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const container = modalRef.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const focusTimer = setTimeout(() => {
      modalRef.current?.querySelector<HTMLElement>('button, [href]')?.focus();
    }, 30);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  return (
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
                    <span className="text-tv-text font-medium">{data.isPro ? 'Pro' : 'Free'}</span>
                  </div>
                  {data.trialEndsAt && new Date(data.trialEndsAt) > new Date() && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-tv-muted">Trial Berakhir</span>
                      <span className="text-tv-text font-medium">{formatDate(data.trialEndsAt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-tv-muted">Bergabung Sejak</span>
                    <span className="text-tv-text font-medium">{formatDate(data.createdAt)}</span>
                  </div>
                </div>

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
  );
}
