'use client';

import React, { useState } from 'react';
import { Download } from 'lucide-react';

interface ExportImageButtonProps {
  targetRef: React.RefObject<HTMLElement>;
  fileName: string;
  label?: string;
  disabled?: boolean;
}

// html-to-image di-import dinamis (bukan top-level) - sama pola dengan xlsx di
// app/admin/ExportButton.tsx - supaya library screenshot tidak masuk bundle awal
// halaman /fundamental atau /technical, cuma dimuat saat tombol ini benar-benar diklik.
export default function ExportImageButton({ targetRef, fileName, label = 'Export Gambar', disabled }: ExportImageButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (!targetRef.current) return;
    setLoading(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(targetRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Export image error:', error);
      alert('Gagal export gambar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || loading}
      className="bg-tv-hover border border-tv-borderLight hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-white text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
    >
      <Download className="w-3 h-3" />
      {loading ? 'Mengekspor...' : label}
    </button>
  );
}
