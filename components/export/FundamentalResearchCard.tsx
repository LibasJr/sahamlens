'use client';

import React from 'react';
import { fmtDer, fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
import { Card3DTheme, getSector3DTheme, getThemeById } from './card-3d-themes';
import type { MoatProxyResult } from '@/modules/fundamental/service/moat-proxy.service';
import type { EarningsQuarter } from '@/modules/fundamental/service/public-earnings-data.service';
import {
  formatObservedDate,
  formatPercent,
  formatPpWithUnit,
  TREND_LABEL,
  type OwnershipTrendKey,
} from '@/components/ownership-flow/ownership-flow-format';
import {
  ABSENT, BULL, BEAR, FLAT, HIGHLIGHT, INK, INK_2, INK_3, RULE, RULE_SOFT, SERIF,
  Absent, Eyebrow, Field, Rule, SectionTitle, Sheet, accentOf, orAbsent, pct, rp, toneColor,
} from './research-paper';

/**
 * Kartu ekspor Fundamental, bahasa visual "catatan riset" - pasangan dari
 * `TechnicalResearchCard`, memakai palet dan potongan yang sama dari `research-paper.tsx`.
 *
 * Menggantikan `FundamentalMoatEarningsExportCard3D`. Selain bahasa visualnya, tiga hal
 * yang berubah adalah soal kejujuran angka, bukan selera:
 *
 * 1. RASIO TIDAK LAGI DIPOTONG DIAM-DIAM. Kartu lama menyusun 13 kandidat rasio lalu
 *    `.slice(0, 8)`. Rasio ke-9 dan seterusnya hilang tanpa jejak, dan mana yang hilang
 *    bergantung pada urutan array - bukan pada apa yang penting untuk emitennya.
 *
 * 2. DESKRIPSI TIDAK LAGI DIPANGKAS CSS. `line-clamp-2` pada pilar moat dan
 *    `line-clamp-3` pada profil emiten memotong kalimat di tengah pada kartu yang justru
 *    diekspor sebagai gambar - pembacanya tidak bisa hover, scroll, atau klik "selengkapnya".
 *
 * 3. WARNA MENYATAKAN ARAH, DAN HANYA ARAH. Di kartu lama "Ketahanan Lintas Waktu" selalu
 *    dicetak hijau termasuk saat statusnya RAPUH, dan spektrum valuasi cuma membedakan
 *    UNDERVALUED (hijau) dari sisanya (cyan) - jadi OVERVALUED terlihat sama netralnya
 *    dengan FAIR VALUE.
 */

export interface FundamentalResearchCardProps {
  ticker: string;
  stock: {
    symbol?: string;
    name?: string;
    current_price?: number;
    change_pct?: number | null;
    volume?: number | null;
  };
  scoring?: {
    totalScore?: number | null;
    breakdown?: {
      fundamental?: number | null;
      technical?: number | null;
      momentum?: number | null;
      moneyFlow?: number | null;
      risk?: number | null;
    };
  };
  fundamentals?: {
    marketCap?: number | null;
    trailingPE?: number | null;
    forwardPE?: number | null;
    priceToBook?: number | null;
    returnOnEquity?: number | null;
    returnOnAssets?: number | null;
    debtToEquity?: number | null;
    currentRatio?: number | null;
    quickRatio?: number | null;
    revenueGrowth?: number | null;
    earningsGrowth?: number | null;
    totalRevenue?: number | null;
    dividendYield?: number | null;
    grossMargins?: number | null;
    operatingMargins?: number | null;
    profitMargins?: number | null;
    ebitda?: number | null;
  };
  profile?: {
    sector?: string;
    industry?: string;
    description?: string;
    website?: string;
  };
  moat?: MoatProxyResult | null;
  durability?: {
    status: 'TAHAN' | 'CAMPURAN' | 'RAPUH' | 'DATA TERBATAS' | string;
    conclusion?: string;
    averageRoePct?: number | null;
    costOfEquityPct?: number | null;
  } | null;
  upcomingEarnings?: {
    date: string | null;
    isEstimate: boolean;
    fiscalQuarter: string | null;
  } | null;
  earningsExpectation?: {
    eps: { average: number | null; growth: number | null; currency: string | null };
    revenue: { average: number | null; growth: number | null; currency: string | null };
  } | null;
  latestEarningsQuarter?: EarningsQuarter | null;
  valuation?: {
    fairValue?: number | null;
    mos?: number | null;
    valuation?: string | null;
    method?: string | null;
  } | null;
  ownership?: {
    foreignPct?: number | null;
    localPct?: number | null;
    scriplessPct?: number | null;
    /**
     * Perubahan terhadap snapshot KSEI SEBELUMNYA, bukan deret `delta` yang berkunci
     * '1d'/'7d'/'30d'. Kunci-kunci itu adalah horizon yang DIMINTA, bukan yang tersedia:
     * cadence KSEI bulanan, jadi untuk BBCA 31 Juli 2026 ketiganya menunjuk basis yang
     * sama (30 Juni 2026, jarak 31 hari) dengan angka yang sama. `previous` membawa
     * `actualGapDays` sehingga jendelanya bisa ditulis apa adanya.
     */
    previous?: {
      basisObservedDate?: string | null;
      actualGapDays?: number | null;
      foreignPp?: number | null;
      localPp?: number | null;
    } | null;
    trend?: string | null;
    observedDate?: string | null;
  } | null;
  themeId?: string;
  theme?: Card3DTheme;
  exportedAt?: Date;
}

interface RatioItem {
  code: string;
  name: string;
  value: string;
  note: string;
}

function fmtCompact(value: number | null, currency: string | null = null): string {
  if (value == null || !Number.isFinite(value)) return ABSENT;
  const formatted = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  return currency ? `${currency} ${formatted}` : formatted;
}

/** Angka telanjang (EPS, rasio kejutan) dengan konvensi desimal yang sama seperti sisa
 *  lembar. Tanpa ini, `${quarter.estimatedEps}` mencetak "121.12" tepat di sebelah
 *  "IDR 124,97" yang keluar dari `fmtCompact`. */
function angka(value: number | null | undefined, maxDigits = 2): string {
  if (value == null || !Number.isFinite(value)) return ABSENT;
  return value.toLocaleString('id-ID', { maximumFractionDigits: maxDigits });
}

function fmtTanggal(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(date);
}

/** Warna untuk kesimpulan valuasi. UNDERVALUED dan OVERVALUED adalah dua arah yang
 *  berbeda; kartu lama mencetak keduanya dengan bobot visual yang sama. */
function valuationColor(status?: string | null): string {
  const s = (status || '').toUpperCase();
  if (s.includes('UNDER')) return BULL;
  if (s.includes('OVER')) return BEAR;
  return FLAT;
}

export default function FundamentalResearchCard({
  ticker,
  stock,
  scoring,
  fundamentals = {},
  profile = {},
  moat,
  durability,
  upcomingEarnings,
  earningsExpectation,
  latestEarningsQuarter,
  valuation = null,
  ownership = null,
  themeId,
  theme,
  exportedAt = new Date(),
}: FundamentalResearchCardProps) {
  const activeTheme =
    theme || (themeId ? getThemeById(themeId) : getSector3DTheme(profile.sector, profile.industry, ticker));
  const accent = accentOf(activeTheme);

  const displaySymbol = (ticker || '').replace('.JK', '').toUpperCase();
  const price = stock.current_price ?? null;
  const up = stock.change_pct != null ? stock.change_pct >= 0 : null;
  const priceColor = up == null ? INK : up ? BULL : BEAR;

  const activeMoat = moat ?? null;
  const moatStatus = activeMoat?.status ?? 'DATA TERBATAS';

  // Seluruh rasio yang punya angka ditampilkan. Kartu lama memotong di 8 tanpa
  // menyebutkannya, jadi rasio yang hilang ditentukan urutan array - bukan relevansinya.
  //
  // `terukur()` membedakan nol yang DIUKUR dari nol yang berarti "tidak berlaku". Yahoo
  // mengirim `grossMargins: 0` untuk bank - bukan karena BBCA tidak punya laba kotor,
  // melainkan karena laba kotor tidak dilaporkan dalam pengertian yang sama di perbankan.
  // `fmtPersen(0)` mencetaknya "0.00%", angka yang terbaca sebagai fakta pada lembar yang
  // diekspor sebagai gambar - kegagalan yang sama persis dengan temuan H-13 di
  // shared/format/fundamental-format.ts, cuma sumber nolnya kali ini penyedia data.
  //
  // Pertumbuhan dan imbal hasil dividen TIDAK ikut dijaga: emiten yang tidak membagi
  // dividen memang ber-DY 0%, dan pendapatan yang stagnan memang tumbuh 0%.
  const terukur = (v: number | null | undefined): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v !== 0 ? v : null;

  const ratios: RatioItem[] = (
    [
      { code: 'ROE', name: 'Return on Equity', raw: fmtPersen(terukur(fundamentals.returnOnEquity)), note: 'Efisiensi ekuitas' },
      { code: 'ROA', name: 'Return on Assets', raw: fmtPersen(terukur(fundamentals.returnOnAssets)), note: 'Produktivitas aset' },
      { code: 'NPM', name: 'Net Profit Margin', raw: fmtPersen(terukur(fundamentals.profitMargins)), note: 'Margin laba bersih' },
      { code: 'OPM', name: 'Operating Margin', raw: fmtPersen(terukur(fundamentals.operatingMargins)), note: 'Margin operasional' },
      { code: 'GPM', name: 'Gross Profit Margin', raw: fmtPersen(terukur(fundamentals.grossMargins)), note: 'Margin laba kotor' },
      { code: 'PER', name: 'Price to Earnings', raw: fmtKali(terukur(fundamentals.trailingPE)), note: 'Valuasi atas laba' },
      { code: 'F.PE', name: 'Forward P/E', raw: fmtKali(terukur(fundamentals.forwardPE)), note: 'Valuasi atas proyeksi' },
      { code: 'PBV', name: 'Price to Book Value', raw: fmtKali(terukur(fundamentals.priceToBook)), note: 'Valuasi atas nilai buku' },
      { code: 'REV', name: 'Revenue Growth', raw: fmtPersen(fundamentals.revenueGrowth), note: 'Pertumbuhan pendapatan YoY' },
      { code: 'EPS.G', name: 'EPS Growth', raw: fmtPersen(fundamentals.earningsGrowth), note: 'Pertumbuhan laba per saham' },
      { code: 'DY', name: 'Dividend Yield', raw: fmtPersen(fundamentals.dividendYield), note: 'Imbal hasil dividen' },
      { code: 'DER', name: 'Debt to Equity', raw: fmtDer(terukur(fundamentals.debtToEquity)), note: 'Solvabilitas' },
      { code: 'CR', name: 'Current Ratio', raw: fmtKali(terukur(fundamentals.currentRatio)), note: 'Likuiditas jangka pendek' },
    ] as Array<{ code: string; name: string; raw: string | null; note: string }>
  )
    .map((r) => ({ ...r, value: orAbsent(r.raw) }))
    .filter((r) => r.value !== ABSENT)
    .map(({ code, name, value, note }) => ({ code, name, value, note }));

  const fairValue = valuation?.fairValue ?? null;
  const mos =
    valuation?.mos ??
    (fairValue != null && price != null && fairValue !== 0
      ? Math.round(((fairValue - price) / fairValue) * 1000) / 10
      : null);
  const valuationStatus =
    valuation?.valuation || (mos != null ? (mos > 10 ? 'UNDERVALUED' : mos < -10 ? 'OVERVALUED' : 'FAIR VALUE') : null);

  const breakdown = scoring?.breakdown || {};
  const scoreRows = [
    { label: 'Fundamental', value: breakdown.fundamental ?? null, max: 30 },
    { label: 'Teknikal', value: breakdown.technical ?? null, max: 40 },
    { label: 'Arus dana', value: breakdown.moneyFlow ?? null, max: 30 },
  ];

  const earningsDate = fmtTanggal(upcomingEarnings?.date);
  const pillars = activeMoat?.pillars ?? [];

  const foreignPct = typeof ownership?.foreignPct === 'number' ? ownership.foreignPct : null;
  const localPct = typeof ownership?.localPct === 'number' ? ownership.localPct : null;
  const scriplessPct = typeof ownership?.scriplessPct === 'number' ? ownership.scriplessPct : null;
  const foreignPp = typeof ownership?.previous?.foreignPp === 'number' ? ownership.previous.foreignPp : null;
  const localPp = typeof ownership?.previous?.localPp === 'number' ? ownership.previous.localPp : null;
  const gapDays = typeof ownership?.previous?.actualGapDays === 'number' ? ownership.previous.actualGapDays : null;
  const basisDate = ownership?.previous?.basisObservedDate ?? null;
  /** "31 hari" kalau jaraknya diketahui; kalau tidak, jangan mengarang jendela. */
  const gapLabel = gapDays != null ? `${gapDays} hari` : 'Antar-snapshot';
  const trendLabel = ownership?.trend
    ? (TREND_LABEL[ownership.trend as OwnershipTrendKey]?.label ?? ownership.trend)
    : null;

  return (
    <Sheet
      documentLabel="Catatan Fundamental"
      accent={accent}
      exportedAt={exportedAt}
      sectorLabel={activeTheme.sectorLabel}
      disclaimer="Rasio, moat proksi, dan nilai wajar dihitung dari laporan keuangan yang dipublikasikan emiten serta data pasar Bursa Efek Indonesia. Angka valuasi adalah keluaran model kuantitatif, bukan target harga dan bukan anjuran beli atau jual."
    >
      {/* 1. IDENTITAS EMITEN ──────────────────────────────────────────────── */}
      <div className="flex items-end justify-between" style={{ paddingTop: 22, paddingBottom: 20 }}>
        <div>
          <div className="flex items-center gap-3">
            <h1 style={{ fontFamily: SERIF, fontSize: 54, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {displaySymbol}
            </h1>
            <span
              style={{ border: `1px solid ${RULE}`, color: INK_2, fontSize: 11, letterSpacing: '0.1em', padding: '4px 9px' }}
              className="uppercase font-semibold"
            >
              {profile.sector || 'Sektor IDX'}
            </span>
            {profile.industry ? (
              <span style={{ color: INK_3, fontSize: 11.5 }}>{profile.industry}</span>
            ) : null}
          </div>
          <div style={{ color: INK_2, fontSize: 15, marginTop: 8 }}>{stock.name || `${displaySymbol} Tbk`}</div>
          <div style={{ color: INK_3, fontSize: 12.5, marginTop: 4 }}>
            Kapitalisasi pasar {orAbsent(fmtTriliun(fundamentals.marketCap))} · PER{' '}
            {orAbsent(fmtKali(fundamentals.trailingPE))} · PBV {orAbsent(fmtKali(fundamentals.priceToBook))}
          </div>
        </div>

        <div className="text-right">
          <Eyebrow>Harga Terkini</Eyebrow>
          <div className="font-number" style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}>
            {rp(price)}
          </div>
          <div className="font-number font-bold" style={{ color: priceColor, fontSize: 15, marginTop: 4 }}>
            {up == null ? ABSENT : `${up ? '▲' : '▼'} ${pct(stock.change_pct, true, 2)}`}
          </div>
        </div>
      </div>

      <Rule strong />

      {/* 2. RINGKASAN PENILAIAN ───────────────────────────────────────────── */}
      <div style={{ paddingTop: 20, paddingBottom: 20 }}>
        <SectionTitle accent={accent} note="Skor kuantitatif, bukan rekomendasi transaksi">
          Ringkasan Penilaian
        </SectionTitle>

        <div className="grid grid-cols-3 gap-7">
          <div>
            <Eyebrow>LensScore</Eyebrow>
            <div className="flex items-baseline gap-1.5" style={{ marginTop: 4 }}>
              <span className="font-number" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1 }}>
                {scoring?.totalScore ?? ABSENT}
              </span>
              <span style={{ color: INK_3, fontSize: 14 }}>/ 100</span>
            </div>

            <div style={{ marginTop: 12 }}>
              {scoreRows.map((row) => (
                <div key={row.label} className="flex items-center gap-2.5" style={{ marginBottom: 6 }}>
                  <span style={{ color: INK_2, fontSize: 12, width: 84 }}>{row.label}</span>
                  <span style={{ flex: 1, height: 4, backgroundColor: RULE_SOFT, display: 'block' }}>
                    <span
                      style={{
                        display: 'block',
                        height: 4,
                        width: `${row.value != null ? Math.max(0, Math.min(100, (row.value / row.max) * 100)) : 0}%`,
                        backgroundColor: accent,
                      }}
                    />
                  </span>
                  <span className="font-number" style={{ color: INK, fontSize: 12, width: 46, textAlign: 'right' }}>
                    {row.value != null ? `${row.value}/${row.max}` : ABSENT}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Eyebrow>Moat Keunggulan Bisnis</Eyebrow>
            <div
              style={{ fontFamily: SERIF, fontSize: 27, fontWeight: 700, color: toneColor(moatStatus), marginTop: 6, lineHeight: 1.15 }}
            >
              {moatStatus}
            </div>
            {activeMoat ? (
              <>
                <div style={{ display: 'flex', height: 6, marginTop: 14 }}>
                  <span style={{ width: `${(activeMoat.supportive / Math.max(1, activeMoat.available)) * 100}%`, backgroundColor: BULL }} />
                  <span style={{ width: `${(activeMoat.neutral / Math.max(1, activeMoat.available)) * 100}%`, backgroundColor: '#C9C3B4' }} />
                  <span style={{ width: `${(activeMoat.caution / Math.max(1, activeMoat.available)) * 100}%`, backgroundColor: BEAR }} />
                </div>
                {/* `available`, `supportive` dan `expected` dari buildMoatProxy menghitung
                    INDIKATOR, bukan pilar - `EXPECTED_INDICATORS` adalah jumlah metrik di
                    seluruh PILLAR_RULES. Menyebutnya "pilar" membuat lembar ini membantah
                    dirinya sendiri: ia mengaku punya 10 pilar tepat di atas daftar yang
                    memuat empat. */}
                <div style={{ color: INK_2, fontSize: 12, marginTop: 9 }}>
                  <b style={{ color: INK }}>
                    {activeMoat.supportive} dari {activeMoat.available}
                  </b>{' '}
                  indikator kuantitatif mendukung, cakupan data {activeMoat.coveragePct}%.
                </div>
              </>
            ) : (
              <div style={{ color: INK_3, fontSize: 12, marginTop: 12 }}>Pilar keunggulan belum dapat dinilai.</div>
            )}
          </div>

          <div>
            <Eyebrow>Nilai Wajar &amp; Margin of Safety</Eyebrow>
            {fairValue != null ? (
              <>
                <div className="font-number" style={{ fontSize: 27, fontWeight: 700, marginTop: 6, lineHeight: 1.15 }}>
                  {rp(fairValue)}
                </div>
                <div
                  className="uppercase font-bold"
                  style={{ color: valuationColor(valuationStatus), fontSize: 12.5, letterSpacing: '0.1em', marginTop: 8 }}
                >
                  {valuationStatus || ABSENT}
                  {mos != null ? ` · MoS ${pct(mos, true)}` : ''}
                </div>
                <div style={{ color: INK_2, fontSize: 12, marginTop: 9 }}>
                  Metode {orAbsent(valuation?.method) === ABSENT ? 'kuantitatif absolut' : valuation!.method}, dibandingkan
                  harga pasar {rp(price)}.
                </div>
              </>
            ) : (
              <div style={{ color: INK_3, fontSize: 12, marginTop: 8 }}>
                Nilai wajar belum tersedia; valuasi dibaca lewat PER dan PBV di tabel rasio.
              </div>
            )}
          </div>
        </div>
      </div>

      <Rule strong />

      {/* 3. RASIO FINANSIAL ───────────────────────────────────────────────── */}
      <div style={{ paddingTop: 20, paddingBottom: 18 }}>
        <SectionTitle accent={accent} note={`${ratios.length} rasio tersedia dari 13 yang dihitung`}>
          Rasio Finansial &amp; Profitabilitas
        </SectionTitle>

        {ratios.length > 0 ? (
          <div className="grid grid-cols-4 gap-x-8">
            {ratios.map((r, idx) => (
              <div key={r.code} style={{ padding: '11px 0', borderTop: idx > 3 ? `1px solid ${RULE_SOFT}` : 'none' }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{r.name}</span>
                  <span
                    className="uppercase font-bold"
                    style={{ color: INK_3, fontSize: 10.5, letterSpacing: '0.09em', whiteSpace: 'nowrap' }}
                  >
                    {r.code}
                  </span>
                </div>
                <div className="font-number font-bold" style={{ fontSize: 18, marginTop: 4, color: INK }}>
                  {r.value}
                </div>
                <div style={{ color: INK_3, fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>{r.note}</div>
              </div>
            ))}
          </div>
        ) : (
          <Absent>Rasio fundamental tidak tersedia pada instrumen ini.</Absent>
        )}
      </div>

      <Rule strong />

      {/* 4. PILAR MOAT ────────────────────────────────────────────────────── */}
      <div style={{ paddingTop: 20, paddingBottom: 18 }}>
        <SectionTitle
          accent={accent}
          note={
            activeMoat
              ? `${activeMoat.available} dari ${activeMoat.expected} indikator tersedia · ${pillars.length} pilar`
              : 'Proksi kuantitatif'
          }
        >
          Pilar Keunggulan Bisnis
        </SectionTitle>

        {pillars.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-8">
            {pillars.map((pillar, idx) => (
              <div key={pillar.key} style={{ padding: '11px 0', borderTop: idx > 1 ? `1px solid ${RULE_SOFT}` : 'none' }}>
                <div className="flex items-baseline justify-between gap-3">
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{pillar.label}</span>
                  <span
                    className="uppercase font-bold"
                    style={{ color: toneColor(pillar.status), fontSize: 11.5, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}
                  >
                    {pillar.status}
                  </span>
                </div>
                {/* Deskripsi utuh. Kartu lama memangkasnya dengan line-clamp-2 pada gambar
                    yang tidak bisa di-hover maupun di-scroll. */}
                <div style={{ color: INK_2, fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>{pillar.description}</div>
                <div style={{ color: INK_3, fontSize: 11.5, marginTop: 3 }}>
                  {pillar.supportive} mendukung · {pillar.caution} perlu dicermati · dari {pillar.available} indikator
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Absent>Pilar keunggulan moat belum teridentifikasi pada emiten ini.</Absent>
        )}

        {durability?.status ? (
          <div
            className="flex items-baseline justify-between gap-6"
            style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${RULE}` }}
          >
            <span style={{ color: INK_2, fontSize: 12.5 }}>
              Ketahanan lintas waktu — konsistensi empat tahun buku terakhir
              {durability.averageRoePct != null && durability.costOfEquityPct != null
                ? `, ROE rata-rata ${pct(durability.averageRoePct)} terhadap biaya ekuitas ${pct(durability.costOfEquityPct)}`
                : ''}
              .
            </span>
            {/* Warna mengikuti status. Kartu lama mencetak baris ini hijau termasuk saat RAPUH. */}
            <span
              className="uppercase font-bold"
              style={{ color: toneColor(durability.status), fontSize: 12.5, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}
            >
              {durability.status}
            </span>
          </div>
        ) : null}
      </div>

      <Rule strong />

      {/* 5. LAPORAN KEUANGAN & KONSENSUS ──────────────────────────────────── */}
      <div style={{ paddingTop: 20, paddingBottom: 20 }}>
        <SectionTitle accent={accent} note="Publikasi emiten di Bursa Efek Indonesia">
          Laporan Keuangan &amp; Konsensus
        </SectionTitle>

        <div className="grid grid-cols-4 gap-6">
          <Field
            label="Jadwal Rilis"
            value={
              earningsDate ||
              (latestEarningsQuarter?.quarter ? `${latestEarningsQuarter.quarter} rilis` : ABSENT)
            }
            sub={
              upcomingEarnings?.fiscalQuarter
                ? `${upcomingEarnings.fiscalQuarter}${upcomingEarnings.isEstimate ? ' · estimasi' : ''}`
                : 'Menunggu keterbukaan informasi'
            }
          />
          <Field
            label={earningsExpectation?.eps?.average != null ? 'Konsensus EPS' : 'Pertumbuhan Laba'}
            value={
              earningsExpectation?.eps?.average != null
                ? fmtCompact(earningsExpectation.eps.average, earningsExpectation.eps.currency ?? null)
                : orAbsent(fmtPersen(fundamentals.earningsGrowth))
            }
            sub={
              earningsExpectation?.eps?.growth != null
                ? `Proyeksi tumbuh ${pct(earningsExpectation.eps.growth, true)}`
                : fundamentals.revenueGrowth != null
                  ? `Pendapatan ${orAbsent(fmtPersen(fundamentals.revenueGrowth))} YoY`
                  : 'Konsensus analis belum tersedia'
            }
          />
          <Field
            label="EPS Aktual vs Estimasi"
            value={
              latestEarningsQuarter?.actualEps != null
                ? `${angka(latestEarningsQuarter.actualEps)} / ${angka(latestEarningsQuarter.estimatedEps)}`
                : ABSENT
            }
            valueColor={latestEarningsQuarter?.status ? toneColor(latestEarningsQuarter.status) : undefined}
            sub={
              latestEarningsQuarter?.surprisePct != null
                ? `Kejutan ${pct(latestEarningsQuarter.surprisePct, true)} · ${latestEarningsQuarter.status}`
                : latestEarningsQuarter?.quarter
                  ? `Periode ${latestEarningsQuarter.quarter}`
                  : 'Belum ada kuartal terlapor'
            }
          />
          <Field
            label="Margin Laba Bersih"
            value={orAbsent(fmtPersen(latestEarningsQuarter?.profitMargin ?? fundamentals.profitMargins))}
            sub={
              latestEarningsQuarter?.revenue != null
                ? `Pendapatan ${fmtCompact(latestEarningsQuarter.revenue)}`
                : orAbsent(fmtTriliun(fundamentals.totalRevenue)) !== ABSENT
                  ? `Pendapatan ${orAbsent(fmtTriliun(fundamentals.totalRevenue))}`
                  : 'Basis laporan tahunan berjalan'
            }
          />
        </div>
      </div>

      <Rule strong />

      {/* 6. STRUKTUR KEPEMILIKAN ──────────────────────────────────────────── */}
      <div style={{ paddingTop: 20, paddingBottom: 18 }}>
        <SectionTitle
          accent={accent}
          note={
            ownership?.observedDate
              ? `Snapshot KSEI ${ownership.observedDate.slice(0, 10)}`
              : 'Snapshot KSEI terakhir'
          }
        >
          Struktur Kepemilikan
        </SectionTitle>

        {foreignPct != null || localPct != null || scriplessPct != null ? (
          <>
            {/* Batang ini menggambarkan komposisi ANTARA asing dan domestik, dinormalkan
                terhadap jumlah keduanya - bukan terhadap 100% efek tercatat. Di data KSEI,
                foreignPct + localPct menyusun porsi scripless (BBCA 31 Juli 2026:
                29,31 + 13,24 = 42,55), jadi menggambarnya di atas skala 100 akan menyisakan
                ruang kosong yang seolah berarti "pemilik lain" padahal bukan. */}
            {foreignPct != null && localPct != null && foreignPct + localPct > 0 ? (
              <>
                <div style={{ display: 'flex', height: 6, marginBottom: 8 }}>
                  <span style={{ width: `${(foreignPct / (foreignPct + localPct)) * 100}%`, backgroundColor: accent }} />
                  <span style={{ width: `${(localPct / (foreignPct + localPct)) * 100}%`, backgroundColor: '#C9C3B4' }} />
                </div>
                <div style={{ color: INK_2, fontSize: 12, marginBottom: 14 }}>
                  Komposisi scripless: <b style={{ color: INK }}>{pct((foreignPct / (foreignPct + localPct)) * 100)}</b> asing
                  berbanding <b style={{ color: INK }}>{pct((localPct / (foreignPct + localPct)) * 100)}</b> domestik. Angka di
                  bawah adalah porsi terhadap seluruh efek tercatat.
                </div>
              </>
            ) : null}

            <div className="grid grid-cols-4 gap-6">
              {/* Persen vs poin persentase dipisah lewat formatter bersama ownership-flow:
                  40% -> 41% adalah +1 pp, sedangkan perubahan relatifnya +2,5%. Menulis
                  keduanya dengan '%' membuat pembaca menyimpulkan besaran yang salah. */}
              <Field
                label="Asing"
                value={orAbsent(formatPercent(foreignPct))}
                sub={foreignPp != null ? `${gapLabel} ${formatPpWithUnit(foreignPp)}` : 'Perubahan antar-snapshot belum tersedia'}
              />
              <Field
                label="Domestik"
                value={orAbsent(formatPercent(localPct))}
                sub={localPp != null ? `${gapLabel} ${formatPpWithUnit(localPp)}` : 'Perubahan antar-snapshot belum tersedia'}
              />
              <Field label="Scripless" value={orAbsent(formatPercent(scriplessPct))} sub="Porsi efek tanpa warkat" />
              <Field
                label="Arah Kepemilikan"
                value={orAbsent(trendLabel)}
                sub={basisDate ? `Dibanding snapshot ${formatObservedDate(basisDate)}` : 'Dibaca dari deret snapshot KSEI'}
              />
            </div>
          </>
        ) : (
          <Absent>Snapshot kepemilikan KSEI belum tersedia untuk emiten ini.</Absent>
        )}
      </div>

      <Rule strong />

      {/* 7. PROFIL EMITEN ─────────────────────────────────────────────────── */}
      <div style={{ paddingTop: 20, paddingBottom: 6 }}>
        <SectionTitle accent={accent} note={profile.website || 'Profil terdaftar IDX'}>
          Profil Emiten
        </SectionTitle>
        {/* Utuh, tanpa line-clamp: ini gambar, pembacanya tidak bisa membuka sisanya. */}
        <div style={{ color: INK_2, fontSize: 13, lineHeight: 1.65, maxWidth: 900 }}>
          {profile.description ||
            `${displaySymbol} adalah emiten yang tercatat di Bursa Efek Indonesia pada sektor ${profile.sector || 'yang belum tercatat di basis data'}.`}
        </div>
        {durability?.conclusion ? (
          <div
            style={{
              color: INK_2,
              fontSize: 12.5,
              lineHeight: 1.6,
              marginTop: 14,
              padding: '12px 14px',
              backgroundColor: HIGHLIGHT,
              borderLeft: `2px solid ${accent}`,
            }}
          >
            {durability.conclusion}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
