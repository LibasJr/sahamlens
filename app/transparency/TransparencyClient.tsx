'use client';

import React, { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Skeleton, EmptyState, LoadingFact } from '@/components/ui';
// File konstanta murni (nol impor, nol kode server) - aman dipakai dari komponen
// klien. Ambangnya diambil dari sumber yang sama dengan yang dipakai backend untuk
// memutuskan status validasi, bukan angka yang ditulis ulang di UI.
import { MIN_VALIDATION_DAYS, MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION } from '@/modules/lens-radar/constants/research-status';

type Bucket = '80-100' | '70-79' | '60-69' | '<60';

interface TransparencyBucketRow {
  bucket: Bucket;
  avgT1: number | null;
  avgT5: number | null;
  avgT20: number | null;
  avgT20Gross: number | null;
  winRateT20: number | null;
  totalSamples: number;
  maxDdP95T20: number | null;
  worstMaeT20: number | null;
  avgWinT20: number | null;
  avgLossT20: number | null;
}

interface TransparencyEquityPoint {
  date: string;
  lensTop5: number;
  ihsg: number | null;
  dailyReturnTop5: number;
  dailyReturnIHSG: number | null;
  signals: number;
}

interface TransparencyData {
  asOfDate: string;
  latestStatsRunDate: string | null;
  startDate: string | null;
  validationDays: number;
  totalSamples: number;
  illiquidRowsSkipped: number | null;
  minAvgValue20dIdr: number;
  pValue80VsLt60: number | null;
  significant: boolean;
  disclaimer: string;
  banner: {
    status: 'collecting' | 'validated' | 'not_significant';
    color: 'yellow' | 'green' | 'slate';
    message: string;
  };
  buckets: TransparencyBucketRow[];
  equityCurve: TransparencyEquityPoint[];
}

// Ketiga pemformat di bawah dulu mengembalikan '-' polos. Tanda hubung tidak
// membedakan "belum ada sampel", "tidak berlaku", dan "gagal dimuat" - padahal di
// halaman validasi statistik, perbedaan itu justru inti persoalannya. Sekarang
// keadaan kosong dinamai, dan sel yang kosong diberi gaya redup (lihat MutedCell).
const EMPTY_LABEL = 'belum ada';

function pct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return EMPTY_LABEL;
  return `${value.toFixed(digits)}%`;
}

function num(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EMPTY_LABEL;
  return value.toLocaleString('id-ID');
}

function pValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'belum bisa dihitung';
  if (value < 0.0001) return '<0.0001';
  return value.toFixed(4);
}

/** Sel angka yang otomatis meredup saat nilainya kosong, supaya baris tanpa data
 *  tidak terbaca sekuat baris yang benar-benar punya angka. */
function Cell({ value, tone, className = '' }: { value: number | null | undefined; tone?: 'up' | 'down' | 'fixed-green' | 'fixed-red'; className?: string }) {
  const empty = value == null || !Number.isFinite(value);
  let color = 'text-tv-text';
  if (empty) color = 'text-tv-muted/60 italic';
  else if (tone === 'up') color = (value as number) >= 0 ? 'text-tv-green' : 'text-tv-red';
  else if (tone === 'fixed-green') color = 'text-tv-green';
  else if (tone === 'fixed-red') color = 'text-tv-red';
  return <span className={`font-number ${color} ${className}`}>{pct(value)}</span>;
}

/**
 * Kartu yang menggantikan angka-nol saat data validasi masih terkumpul.
 * Dua syarat harus terpenuhi bersamaan (hari kalender DAN jumlah sampel efektif),
 * jadi keduanya ditampilkan - menampilkan salah satu saja akan membuat pengguna
 * mengira tinggal menunggu satu hal.
 */
