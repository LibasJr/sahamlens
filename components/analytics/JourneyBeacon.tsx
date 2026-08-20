'use client';

import { useEffect, useRef } from 'react';
import { trackJourneyEvent } from '@/shared/analytics/product-journey';
import type { JourneyEventName, JourneySurface } from '@/shared/analytics/journey-events';

/**
 * Penanda perjalanan riset yang bisa dipasang di halaman SERVER.
 *
 * Halaman emiten (`app/technical/[symbol]/page.tsx`) dirender di server, jadi ia tidak
 * bisa memanggil pelacak yang hidup di browser. Komponen tanpa tampilan ini yang
 * menjembatani - satu baris di JSX, tanpa mengubah halaman itu menjadi komponen klien
 * dan tanpa menyentuh SEO-nya.
 */
export function JourneyBeacon({
  event,
  surface,
}: {
  event: JourneyEventName;
  surface: JourneySurface;
}) {
  const sudah = useRef(false);

  useEffect(() => {
    // Strict Mode menjalankan effect dua kali di pengembangan; tanpa penjaga ini setiap
    // metrik terhitung dobel di data lokal dan angkanya berhenti bisa dipercaya saat
    // diperiksa manual.
    if (sudah.current) return;
    sudah.current = true;
    trackJourneyEvent(event, surface);
  }, [event, surface]);

  return null;
}

/**
 * Penanda yang baru menyala saat elemennya BENAR-BENAR terlihat.
 *
 * "Berapa persen pengguna mencapai bukti setelah membaca ringkasan" (PRD, Beta
 * evaluation) tidak bisa dijawab oleh event saat halaman dimuat: bukti berada jauh di
 * bawah lipatan, jadi memuat halaman bukan berarti menembus ke sana. Yang diukur harus
 * peristiwa terlihatnya, bukan tersedianya.
 */
export function JourneyVisibilityBeacon({
  event,
  surface,
}: {
  event: JourneyEventName;
  surface: JourneySurface;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const sudah = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || sudah.current) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || sudah.current) continue;
        sudah.current = true;
        trackJourneyEvent(event, surface);
        observer.disconnect();
      }
    }, { threshold: 0.4 });

    observer.observe(node);
    return () => observer.disconnect();
  }, [event, surface]);

  // Penanda setinggi satu piksel, BUKAN pembungkus. Membungkus blok bukti dengan div
  // tambahan akan menyisipkan konteks tata letak baru di tengah grid yang sudah jadi -
  // risiko tampilan untuk sesuatu yang tidak perlu terlihat sama sekali.
  return <div ref={ref} aria-hidden="true" className="h-px w-full" />;
}
