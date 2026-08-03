'use client';

import React, { useState } from 'react';

type Status = { email: string; isPro: boolean; proExpiresAt: string | null };

function formatTanggal(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function sisaHari(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export default function SetProForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const cek = async () => {
    if (!email.trim()) {
      setMessage({ text: 'Isi email dulu', isError: true });
      return;
    }
    setLoading(true);
    setMessage(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/pro-status?email=${encodeURIComponent(email.trim())}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: data.error || 'Gagal mengambil status', isError: true });
        return;
      }
      setStatus(data);
    } catch {
      setMessage({ text: 'Gagal terhubung ke server', isError: true });
    } finally {
      setLoading(false);
    }
  };

  const simpan = async (payload: { isPro: boolean; months?: number; expiresAt?: string }) => {
    if (!email.trim()) {
      setMessage({ text: 'Isi email dulu', isError: true });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/set-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: data.error || 'Gagal memproses', isError: true });
        return;
      }
      setMessage({
        text: data.isPro
          ? `${data.email} Pro sampai ${formatTanggal(data.proExpiresAt)}`
          : `${data.email} bukan Pro lagi`,
        isError: false,
      });
      setStatus({ email: data.email, isPro: data.isPro, proExpiresAt: data.proExpiresAt });
    } catch {
      setMessage({ text: 'Gagal terhubung ke server', isError: true });
    } finally {
      setLoading(false);
    }
  };

  const tombol =
    'text-white font-bold px-4 py-2 rounded-md text-sm transition-opacity disabled:opacity-50 hover:opacity-90';

  return (
    <div className="bg-tv-card border border-tv-border rounded-lg p-6 mb-8">
      <h2 className="font-heading text-lg font-bold text-tv-text mb-4">Aktivasi Pro</h2>

      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setStatus(null);
          }}
          placeholder="email@user.com"
          className="flex-1 bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
        />
        <button type="button" disabled={loading} onClick={cek} className={`bg-tv-blue ${tombol}`}>
          Cek Status
        </button>
      </div>

      {status && (
        <p className="text-sm mb-4 text-tv-text">
          {!status.isPro
            ? 'Bukan Pro'
            : status.proExpiresAt == null
            ? 'Pro aktif (tanpa batas waktu)'
            : sisaHari(status.proExpiresAt) > 0
            ? `Pro sampai ${formatTanggal(status.proExpiresAt)} (${sisaHari(status.proExpiresAt)} hari lagi)`
            : `Pro sudah berakhir ${formatTanggal(status.proExpiresAt)}`}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <button
          type="button"
          disabled={loading}
          onClick={() => simpan({ isPro: true, months: 1 })}
          className={`bg-tv-green ${tombol}`}
        >
          +1 Bulan
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => simpan({ isPro: true, months: 12 })}
          className={`bg-tv-green ${tombol}`}
        >
          +1 Tahun
        </button>
        <input
          type="date"
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
          className="bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text focus:outline-none focus:border-tv-blue"
        />
        <button
          type="button"
          disabled={loading || !customDate}
          onClick={() => simpan({ isPro: true, expiresAt: new Date(customDate).toISOString() })}
          className={`bg-tv-blue ${tombol}`}
        >
          Set Tanggal
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => simpan({ isPro: false })}
          className={`bg-tv-red ${tombol}`}
        >
          Cabut Pro
        </button>
      </div>

      <p className="text-[11px] text-tv-muted mt-3">
        Tombol durasi menumpuk dari tanggal berakhir kalau masa berlakunya belum habis, jadi
        sisa hari yang sudah dibayar tidak hangus.
      </p>

      {message && (
        <p className={`mt-3 text-sm ${message.isError ? 'text-tv-red' : 'text-tv-green'}`}>{message.text}</p>
      )}
    </div>
  );
}