function CollectingPanel({ data }: { data: TransparencyData }) {
  const days = Math.max(0, data.validationDays);
  const samples = Math.max(0, data.totalSamples);
  const daysLeft = Math.max(0, MIN_VALIDATION_DAYS - days);

  const readyDate = data.startDate
    ? new Date(new Date(data.startDate).getTime() + MIN_VALIDATION_DAYS * 24 * 60 * 60 * 1000)
    : null;

  return (
    <section className="bg-tv-card border border-tv-border rounded-xl overflow-hidden">
      <EmptyState
        illustration="collecting"
        title="Validasi masih dalam masa pengumpulan data"
        description={`Halaman ini baru bisa menyimpulkan apa pun setelah dua syarat terpenuhi bersamaan: ${MIN_VALIDATION_DAYS} hari kalender arsip DAN ${MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION} sampel efektif. Angka nol di bawah bukan kegagalan - itu jumlah sebenarnya yang sudah terkumpul sejauh ini.`}
        progress={{ current: days, total: MIN_VALIDATION_DAYS, unit: 'hari', label: 'Syarat 1 - lama arsip' }}
        countdown={readyDate && daysLeft > 0 ? { targetDate: readyDate, label: 'Syarat hari terpenuhi sekitar' } : undefined}
      />
      <div className="px-6 pb-6 -mt-2">
        <div className="mx-auto max-w-xs">
          <div className="flex items-baseline justify-between text-[11px] mb-1.5">
            <span className="text-tv-muted">Syarat 2 - sampel efektif</span>
            <span className="font-number font-semibold text-tv-text tabular-nums">
              {samples}/{MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION}
            </span>
          </div>
          <div
            className="h-2 w-full rounded-full bg-tv-hover overflow-hidden"
            role="progressbar"
            aria-valuenow={samples}
            aria-valuemin={0}
            aria-valuemax={MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION}
          >
            <div
              className="h-full rounded-full bg-gradient-accent transition-[width] duration-700 ease-settle"
              style={{ width: `${Math.min(100, (samples / MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-center text-[10px] leading-relaxed text-tv-muted">
            Sampel efektif dihitung per emiten dengan jendela tidak tumpang tindih, jadi ia
            bertambah jauh lebih lambat daripada jumlah baris mentah.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Tooltip equity curve. Bawaan Recharts hanya menampilkan dua nilai indeks
 * bersebelahan; yang menentukan bacaan halaman ini justru SELISIH keduanya -
 * apakah Top 5 sedang unggul atau tertinggal dari IHSG pada tanggal itu.
 */
function EquityCurveTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const lens = payload.find((p: any) => p.dataKey === 'lensTop5')?.value as number | undefined;
  const ihsg = payload.find((p: any) => p.dataKey === 'ihsg')?.value as number | undefined;
  const point = payload[0]?.payload as TransparencyEquityPoint | undefined;
  const gap = typeof lens === 'number' && typeof ihsg === 'number' ? lens - ihsg : null;

  return (
    <div className="rounded-lg border border-tv-border bg-tv-card/95 px-3 py-2.5 shadow-2 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-wide text-tv-muted">Tanggal sinyal {label}</div>
      <div className="mt-1.5 space-y-1">
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-tv-text">
            <span className="h-2 w-2 rounded-sm bg-tv-green" /> LensRadar Top 5
          </span>
          <span className="font-number font-semibold text-tv-text">{typeof lens === 'number' ? lens.toFixed(2) : 'belum ada'}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-tv-muted">
            <span className="h-2 w-2 rounded-sm bg-tv-muted" /> IHSG
          </span>
          <span className="font-number text-tv-muted">{typeof ihsg === 'number' ? ihsg.toFixed(2) : 'belum ada'}</span>
        </div>
      </div>
      <div className="mt-2 border-t border-tv-border pt-1.5 text-[11px] space-y-0.5">
        {gap != null && (
          <div>
            <span className="text-tv-muted">Selisih: </span>
            <span className={`font-number font-semibold ${gap >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
              {gap >= 0 ? '+' : ''}{gap.toFixed(2)} poin
            </span>
          </div>
        )}
        {point?.signals != null && (
          // Jumlah sinyal per tanggal penting dibaca bersama kurvanya: titik yang
          // dibangun dari 1-2 sinyal jauh lebih berisik daripada yang dari 5.
          <div className="text-tv-muted">{point.signals} sinyal pada tanggal ini</div>
        )}
      </div>
    </div>
  );
}

function Banner({ data }: { data: TransparencyData }) {
  const isGreen = data.banner.color === 'green';
  const isYellow = data.banner.color === 'yellow';
  const Icon = isGreen ? CheckCircle2 : isYellow ? AlertTriangle : Info;
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${
      isGreen
        ? 'border-tv-green/40 bg-tv-green/10 text-tv-green'
        : isYellow
          ? 'border-tv-yellow/40 bg-tv-yellow/10 text-tv-yellow'
          : 'border-tv-border bg-tv-card text-tv-muted'
    }`}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <div className="font-bold text-sm">{data.banner.message}</div>
        <p className="text-xs mt-1 opacity-90">
          Hari validasi: {num(data.validationDays)} • p-value 80-100 vs &lt;60: {pValue(data.pValue80VsLt60)}
        </p>
      </div>
    </div>
  );
}

export default function TransparencyClient() {
  const [data, setData] = useState<TransparencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/transparency');
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Gagal memuat data transparansi');
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError('Gagal memuat data transparansi');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
        <Skeleton className="h-56 w-full" />
        <LoadingFact />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-tv-card border border-tv-border rounded-xl">
        <EmptyState
          illustration="empty"
          title="Data transparansi gagal dimuat"
          description={error || 'Permintaan ke server tidak sampai. Ini bukan berarti validasinya kosong - datanya belum sempat diambil.'}
          action={{ label: 'Coba muat ulang', onClick: loadData }}
        />
      </div>
    );
  }

  const isCollecting = data.banner.status === 'collecting';
  const hasAnySample = data.buckets.some((b) => b.totalSamples > 0);

  return (
    <div className="space-y-6">
      <Banner data={data} />

      {/* Panel ini menggantikan pembacaan "TOTAL SAMPEL: 0" sebagai kegagalan.
          Nol memang jumlah yang benar - yang hilang selama ini adalah keterangan
          bahwa angka itu sedang menuju ambang tertentu, dan kapan sampainya. */}
      {isCollecting && <CollectingPanel data={data} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-tv-card border border-tv-border rounded-xl p-4">
          <div className="text-xs text-tv-muted uppercase">Data Sejak</div>
          <div className="font-number text-xl font-bold mt-1">
            {data.startDate || <span className="text-sm font-normal not-italic text-tv-muted">arsip belum dimulai</span>}
          </div>
        </div>
        <div className="bg-tv-card border border-tv-border rounded-xl p-4">
          <div className="text-xs text-tv-muted uppercase">As-of</div>
          <div className="font-number text-xl font-bold mt-1">{data.asOfDate}</div>
        </div>
        <div className="bg-tv-card border border-tv-border rounded-xl p-4">
          <div className="text-xs text-tv-muted uppercase">Run Stats</div>
          <div className="font-number text-xl font-bold mt-1">{data.latestStatsRunDate || 'On-demand'}</div>
        </div>
        <div className="bg-tv-card border border-tv-border rounded-xl p-4">
          <div className="text-xs text-tv-muted uppercase">Total Sampel</div>
          <div className="font-number text-xl font-bold mt-1">{data.totalSamples.toLocaleString('id-ID')}</div>
          {/* Angka telanjang "0" tidak memberi tahu apakah itu target, batas, atau
              kegagalan. Denominatornya disebutkan langsung di sebelahnya. */}
          <div className="text-[10px] text-tv-muted mt-0.5">
            dari {MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION} minimum
          </div>
        </div>
      </div>

      <section className="bg-tv-card border border-tv-border rounded-xl p-5">
        <h2 className="font-heading text-lg font-bold mb-1">Performa per Bucket LensScore</h2>
        <p className="text-xs text-tv-muted mb-4">
          Win Rate, Max DD, Avg Win/Loss ditampilkan untuk horizon T+20.
          <b>Avg T+20 Gross</b> adalah return sebelum biaya; <b>Avg T+20</b> sudah dikurangi fee 0,4% +
          slippage 0,1%, dan itulah angka yang dipakai di seluruh halaman ini.
          <b> Max DD (P95)</b> mengukur penurunan terdalam dari harga entry selama satu trade T+20 berjalan:
          hanya 5% trade yang turun lebih dalam dari angka ini. <b>Trade Terburuk</b> adalah satu trade
          paling parah yang pernah terjadi. Keduanya per trade, bukan drawdown portofolio gabungan.
        </p>
        <p className="text-xs text-tv-muted mb-4">
          Hanya sinyal yang pada tanggalnya punya nilai transaksi rata-rata 20 hari di atas
          Rp {(data.minAvgValue20dIdr / 1_000_000_000).toFixed(0)} miliar/hari yang dihitung.
          {data.illiquidRowsSkipped != null && data.illiquidRowsSkipped > 0
            ? ` ${num(data.illiquidRowsSkipped)} sinyal dibuang karena di bawah ambang itu - return dari saham yang tidak bisa dibeli dalam ukuran wajar bukan return yang bisa diklaim.`
            : ''}
        </p>
        {!hasAnySample ? (
          <EmptyState
            illustration="collecting"
            title="Belum ada satu pun sampel di keempat bucket"
            description="Tabel ini terisi setelah ada emiten yang skornya terekam dan periode T+20-nya sudah lewat. Sebelum itu, seluruh selnya memang kosong - bukan nol yang berarti 'tidak untung'."
          />
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-tv-bg text-tv-muted">
                  <tr>
                    <th className="px-4 py-3 text-left whitespace-nowrap">Bucket</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Avg T+1</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Avg T+5</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Avg T+20 Gross</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Avg T+20 Net</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Win Rate</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Total Sampel</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Max DD (P95)</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Trade Terburuk</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Avg Win</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Avg Loss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border">
                  {data.buckets.map((row) => (
                    <tr key={row.bucket} className={`hover:bg-tv-hover ${row.totalSamples === 0 ? 'opacity-55' : ''}`}>
                      <td className="px-4 py-3 font-bold">{row.bucket}</td>
                      <td className="px-4 py-3 text-right"><Cell value={row.avgT1} /></td>
                      <td className="px-4 py-3 text-right"><Cell value={row.avgT5} /></td>
                      {/* BUG FIX (2026-08-06): kelasnya dulu dihitung dari
                          `(row.avgT20 ?? 0) >= 0`, sehingga bucket TANPA data
                          (null -> 0 -> lolos >= 0) dirender HIJAU. Sel kosong
                          diwarnai seolah hasilnya positif. */}
                      <td className="px-4 py-3 text-right text-tv-muted"><Cell value={row.avgT20Gross} /></td>
                      <td className="px-4 py-3 text-right"><Cell value={row.avgT20} tone="up" className="font-bold" /></td>
                      <td className="px-4 py-3 text-right"><Cell value={row.winRateT20} /></td>
                      <td className="px-4 py-3 text-right font-number">{num(row.totalSamples)}</td>
                      <td className="px-4 py-3 text-right"><Cell value={row.maxDdP95T20} tone="fixed-red" /></td>
                      <td className="px-4 py-3 text-right text-tv-muted"><Cell value={row.worstMaeT20} tone="fixed-red" /></td>
                      <td className="px-4 py-3 text-right"><Cell value={row.avgWinT20} tone="fixed-green" /></td>
                      <td className="px-4 py-3 text-right"><Cell value={row.avgLossT20} tone="fixed-red" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tabel 9 kolom tidak terbaca di lebar ponsel tanpa gulir horizontal
                panjang; di bawah lg dipakai kartu per bucket. */}
            <div className="lg:hidden space-y-3">
              {data.buckets.map((row) => (
                <div key={row.bucket} className={`rounded-lg border border-tv-border bg-tv-bg/40 p-3 ${row.totalSamples === 0 ? 'opacity-55' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-number font-bold text-tv-text">Bucket {row.bucket}</span>
                    <span className="text-[11px] text-tv-muted font-number">{num(row.totalSamples)} sampel</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {([['T+1', row.avgT1], ['T+5', row.avgT5], ['T+20', row.avgT20]] as const).map(([label, v]) => (
                      <div key={label}>
                        <div className="text-[9px] uppercase tracking-wide text-tv-muted">Avg {label}</div>
                        <Cell value={v} tone="up" className="text-sm font-bold" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-tv-border pt-2">
                    <div>
                      <div className="text-[9px] uppercase tracking-wide text-tv-muted">Win Rate</div>
                      <Cell value={row.winRateT20} className="text-sm" />
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wide text-tv-muted">Max DD (P95)</div>
                      <Cell value={row.maxDdP95T20} tone="fixed-red" className="text-sm" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Storytelling: seluruh alasan halaman ini ada adalah satu pertanyaan -
                apakah bucket skor tinggi benar-benar berbeda dari bucket rendah?
                Tabel menyimpan jawabannya, tapi tidak pernah menyebutkannya. */}
            {(() => {
              const high = data.buckets.find((b) => b.bucket === '80-100');
              const low = data.buckets.find((b) => b.bucket === '<60');
              if (!high || !low || high.totalSamples === 0 || low.totalSamples === 0) return null;
              if (high.winRateT20 == null || low.winRateT20 == null) return null;
              const gap = high.winRateT20 - low.winRateT20;
              return (
                <div className="mt-4 rounded-lg border border-tv-border bg-tv-bg/40 px-4 py-3">
                  <p className="text-[11px] leading-relaxed text-tv-text">
                    Bucket <span className="font-number font-semibold">80-100</span> punya win rate T+20{' '}
                    <span className={`font-number font-semibold ${gap >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                      {gap >= 0 ? '+' : ''}{gap.toFixed(0)} poin persen
                    </span>{' '}
                    dibanding bucket <span className="font-number font-semibold">&lt;60</span>{' '}
                    ({high.winRateT20.toFixed(0)}% vs {low.winRateT20.toFixed(0)}%), dari{' '}
                    <span className="font-number">{high.totalSamples}</span> dan{' '}
                    <span className="font-number">{low.totalSamples}</span> sampel.
                    {' '}Selisih ini <b>belum</b> diuji out-of-sample - lihat status di banner atas sebelum menariknya sebagai kesimpulan.
                  </p>
                </div>
              );
            })()}
          </>
        )}
      </section>

      <section className="bg-tv-card border border-tv-border rounded-xl p-5">
        <h2 className="font-heading text-lg font-bold mb-1">Equity Curve: Top 5 LensRadar Hold T+20 vs IHSG</h2>
        <p className="text-xs text-tv-muted mb-4">
          Simulasi publik: setiap tanggal validasi memilih Top 5 LensRadar, masuk di open H+1,
          keluar T+20, lalu return hari sinyal dirangkai menjadi indeks kumulatif basis 100.
        </p>
        {data.equityCurve.length === 0 ? (
          <EmptyState
            illustration="collecting"
            title="Equity curve belum bisa digambar"
            description="Kurva ini butuh tanggal sinyal yang periode T+20-nya sudah lewat sepenuhnya. Selama belum ada satu pun, tidak ada titik yang bisa dirangkai - menggambar garis dari satu-dua titik akan menyesatkan."
          />
        ) : (
          <div className="h-[360px]">
            {/* stroke grid #2A2E39 dan latar tooltip #131722 berasal dari palet yang
                bahkan lebih tua dari tv-*; disamakan dengan palet Lens. */}
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.equityCurve} margin={{ top: 12, right: 18, left: -8, bottom: 6 }}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke="#1E293B" tick={{ fill: '#94A3B8', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis stroke="#1E293B" tick={{ fill: '#94A3B8', fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                {/* Garis basis 100: indeks kumulatif ini berbasis 100, jadi tanpa
                    penanda itu kurva yang seluruhnya di bawah 100 (rugi) tetap
                    terlihat "naik" karena sumbu Y menyesuaikan diri. */}
                <ReferenceLine y={100} stroke="#2B3A55" strokeDasharray="4 4" />
                <Tooltip
                  content={<EquityCurveTooltip />}
                  cursor={{ stroke: '#3B82F6', strokeWidth: 1, strokeDasharray: '3 3' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
                <Line type="monotone" dataKey="ihsg" name="IHSG" stroke="#94A3B8" strokeWidth={1.8} dot={false} connectNulls />
                <Line type="monotone" dataKey="lensTop5" name="LensRadar Top 5" stroke="#22C55E" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="bg-tv-card border border-tv-border rounded-xl p-5">
        <h2 className="font-heading text-lg font-bold mb-2">Disclaimer Audit</h2>
        <p className="text-sm text-tv-muted leading-relaxed">{data.disclaimer}</p>
      </section>
    </div>
  );
}
