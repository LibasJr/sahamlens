'use client';

import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Tombol tampilkan/sembunyikan password.
 *
 * KENAPA JADI KOMPONEN. Pola ini sebelumnya disalin di empat tempat - login, signup
 * (password + konfirmasi), dan reset-password - dan keempatnya membawa cacat yang sama:
 * tanpa `aria-label` (jadi pembaca layar mengumumkannya sebagai tombol tanpa nama, satu-
 * satunya di seluruh aplikasi) dan dengan `tabIndex={-1}` (jadi pengguna keyboard tidak
 * bisa mencapainya sama sekali). Audit menemukannya justru KARENA disalin: satu salinan
 * diperbaiki tidak memperbaiki tiga sisanya.
 *
 * Ukurannya 44x44 - ambang target sentuh, bukan 16px seperti sebelumnya.
 */
export function PasswordToggle({
  shown,
  onToggle,
  label = 'password',
}: {
  shown: boolean;
  onToggle: () => void;
  /** Dipakai kalau ada lebih dari satu kolom password di satu formulir. */
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? `Sembunyikan ${label}` : `Tampilkan ${label}`}
      aria-pressed={shown}
      className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-lg text-tv-muted transition-colors hover:text-tv-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue"
    >
      {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

export default PasswordToggle;
