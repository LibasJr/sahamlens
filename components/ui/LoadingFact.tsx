'use client';

import React, { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { cn } from '../../lib/utils/cn';

// Fakta soal pasar saham Indonesia & mekanisme bursa. Semua bersifat aturan/
// definisi yang tidak berubah harian - sengaja BUKAN angka pasar (harga, IHSG,
// kapitalisasi), karena angka begitu jadi basi tanpa ada yang memperbaruinya.
const FACTS: string[] = [
  'Kode saham IDX selalu 4 huruf. Akhiran ".JK" cuma penanda bursa Jakarta di Yahoo Finance.',
  'Satu lot di Bursa Efek Indonesia = 100 lembar. Sejak 2014, sebelumnya 500 lembar.',
  'Auto Rejection Atas (ARA) dan Bawah (ARB) membatasi gerak harga harian. Batasnya beda per rentang harga.',
  'Sesi Pra-pembukaan jalan 08:45-08:59. Harga pembukaan lahir dari lelang di sesi ini, bukan dari transaksi pertama.',
  'IHSG itu indeks tertimbang kapitalisasi pasar: emiten besar menggerakkannya jauh lebih kuat dari emiten kecil.',
  'Papan Pemantauan Khusus menampung emiten dengan kondisi tertentu - likuiditasnya biasanya jauh lebih tipis.',
  'Tanggal cum-dividen adalah hari terakhir beli untuk dapat dividen. Besoknya (ex-date), harga biasanya turun sebesar dividennya.',
  'Volume tinggi saat harga turun bukan sinyal akumulasi. Arah harga menentukan arti volumenya.',
  'RSI di atas 70 tidak otomatis "jual". Dalam tren naik kuat, RSI bisa bertahan di atas 70 berminggu-minggu.',
  'Backtest tanpa biaya transaksi selalu terlihat lebih bagus dari kenyataan. Fee + slippage memakan hasil strategi frekuensi tinggi.',
  'Rasio DER 2x itu bahaya untuk manufaktur, tapi normal untuk bank - utang adalah bahan baku bisnis bank.',
  'Sampel kecil bisa memberi hasil "signifikan" secara kebetulan. Makin banyak ambang yang dicoba, makin besar peluang salah kesimpulan.',
  'PER rendah tidak selalu murah. Bisa jadi pasar sedang memperkirakan laba tahun depan akan turun.',
  'T+2: transaksi hari ini baru benar-benar tersettle dua hari bursa kemudian.',
  'Stock split menambah jumlah lembar dan memotong harga proporsional. Nilai kepemilikanmu tidak berubah sama sekali.',
];

interface LoadingFactProps {
  /** Jeda ganti fakta, dalam milidetik. */
  intervalMs?: number;
  className?: string;
}

/**
 * Pendamping skeleton: mengisi waktu tunggu dengan satu kalimat yang berguna.
 * Fakta pertama selalu indeks 0 supaya render server dan client identik; pengacakan
 * baru terjadi setelah mount, jadi tidak ada hydration mismatch.
 */
export function LoadingFact({ intervalMs = 5000, className }: LoadingFactProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * FACTS.length));
    const timer = setInterval(() => setIndex((i) => (i + 1) % FACTS.length), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return (
    <div
      className={cn('flex items-start gap-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3.5', className)}
      aria-live="polite"
    >
      <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-tv-gold" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-tv-muted">Tahukah kamu</p>
        <p key={index} className="mt-1 text-xs leading-relaxed text-tv-text/90 animate-fadeIn">
          {FACTS[index]}
        </p>
      </div>
    </div>
  );
}

export default LoadingFact;
