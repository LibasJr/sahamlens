'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui';
import React, { useState } from 'react';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';

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
  const [paymentReference, setPaymentReference] = useState('');
  const [reconciliationNote, setReconciliationNote] = useState('');
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
      const data = await apiRequest<any>(`/api/admin/pro-status?email=${encodeURIComponent(email.trim())}`);
      setStatus(data);
    } catch (error) {
      setMessage({ text: apiErrorMessage(error, 'Gagal terhubung ke server', true), isError: true });
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
      const data = await apiRequest<any>('/api/admin/set-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          ...payload,
          ...(payload.isPro && paymentReference.trim() ? { paymentReference: paymentReference.trim(), reconciliationNote: reconciliationNote.trim() || undefined } : {}),
        }),
      });
      setMessage({
        text: data.isPro
          ? `${data.email} Pro sampai ${formatTanggal(data.proExpiresAt)}`
          : `${data.email} bukan Pro lagi`,
        isError: false,
      });
      setStatus({ email: data.email, isPro: data.isPro, proExpiresAt: data.proExpiresAt });
    } catch (error) {
      setMessage({ text: apiErrorMessage(error, 'Gagal terhubung ke server', true), isError: true });
    } finally {
      setLoading(false);
    }
  };

  const tombol =
    'text-white font-bold px-4 py-2 rounded-md text-sm transition-opacity disabled:opacity-50 hover:opacity-90';

  return (
    <Card as="div" className="border-tv-border p-6 mb-8" padding="none" radius="lg" surface="solid" elevation="none" overflow="visible" highlight={false}>
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
        <Button variant="bare" size="none" type="button" disabled={loading} onClick={cek} className={`bg-tv-blue ${tombol}`}>
          Cek Status
        </Button>
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

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-tv-muted">Referensi pembayaran (opsional)</label>
          <input
            type="text"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            placeholder="UUID dari klaim pembayaran user"
            className="w-full bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-tv-muted">Catatan rekonsiliasi (opsional)</label>
          <input
            type="text"
            value={reconciliationNote}
            onChange={(e) => setReconciliationNote(e.target.value)}
            placeholder="Contoh: transfer BCA sudah cocok"
            maxLength={500}
            className="w-full bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
          />
        </div>
        <p className="md:col-span-2 text-[11px] leading-relaxed text-tv-muted">
          Jika referensi diisi, aktivasi Pro juga menandai Payment Order sebagai PAID. Email dan referensi harus cocok; satu referensi tidak dapat dipakai dua kali.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        {paymentReference.trim() ? (
          <Button variant="bare" size="none"
            type="button"
            disabled={loading}
            onClick={() => simpan({ isPro: true })}
            className={`bg-tv-green ${tombol}`}
          >
            Aktifkan Sesuai Payment Order
          </Button>
        ) : (
          <>
            <Button variant="bare" size="none"
              type="button"
              disabled={loading}
              onClick={() => simpan({ isPro: true, months: 1 })}
              className={`bg-tv-green ${tombol}`}
            >
              +1 Bulan
            </Button>
            <Button variant="bare" size="none"
              type="button"
              disabled={loading}
              onClick={() => simpan({ isPro: true, months: 12 })}
              className={`bg-tv-green ${tombol}`}
            >
              +1 Tahun
            </Button>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text focus:outline-none focus:border-tv-blue"
            />
            <Button variant="bare" size="none"
              type="button"
              disabled={loading || !customDate}
              onClick={() => simpan({ isPro: true, expiresAt: new Date(customDate).toISOString() })}
              className={`bg-tv-blue ${tombol}`}
            >
              Set Tanggal
            </Button>
          </>
        )}
        <Button variant="bare" size="none"
          type="button"
          disabled={loading || Boolean(paymentReference.trim())}
          onClick={() => simpan({ isPro: false })}
          className={`bg-tv-red ${tombol}`}
        >
          Cabut Pro
        </Button>
      </div>

      <p className="text-[11px] text-tv-muted mt-3">
        {paymentReference.trim()
          ? 'Jika Payment Order dipakai, durasi Pro selalu diambil dari paket yang tercatat pada order; admin tidak dapat mengganti durasinya manual.'
          : 'Tombol durasi menumpuk dari tanggal berakhir kalau masa berlakunya belum habis, jadi sisa hari yang sudah dibayar tidak hangus.'}
      </p>

      {message && (
        <p className={`mt-3 text-sm ${message.isError ? 'text-tv-red' : 'text-tv-green'}`}>{message.text}</p>
      )}
    </Card>
  );
}
