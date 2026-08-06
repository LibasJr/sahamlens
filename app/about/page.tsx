import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Eye, Grid3x3, ZoomIn } from 'lucide-react';
import { Card, PageContainer } from '@/components/ui';

export const metadata = {
  title: 'Tentang SahamLens',
  description: 'Memperjelas yang tersembunyi. Keputusan tetap milikmu. Filosofi di balik SahamLens - analisis saham IDX berbasis data.',
};

// Halaman filosofi brand (disepakati dengan user 2026-08-06) - versi lengkap dari
// tagline yang sudah tampil di footer Sidebar.tsx & Dashboard.tsx. Server Component
// murni, tanpa fetch/state - kontennya statis, tidak ada alasan jadi client component.
const PILLARS = [
  {
    icon: Eye,
    title: 'Alat lihat, bukan alat putus',
    body: 'Lensa membantu mata melihat lebih jelas - ia tidak menggantikan mata, tidak memutuskan apa arti yang dilihat. Setiap skor dan sinyal di SahamLens berhenti di titik menjelaskan; keputusan beli, jual, atau diam tetap milik yang memegang mata.',
  },
  {
    icon: Grid3x3,
    title: 'Satu lensa, banyak fokus',
    body: 'LensTechnical, LensFundamental, LensRadar, LensAI - beda titik fokus, objek yang dilihat sama: satu saham, dari sudut berbeda. Bukan satu alat serba tahu, tapi kumpulan sudut pandang yang saling melengkapi.',
  },
  {
    icon: ZoomIn,
    title: 'Memperbesar yang tersembunyi',
    body: 'Dari ratusan saham dan ribuan data harian, yang penting sering tenggelam di tengah kebisingan. SahamLens memperbesar pola itu - bukan menciptakan sinyal baru yang tidak pernah ada di datanya.',
  },
];

export default function AboutPage() {
  return (
    <PageContainer className="p-4 md:p-6 max-w-3xl">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Beranda
      </Link>

      <Card
        padding="none"
        className="relative overflow-hidden bg-gradient-accent-soft border border-tv-border/60 px-6 py-10 sm:px-10 sm:py-12 shadow-none"
      >
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-glow-purple blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-16 h-64 w-64 rounded-full bg-glow-blue blur-3xl" />

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-tv-blue/30 bg-tv-blue/10 px-3 py-1 text-[11px] font-semibold text-tv-blue">
            <Sparkles className="h-3 w-3" /> Filosofi SahamLens
          </span>
          <h1 className="mt-4 font-heading text-3xl sm:text-4xl font-bold tracking-tight text-tv-text leading-[1.15]">
            Memperjelas yang tersembunyi.<br />Keputusan tetap milikmu.
          </h1>
          <p className="mt-5 text-sm sm:text-base text-tv-text/90 leading-relaxed max-w-xl">
            Lensa tidak menciptakan objek yang dilihatnya - ia hanya membuat yang sudah ada
            jadi terlihat jelas. SahamLens bekerja dengan prinsip yang sama: dari ratusan
            saham dan ribuan data harian, ia memperbesar pola yang tenggelam di tengah
            kebisingan - lewat sudut pandang berbeda (teknikal, fundamental, radar, AI)
            yang saling melengkapi, seperti satu kamera dengan beberapa lensa berbeda fokus.
            Tapi seperti lensa mata, ia berhenti di titik melihat. Ia memperjelas, bukan
            memutuskan - keputusan akhir tetap di tangan yang punya mata.
          </p>
        </div>
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {PILLARS.map(({ icon: Icon, title, body }) => (
          <Card key={title} hoverable className="flex flex-col gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-tv-blue/10 text-tv-blue">
              <Icon className="h-4 w-4" />
            </span>
            <h2 className="font-heading text-sm font-bold text-tv-text">{title}</h2>
            <p className="text-[13px] text-tv-muted leading-relaxed">{body}</p>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-[11px] text-tv-muted leading-relaxed">
        Data bersumber dari Yahoo Finance (pihak ketiga), dapat mengalami keterlambatan.
        Informasi &amp; rekomendasi di aplikasi ini bersifat informatif, bukan nasihat investasi.
      </p>
    </PageContainer>
  );
}
