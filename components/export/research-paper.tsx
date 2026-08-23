'use client';

import React from 'react';
import { Card3DTheme } from './card-3d-themes';

/**
 * Bahasa visual bersama untuk kartu ekspor "catatan riset".
 *
 * Dua kartu ekspor Studio (Teknikal dan Fundamental) memakai palet, tipografi, dan
 * potongan tata letak yang sama, dan berkas ini adalah satu-satunya tempat semuanya
 * didefinisikan. Alasannya bukan kerapian: sepanjang repo ini, duplikasi konstanta yang
 * "kelihatan sama" adalah pola yang berulang kali berakhir sebagai dua nilai yang
 * diam-diam berbeda (lihat komentar BUG FIX di modules/technical/service/atr.ts). Warna
 * yang bergeser tidak memerahkan test apa pun - ia cuma membuat dua kartu dari studio
 * yang sama terlihat seperti berasal dari dua produk berbeda.
 */

/* ── Palet kertas ─────────────────────────────────────────────────────────────── */

export const PAPER = '#F4F2EC';
export const SHEET = '#FFFFFF';
export const RULE = '#DDD8CC';
export const RULE_SOFT = '#EDEAE2';
export const INK = '#15181E';
export const INK_2 = '#535A66';
export const INK_3 = '#8B919B';
export const BULL = '#12673C';
export const BEAR = '#A02531';
export const FLAT = '#8A6A16';
/** Latar sel yang perlu ditonjolkan tanpa memakai warna arah. */
export const HIGHLIGHT = '#F7F5EF';

/** Tema sektor menyusut jadi satu warna aksen yang punya kontras cukup di atas kertas. */
export const ACCENT_BY_THEME: Record<string, string> = {
  'sapphire-bank': '#1B3A6B',
  'imperial-gold': '#7E6014',
  'emerald-infra': '#12673C',
  'solar-mining': '#9A4A20',
  'rose-fmcg': '#8B3A59',
  'ruby-health': '#A02531',
  'tokyo-neon': '#463683',
  'obsidian-cyber': '#1D4A54',
};

export const SERIF = "Georgia, 'Iowan Old Style', 'Source Serif Pro', 'Times New Roman', serif";

export function accentOf(theme: Card3DTheme): string {
  return ACCENT_BY_THEME[theme.id] || '#1B3A6B';
}

/* ── Format angka ─────────────────────────────────────────────────────────────── */

/** En dash, bukan '-' atau 'N/A': satu penanda "tidak tersedia" untuk seluruh kartu. */
export const ABSENT = '–';

