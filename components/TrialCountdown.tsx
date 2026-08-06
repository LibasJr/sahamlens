'use client';

import React from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';

// Badge hitung mundur trial 7 hari, dipasang di header global (TopMarketBar).
// Hanya tampil untuk user yang benar-benar sedang trial - user Pro, admin, dan
// guest tidak punya hitungan mundur, jadi useAuthUser() mengembalikan
// trialDaysLeft null untuk mereka dan komponen ini tidak merender apa pun.
export default function TrialCountdown({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft === null) return null;

  // <= 2 hari diberi warna peringatan - satu-satunya perbedaan visual, supaya
  // badge tidak berubah warna tiap hari tanpa alasan.
  const urgent = daysLeft <= 2;

  return (
    <Link
      href="/home"
      title={`Masa trial tersisa ${daysLeft} hari. Klik untuk lihat paket Pro.`}
      className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        urgent
          ? 'border-tv-red/30 bg-tv-red/10 text-tv-red hover:bg-tv-red/20'
          : 'border-tv-gold/30 bg-tv-gold/10 text-tv-gold hover:bg-tv-gold/20'
      }`}
    >
      <Clock className="h-3.5 w-3.5" />
      Trial {daysLeft} hari lagi
    </Link>
  );
}
