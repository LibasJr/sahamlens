'use client';

import React, { useState } from 'react';

export default function SetProForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const handleSubmit = async (isPro: boolean) => {
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
        body: JSON.stringify({ email: email.trim(), isPro }),
      });
      let data: { email?: string; isPro?: boolean; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        setMessage({ text: `Server error (HTTP ${res.status})`, isError: true });
        return;
      }
      if (!res.ok) {
        setMessage({ text: data.error || 'Gagal memproses', isError: true });
        return;
      }
      setMessage({ text: `${data.email} sekarang ${data.isPro ? 'Pro' : 'bukan Pro'}`, isError: false });
    } catch {
      setMessage({ text: 'Gagal terhubung ke server', isError: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-tv-card border border-tv-border rounded-lg p-6 mb-8">
      <h2 className="font-heading text-lg font-bold text-tv-text mb-4">Aktivasi Pro</h2>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@user.com"
          className="flex-1 bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => handleSubmit(true)}
          className="bg-tv-green hover:opacity-90 text-white font-bold px-4 py-2 rounded-md text-sm transition-opacity disabled:opacity-50"
        >
          Aktifkan Pro
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => handleSubmit(false)}
          className="bg-tv-red hover:opacity-90 text-white font-bold px-4 py-2 rounded-md text-sm transition-opacity disabled:opacity-50"
        >
          Nonaktifkan Pro
        </button>
      </div>
      {message && (
        <p className={`mt-3 text-sm ${message.isError ? 'text-tv-red' : 'text-tv-green'}`}>{message.text}</p>
      )}
    </div>
  );
}
