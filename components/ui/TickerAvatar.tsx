import React from 'react';
import { cn } from '../../lib/utils/cn';

// Warna diambil deterministik dari kode emiten, jadi satu emiten selalu tampil
// dengan warna yang sama di seluruh app - user mengenalinya lewat warna sebelum
// sempat membaca hurufnya. Bukan logo asli: IDX tidak menyediakan logo emiten
// yang bisa diambil bebas, dan menembak URL logo pihak ketiga akan 404 untuk
// sebagian besar dari ~900 emiten.
const PALETTE = [
  { bg: 'rgba(59,130,246,0.14)', fg: '#60A5FA' },
  { bg: 'rgba(34,197,94,0.14)', fg: '#4ADE80' },
  { bg: 'rgba(139,92,246,0.14)', fg: '#A78BFA' },
  { bg: 'rgba(234,179,8,0.14)', fg: '#FACC15' },
  { bg: 'rgba(236,72,153,0.14)', fg: '#F472B6' },
  { bg: 'rgba(20,184,166,0.14)', fg: '#2DD4BF' },
  { bg: 'rgba(249,115,22,0.14)', fg: '#FB923C' },
];

// leading-none dipasang di kelas dasar, bukan per pemakaian. Kotak avatar berukuran
// TETAP (w-7/h-7 dst.), sementara lantai keterbacaan di globals.css menaikkan
// `text-[10px]`/`text-xs` menjadi 13px dan tinggi barisnya diwarisi dari body -
// 1,6 di layar <=768px. 13px x 1,6 = 20,8px, lebih tinggi daripada kotak 20px yang
// dipakai beberapa pemanggil lewat override, sehingga inisialnya mendesak keluar
// lingkaran. line-height 1 membuat tinggi kotak teks kembali sepadan dengan avatarnya.
const SIZES = {
  sm: 'w-7 h-7 text-[10px] rounded-md',
  md: 'w-9 h-9 text-xs rounded-lg',
  lg: 'w-12 h-12 text-sm rounded-xl',
} as const;

interface TickerAvatarProps {
  symbol: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function TickerAvatar({ symbol, size = 'md', className }: TickerAvatarProps) {
  const code = symbol.replace('.JK', '').toUpperCase();
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  const { bg, fg } = PALETTE[hash % PALETTE.length];

  return (
    // Warna dioper sebagai custom property, bukan langsung ke `color`, supaya mode
    // terang bisa menggelapkannya lewat SATU aturan di globals.css (lihat
    // .lens-ticker-avatar). Ketujuh warna palet ini dipilih untuk latar gelap; di atas
    // kartu putih yang paling pucat terukur 2,53:1 - huruf inisialnya nyaris hilang.
    // Menuliskan palet kedua di sini akan menggandakan daftar yang harus dijaga
    // selaras; color-mix menjaga identitas warnanya tetap satu sumber.
    <span
      className={cn('lens-ticker-avatar shrink-0 inline-flex items-center justify-center font-number font-bold leading-none tracking-tight select-none', SIZES[size], className)}
      style={{ background: bg, color: fg, border: `1px solid ${fg}33`, ['--lens-avatar-fg' as string]: fg }}
      aria-hidden="true"
    >
      {code.slice(0, 2)}
    </span>
  );
}

export default TickerAvatar;
