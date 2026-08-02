'use client';

import React, { useState } from 'react';

export default function ChangeSecretForm() {
  const [currentKey, setCurrentKey] = useState('');
  const [newKey, setNewKey] = useState('');
  const [confirmKey, setConfirmKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentKey || !newKey) {
      setMessage({ text: 'Isi password saat ini dan password baru', isError: true });
      return;
    }
    // Harus tetap sinkron dengan MIN_ADMIN_SECRET_LENGTH di modules/user/controller/admin.controller.ts
    if (newKey.length < 12) {
      setMessage({ text: 'Password baru minimal 12 karakter', isError: true });
      return;
    }
    if (newKey !== confirmKey) {
      setMessage({ text: 'Konfirmasi password baru tidak cocok', isError: true });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/change-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentKey, newKey }),
      });
      let data: { success?: boolean; error?: string } = {};
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
      setMessage({ text: 'Password admin berhasil diganti', isError: false });
      setCurrentKey('');
      setNewKey('');
      setConfirmKey('');
    } catch {
      setMessage({ text: 'Gagal terhubung ke server', isError: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-tv-card border border-tv-border rounded-lg p-6 mb-8">
      <h2 className="font-heading text-lg font-bold text-tv-text mb-1">Ganti Password Admin</h2>
      <p className="text-xs text-tv-muted mb-4">Berlaku langsung, tanpa perlu deploy ulang. Minimal 12 karakter.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm">
        <input
          type="password"
          value={currentKey}
          onChange={(e) => setCurrentKey(e.target.value)}
          placeholder="Password saat ini"
          autoComplete="off"
          className="bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
        />
        <input
          type="password"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="Password baru (min. 12 karakter)"
          autoComplete="off"
          className="bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
        />
        <input
          type="password"
          value={confirmKey}
          onChange={(e) => setConfirmKey(e.target.value)}
          placeholder="Konfirmasi password baru"
          autoComplete="off"
          className="bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-tv-blue hover:bg-tv-blueHover text-white font-bold px-4 py-2 rounded-md text-sm transition-colors disabled:opacity-50"
        >
          Ganti Password
        </button>
      </form>
      {message && (
        <p className={`mt-3 text-sm ${message.isError ? 'text-tv-red' : 'text-tv-green'}`}>{message.text}</p>
      )}
    </div>
  );
}
