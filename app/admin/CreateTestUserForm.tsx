'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import React, { useState } from 'react';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';

// BARU (2026-08-14, permintaan pengguna: "bisa buatkan akun user/user di sistem, ini
// untuk user tes" -> "hak akses nya jgn admin, user testing biasa"). Akun yang dibuat
// SELALU role 'free' (server-side, tidak bisa diubah dari form ini - lihat
// handleCreateTestUser di modules/user/controller/admin.controller.ts) dan langsung
// terverifikasi (skip OTP email) supaya admin tidak perlu buka inbox email test.
export default function CreateTestUserForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const buat = async () => {
    if (!email.trim() || !password) {
      setMessage({ text: 'Isi email dan password dulu', isError: true });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const data = await apiRequest<any>('/api/admin/create-test-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setMessage({ text: `Akun tes ${data.email} berhasil dibuat dan langsung bisa dipakai login sebagai user biasa.`, isError: false });
      setEmail('');
      setPassword('');
    } catch (error) {
      setMessage({ text: apiErrorMessage(error, 'Gagal terhubung ke server', true), isError: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card as="div" className="border-tv-border p-6 mb-8" padding="none" radius="lg" surface="solid" elevation="none" overflow="visible" highlight={false}>
      <h2 className="font-heading text-lg font-bold text-tv-text mb-1">Buat Akun Tes</h2>
      <p className="text-[11px] text-tv-muted mb-4">
        Akun langsung terverifikasi (tanpa kode OTP email) - role selalu user biasa, BUKAN admin.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tes@email.com"
          className="flex-1 bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
        />
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min. 8 karakter)"
          className="flex-1 bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
        />
        <Button variant="bare" size="none"
          type="button"
          disabled={loading}
          onClick={buat}
          className="text-white font-bold px-4 py-2 rounded-md text-sm transition-opacity disabled:opacity-50 hover:opacity-90 bg-tv-blue"
        >
          Buat Akun
        </Button>
      </div>

      {message && (
        <p className={`mt-3 text-sm ${message.isError ? 'text-tv-red' : 'text-tv-green'}`}>{message.text}</p>
      )}
    </Card>
  );
}
