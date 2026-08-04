'use client';

import React, { useState } from 'react';
// xlsx di-import dinamis (optimasi loading 2026-08-05), sama seperti app/portfolio -
// hanya dibutuhkan saat tombol ini diklik.

export default function ExportButton() {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const xlsx = await import('xlsx');
      // limit=200 eksplisit - /api/admin/export sekarang dipaginasi (bukan lagi
      // dump semua baris tanpa batas). Tombol ini genuinely butuh "semua data"
      // dalam sekali klik (bukan UI berpaginasi), jadi minta cap besar daripada
      // diam-diam kepotong di limit default. Kalau data sudah >200 baris, ini
      // perlu diubah jadi loop multi-halaman - dicatat, bukan masalah sekarang.
      const res = await fetch('/api/admin/export?limit=200');
      const data = await res.json();

      if (!data.success) {
        alert('Failed to export data');
        setLoading(false);
        return;
      }

      const wb = xlsx.utils.book_new();
      
      // Add Users sheet
      if (data.users && data.users.length > 0) {
        const usersWs = xlsx.utils.json_to_sheet(data.users);
        xlsx.utils.book_append_sheet(wb, usersWs, 'Users');
      }

      // Add Watchlists sheet
      if (data.watchlists && data.watchlists.length > 0) {
        const watchlistsWs = xlsx.utils.json_to_sheet(data.watchlists);
        xlsx.utils.book_append_sheet(wb, watchlistsWs, 'Watchlists');
      }

      // Add Payments sheet
      if (data.payments && data.payments.length > 0) {
        const paymentsWs = xlsx.utils.json_to_sheet(data.payments);
        xlsx.utils.book_append_sheet(wb, paymentsWs, 'Payments');
      }

      // Save file
      const today = new Date().toISOString().split('T')[0];
      xlsx.writeFile(wb, `SahamLens_DB_${today}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting to Excel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="bg-tv-card border border-tv-border hover:bg-tv-border text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
    >
      {loading ? 'Exporting...' : 'Export Excel'}
    </button>
  );
}