export function rp(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return ABSENT;
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`;
}

export function pct(value?: number | null, withSign = false, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return ABSENT;
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return `${withSign && rounded > 0 ? '+' : ''}${rounded.toLocaleString('id-ID')}%`;
}

/**
 * Nilai yang sudah berupa string dari formatter lain; '-', '—' dan 'N/A' disamakan.
 *
 * Tiga penanda "tidak ada" itu bukan karangan: `shared/format/fundamental-format`
 * menulis 'N/A', `components/ownership-flow/ownership-flow-format` menulis em dash, dan
 * beberapa payload mengirim '-' apa adanya. Lembar ini cuma boleh punya satu.
 */
export function orAbsent(value?: string | null): string {
  if (value == null) return ABSENT;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '—' || trimmed.toUpperCase().startsWith('N/A')) {
    return ABSENT;
  }
  return desimalId(trimmed);
}

/**
 * Titik desimal -> koma. Formatter lama (`fmtKali`, `fmtPersen`, `fmtTriliun`) memakai
 * `toFixed()`, jadi keluarannya "13.66x" dan "Rp 792.55 T"; sementara `rp()` dan `pct()`
 * di berkas ini memakai locale id-ID, jadi keluarannya "Rp 6.450" dan "+0,78%".
 *
 * Dua konvensi dalam satu lembar bukan soal rapi: di id-ID titik adalah pemisah RIBUAN,
 * jadi "Rp 792.55 T" terbaca sebagai 79.255 triliun oleh pembaca yang tidak tahu angka itu
 * datang dari formatter mana. Kartu ini diekspor sebagai gambar - tidak ada tooltip yang
 * bisa meluruskannya.
 *
 * Hanya titik yang berperan sebagai desimal (satu titik diikuti 1-2 digit di ujung angka)
 * yang diganti, supaya "Rp 6.450" dari `rp()` tidak ikut rusak.
 */
export function desimalId(value: string): string {
  return value.replace(/(\d)\.(\d{1,2})(?!\d)/g, '$1,$2');
}

export function toneColor(direction?: string | null): string {
  const d = (direction || '').toUpperCase();
  if (d === 'BULLISH' || d === 'BUY' || d === 'KUAT' || d === 'TAHAN' || d === 'BEAT') return BULL;
  if (d === 'BEARISH' || d === 'SELL' || d === 'LEMAH' || d === 'RAPUH' || d === 'MISS') return BEAR;
  if (d === 'NA' || d === 'DATA TERBATAS') return INK_3;
  return FLAT;
}

export function timestampLabel(exportedAt: Date): string {
  return (
    exportedAt.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WIB'
  );
}

/* ── Potongan tata letak ──────────────────────────────────────────────────────── */

export function Rule({ strong = false }: { strong?: boolean }) {
  return <div style={{ height: 1, backgroundColor: strong ? RULE : RULE_SOFT }} />;
}

export function SectionTitle({
  children,
  accent,
  note,
}: {
  children: React.ReactNode;
  accent: string;
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-3">
      <div className="flex items-baseline gap-2.5">
        <span style={{ width: 18, height: 2, backgroundColor: accent, display: 'inline-block' }} />
        <span className="font-bold uppercase" style={{ color: INK, fontSize: 12.5, letterSpacing: '0.14em' }}>
          {children}
        </span>
      </div>
      {note ? <span style={{ color: INK_3, fontSize: 11.5, letterSpacing: '0.02em' }}>{note}</span> : null}
    </div>
  );
}

export function Field({
  label,
  value,
  valueColor,
  sub,
}: {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}) {
  return (
    <div style={{ borderLeft: `2px solid ${RULE}`, paddingLeft: 12 }}>
      <div style={{ color: INK_3, fontSize: 11, letterSpacing: '0.1em' }} className="uppercase font-semibold">
        {label}
      </div>
      <div className="font-number font-bold" style={{ color: valueColor || INK, fontSize: 21, marginTop: 3 }}>
        {value}
      </div>
      {sub ? <div style={{ color: INK_2, fontSize: 11.5, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: INK_3, fontSize: 11, letterSpacing: '0.1em' }} className="uppercase font-semibold">
      {children}
    </div>
  );
}

/** Baris kosong yang menyebutkan APA yang tidak ada, bukan sekadar strip. */
export function Absent({ children }: { children: React.ReactNode }) {
  return <div style={{ color: INK_3, fontSize: 12.5 }}>{children}</div>;
}

/**
 * Kop dan kaki dokumen. Keduanya identik di kedua kartu kecuali satu kata di kop
 * (`documentLabel`) dan kalimat penafian di kaki, jadi keduanya tinggal di sini.
 */
export function Sheet({
  documentLabel,
  accent,
  exportedAt,
  disclaimer,
  sectorLabel,
  children,
}: {
  documentLabel: string;
  accent: string;
  exportedAt: Date;
  disclaimer: string;
  sectorLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-[1080px] font-sans" style={{ backgroundColor: PAPER, color: INK, padding: 26 }}>
      <div style={{ backgroundColor: SHEET, border: `1px solid ${RULE}`, padding: '34px 40px 30px' }}>
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-3">
            <span style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em' }}>
              SahamLens
            </span>
            <span style={{ width: 1, height: 16, backgroundColor: RULE, display: 'inline-block' }} />
            <span
              style={{ color: INK_2, fontSize: 13.5, letterSpacing: '0.16em' }}
              className="uppercase font-semibold"
            >
              {documentLabel}
            </span>
          </div>
          <div className="text-right">
            <div style={{ color: INK_2, fontSize: 12.5 }}>{timestampLabel(exportedAt)}</div>
            <div style={{ color: INK_3, fontSize: 11.5, letterSpacing: '0.08em' }} className="uppercase">
              Bursa Efek Indonesia
            </div>
          </div>
        </div>

        <div style={{ height: 3, backgroundColor: accent, marginTop: 14 }} />

        {children}

        <div style={{ height: 3, backgroundColor: accent, marginTop: 22 }} />

        <div className="flex items-start justify-between gap-8" style={{ paddingTop: 14 }}>
          <div style={{ color: INK_2, fontSize: 11.5, lineHeight: 1.6, maxWidth: 720 }}>{disclaimer}</div>
          <div className="text-right" style={{ whiteSpace: 'nowrap' }}>
            <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 700 }}>sahamlens.id</div>
            <div style={{ color: INK_3, fontSize: 11, letterSpacing: '0.08em' }} className="uppercase">
              {sectorLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
