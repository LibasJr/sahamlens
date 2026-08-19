import { Button } from '@/components/ui/Button';
import React, { useState } from 'react';
import { Download } from 'lucide-react';
import Toast from '@/components/ui/Toast';
import { useAuthUser } from '@/lib/hooks/useAuthUser';

interface ExportImageButtonProps {
  targetRef: React.RefObject<HTMLElement>;
  fileName: string;
  label?: string;
  disabled?: boolean;
}

export default function ExportImageButton({ targetRef, fileName, label = 'Export Infografis (Admin)', disabled }: ExportImageButtonProps) {
  const { effectiveRole } = useAuthUser();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fitur Export Card dikhususkan eksklusif untuk user Admin saja
  if (effectiveRole !== 'admin') {
    return null;
  }

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
      setErrorMessage('Gagal mengekspor gambar. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Toast message={errorMessage} variant="error" />
      <Button variant="bare" size="none"
      onClick={handleExport}
      disabled={disabled || loading}
      className="bg-tv-hover border border-tv-borderLight hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-white text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
    >
      <Download className="w-3 h-3" />
      {loading ? 'Mengekspor...' : label}
      </Button>
    </>
  );
}
