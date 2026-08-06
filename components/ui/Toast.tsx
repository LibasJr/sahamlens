'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, X } from 'lucide-react';

// Toast mengambang, hilang sendiri. Sengaja TANPA provider/context/queue: satu-satunya
// pemakai sekarang adalah pesan "silahkan login" di halaman /login (dipicu redirect dari
// proxy.ts). Kalau nanti ada dua toast yang harus antre di satu layar, baru tambahkan
// pengelolanya - bukan sebelum itu.
export default function Toast({ message, durationMs = 5000 }: { message: string | null; durationMs?: number }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!message) return;
    setOpen(true);
    const timer = setTimeout(() => setOpen(false), durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs]);

  return (
    <AnimatePresence>
      {open && message && (
        <motion.div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 z-[200] flex max-w-[92vw] -translate-x-1/2 items-start gap-2 rounded-lg border border-tv-blue/40 bg-tv-cardAlt px-4 py-3 text-[13px] text-tv-text shadow-2"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.2 }}
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-tv-blue" />
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup notifikasi"
            className="ml-1 shrink-0 text-tv-muted transition-colors hover:text-tv-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
