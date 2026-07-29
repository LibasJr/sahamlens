'use client';

import React, { useState } from 'react';
import * as xlsx from 'xlsx';

export default function ExportButton() {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/export');
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
