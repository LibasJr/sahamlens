'use client';

import Link from 'next/link';
import { Activity, Lock, Zap } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, EmptyState, LoadingFact, Skeleton, TickerAvatar } from '@/components/ui';
import { trackSignupClick } from '@/shared/analytics/product-funnel';
import { BACKTEST_LIMITATIONS } from '@/modules/backtest/constants/backtest-limitations';

const fmtRupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

function parseSignedPct(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = parseFloat(value.replace(/[^0-9.,+-]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function metricNum(value: unknown, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function metricPct(value: unknown, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)}%` : '—';
}

function toneOf(value: unknown): string {
  const n = parseSignedPct(value);
  if (n == null || n === 0) return 'text-tv-text';
  return n > 0 ? 'text-tv-green' : 'text-tv-red';
}

function EquityTooltip({ active, payload, label, initialCapital }: any) {
  if (!active || !payload?.length) return null;
  const strategy = payload.find((p: any) => p.dataKey === 'Strategy')?.value as number | undefined;
  const ihsg = payload.find((p: any) => p.dataKey === 'IHSG')?.value as number | undefined;
  const gap = typeof strategy === 'number' && typeof ihsg === 'number' ? strategy - ihsg : null;
  const growthPct = typeof strategy === 'number' && initialCapital > 0 ? ((strategy - initialCapital) / initialCapital) * 100 : null;
  return (
    <Card padding="none" radius="lg" elevation="none" highlight={false} overflow="visible" surface="95" className="border-tv-border px-3 py-2.5 shadow-2 backdrop-blur-sm">
      <div className="lens-meta uppercase tracking-wide text-tv-muted">Bulan ke-{String(label).replace('M', '')}</div>
      <div className="mt-1.5 space-y-1">
        <div className="flex items-center justify-between gap-4 text-xs"><span className="flex items-center gap-1.5 text-tv-text"><span className="h-2 w-2 rounded-sm bg-tv-green" /> Strategi</span><span className="font-number font-semibold text-tv-text">{typeof strategy === 'number' ? fmtRupiah(strategy) : 'N/A'}</span></div>
        <div className="flex items-center justify-between gap-4 text-xs"><span className="flex items-center gap-1.5 text-tv-muted"><span className="h-2 w-2 rounded-sm bg-tv-muted" /> IHSG</span><span className="font-number text-tv-muted">{typeof ihsg === 'number' ? fmtRupiah(ihsg) : 'N/A'}</span></div>
      </div>
      {gap != null && <div className="mt-2 border-t border-tv-border pt-1.5 text-[11px]"><span className="text-tv-muted">Selisih: </span><span className={`font-number font-semibold ${gap >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{gap >= 0 ? '+' : '-'}{fmtRupiah(Math.abs(gap))}</span>{growthPct != null && <span className="text-tv-muted"> · modal {growthPct >= 0 ? '+' : ''}{growthPct.toFixed(1)}%</span>}</div>}
    </Card>
  );
}

interface BacktestResultsPanelProps {
  liveLoading: boolean;
  liveError: string | null;
  liveResults: any;
  selectedFilters: string[];
  error: string | null;
  results: any;
  loading: boolean;
  runBacktest: () => void;
  dataAsOfLabel: string | null;
  chartData: any[];
  modal: number;
}

export default function BacktestResultsPanel({
  liveLoading,
  liveError,
  liveResults,
  selectedFilters,
  error,
  results,
  loading,
  runBacktest,
  dataAsOfLabel,
  chartData,
  modal,
}: BacktestResultsPanelProps) {
  return (
    <>
{/* Results Panel */}
<div className="lg:col-span-2 space-y-6">
      {/* Live Filter Check - hasil TERPISAH dari Backtest historis di bawah,
          supaya dua konsep (live vs simulasi masa lalu) tidak tercampur
          tampilannya. Muncul cuma kalau pengguna sudah klik tombolnya. */}
      {(liveLoading || liveError || liveResults) && (
        <Card padding="none" radius="lg" elevation="sm" overflow="hidden" highlight={false} className="border-tv-green/30">
          <div className="p-4 border-b border-tv-border bg-tv-green/5 flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-heading text-sm font-bold text-tv-text flex items-center gap-2">
              <Zap className="w-4 h-4 text-tv-green" /> Live Filter Check
            </h3>
            {liveResults?.matches?.[0]?.freshness && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-tv-green/10 text-tv-green border border-tv-green/30">
                {liveResults.matches[0].freshness === 'DELAYED' ? 'Data ~15-20 menit' : liveResults.matches[0].freshness === 'EOD' ? 'Data Penutupan (EOD)' : 'Data Basi'}
              </span>
            )}
          </div>
          <div className="p-4">
            {liveLoading && (
              <p className="text-sm text-tv-muted flex items-center gap-2"><Activity className="w-4 h-4 animate-spin" /> Mengecek {selectedFilters.length} filter ke seluruh universe...</p>
            )}
            {liveError && <p className="text-sm text-tv-red">{liveError}</p>}
            {liveResults && !liveLoading && (
              <>
                {liveResults.message ? (
                  <p className="text-sm text-tv-muted">{liveResults.message}</p>
                ) : (
                  <>
                    <p className="text-xs text-tv-muted mb-3">
                      {liveResults.matches.length} saham cocok kombinasi ini sekarang, dari {liveResults.filters.length} filter dipilih
                      {liveResults.skippedCount > 0 ? ` (${liveResults.skippedCount} saham gagal diambil, dilewati)` : ''}.
                      {liveResults.matches[0]?.dataTimestamp && (
                        <> Data sesi {new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(liveResults.matches[0].dataTimestamp))} WIB.</>
                      )}
                    </p>
                    <div className="lens-table-sticky-col overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-tv-border text-xs text-tv-muted uppercase font-semibold tracking-wide">
                            <th className="py-2 px-3">Saham</th>
                            <th className="py-2 px-3 text-right">Harga</th>
                            {/* Angka ini menghitung SEMUA 9 indikator yang
                                bullish, bukan hanya yang dipilih pengguna
                                (lihat bullishCount di live-filter-check.service.ts) -
                                judul lama tidak menyatakan itu, sehingga "4/9"
                                terbaca seolah 5 filter pilihan gagal. */}
                            <th className="py-2 px-3 text-right">Total 9 indikator bullish</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-tv-border text-sm">
                          {liveResults.matches.map((m: any) => (
                            <tr key={m.ticker} className="hover:bg-tv-hover/30">
                              <td className="py-2 px-3 font-bold font-number text-tv-text">
                                <span className="inline-flex items-center gap-2">
                                  <TickerAvatar symbol={m.ticker} size="sm" />
                                  {m.ticker}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-number text-tv-muted">
                                {typeof m.price === 'number' ? `Rp ${m.price.toLocaleString('id-ID')}` : 'N/A'}
                              </td>
                              <td className="py-2 px-3 text-right font-number text-tv-green">{m.bullishCount}/9</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {Boolean(liveResults.is_guest_limited && (liveResults.locked_count > 0 || liveResults.total_matches > 1)) && (
                      <div className="mt-3 p-3.5 rounded-lg border border-tv-yellow/40 bg-tv-yellow/10 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 text-tv-yellow">
                          <Lock className="w-4 h-4 shrink-0" />
                          <span>
                            <strong>{liveResults.locked_count || Math.max(0, (liveResults.total_matches || liveResults.matches.length) - 1)} saham live lainnya terkunci.</strong> Masuk untuk melihat seluruh saham yang memenuhi kriteria filter hari ini.
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            onClick={() => trackSignupClick('backtest_live_check')}
                            href="/login?next=%2Fbacktest"
                            className="rounded-md border border-tv-yellow/50 bg-tv-yellow/10 px-3 py-1.5 text-xs font-bold text-tv-yellow hover:bg-tv-yellow/20 hover:text-white transition-colors"
                          >
                            Masuk
                          </Link>
                          <Link
                            onClick={() => trackSignupClick('backtest_live_check')}
                            href="/signup?next=%2Fbacktest"
                            className="rounded-md bg-tv-blue px-3 py-1.5 text-xs font-bold text-white hover:bg-tv-blueHover transition-colors shadow-sm"
                          >
                            Daftar Gratis
                          </Link>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </Card>
      )}

      {error && (
        <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-red/30">
          <EmptyState
            illustration="empty"
            title="Backtest gagal dijalankan"
            description={error}
            action={{ label: 'Coba lagi', onClick: runBacktest }}
          />
        </Card>
      )}

      {!results && !loading && !error && (
        <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border min-h-[500px] flex items-center justify-center">
          <EmptyState
            illustration="search"
            title="Belum ada simulasi dijalankan"
            description={`${selectedFilters.length} filter terpilih. Setiap filter harus BULLISH bersamaan agar sebuah sinyal dihitung - makin banyak filter, makin sedikit sinyal yang muncul, dan makin kecil sampel hasilnya.`}
            action={{ label: 'Backtest Sekarang', onClick: runBacktest }}
          />
        </Card>
      )}

      {loading && (
        <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border min-h-[500px] p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
          <Skeleton className="h-64 w-full" />
          <LoadingFact />
        </Card>
      )}

      {results && !loading && (
        <>
          {dataAsOfLabel && (
            <p className="text-[11px] text-tv-muted">Data per {dataAsOfLabel} (diperbarui otomatis tiap hari, bukan real-time).</p>
          )}
          {results.message && (
            <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-yellow/30 p-4 text-sm text-tv-yellow">
              {results.message}
            </Card>
          )}
          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4">
              <div className="text-xs text-tv-muted mb-1">Return Strategi</div>
              <div className={`text-xl font-bold font-number ${toneOf(results.return)}`}>{results.return}</div>
            </Card>
            <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4">
              <div className="text-xs text-tv-muted mb-1">Alpha vs IHSG ({results.ihsgReturn})</div>
              <div className={`text-xl font-bold font-number ${toneOf(results.alpha)}`}>{results.alpha}</div>
            </Card>
            <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4">
              <div className="text-xs text-tv-muted mb-1">Win Rate ({results.totalTrades} trades)</div>
              <div className="text-xl font-bold font-number text-tv-text">{results.winRate}</div>
            </Card>
            <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4">
              <div className="text-xs text-tv-muted mb-1">Max Drawdown</div>
              <div className="text-xl font-bold font-number text-tv-red">{results.maxDD}</div>
            </Card>
          </div>

          {/* Penyusutan universe. Penyaring "histori harus menutupi seluruh
              jendela" membuang emiten yang belum listing selama periode itu -
              dan porsinya naik seiring panjang periode. Pada 60 bulan, SEMUA
              emiten yang IPO dalam lima tahun terakhir hilang, dan justru
              merekalah yang paling mungkin berkinerja ekstrem ke dua arah.
              Sebelum blok ini ada, penyusutan itu terjadi tanpa satu angka pun
              di layar. */}
          {results.universe && results.universe.excludedShortHistory > 0 && (
            <div className="rounded-lg border border-tv-yellow/40 bg-tv-yellow/10 p-3 text-xs text-tv-yellow">
              <div className="font-semibold">
                Universe menyusut: {results.universe.eligible} dari {results.universe.inCache} emiten
              </div>
              <div className="mt-1 opacity-90 leading-relaxed">
                {results.universe.excludedShortHistory} emiten dibuang karena historinya tidak
                menutupi seluruh {results.universe.requiredTradingDays} hari bursa periode ini —
                termasuk semua yang IPO setelah periode dimulai. Makin panjang periodenya, makin
                banyak yang gugur, dan yang tersisa adalah emiten yang bertahan dan tetap likuid
                selama itu. Hasil di bawah adalah hasil dari kelompok penyintas itu, bukan dari
                pasar apa adanya.
              </div>
            </div>
          )}

          {/* RISIKO (temuan H-05 audit kuantitatif). Empat angka di atas diam soal
              satu hal: berapa risiko yang ditanggung untuk mendapatkannya. Return
              40% dengan volatilitas 15% dan return 40% dengan volatilitas 60%
              tampil identik sebelum baris ini ada. Angka yang belum bisa dihitung
              dirender sebagai "—", bukan 0. */}
          {results.performance && (
            <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
                <div className="text-sm font-semibold text-tv-text">Risiko &amp; kualitas hasil</div>
                <div className="text-[11px] text-tv-muted">
                  Sharpe/Sortino memakai risk-free {results.performance.riskFreeRatePct}%
                  (asumsi statis, ditinjau {results.performance.riskFreeSetOn})
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'CAGR', value: metricPct(results.performance.cagrPct), hint: 'return disetahunkan' },
                  { label: 'Volatilitas', value: metricPct(results.performance.annualizedVolatilityPct), hint: 'disetahunkan' },
                  { label: 'Sharpe', value: metricNum(results.performance.sharpe), hint: 'per unit volatilitas total' },
                  { label: 'Sortino', value: metricNum(results.performance.sortino), hint: 'per unit risiko sisi bawah' },
                  { label: 'Profit Factor', value: metricNum(results.performance.profitFactor), hint: 'laba kotor / rugi kotor' },
                  { label: 'Expectancy', value: metricPct(results.performance.expectancyPct), hint: 'rata-rata per trade' },
                  { label: 'Turnover', value: results.performance.turnoverAnnualX == null ? '—' : `${results.performance.turnoverAnnualX.toFixed(2)}x`, hint: 'putaran portofolio / tahun' },
                  { label: 'Trade / tahun', value: metricNum(results.performance.tradesPerYear), hint: `${results.performance.returnObservations} hari bursa` },
                ].map((metric) => (
                  <div key={metric.label} className="bg-tv-bg border border-tv-border rounded-lg p-3">
                    <div className="text-[11px] text-tv-muted">{metric.label}</div>
                    <div className="text-lg font-bold font-number text-tv-text mt-0.5">{metric.value}</div>
                    <div className="text-[10px] text-tv-muted mt-0.5">{metric.hint}</div>
                  </div>
                ))}
              </div>
              {results.performance.note && (
                <p className="text-[11px] leading-relaxed text-tv-yellow mt-3">{results.performance.note}</p>
              )}
            </Card>
          )}

          {/* SIGNIFIKANSI STATISTIK (2026-08-22). Empat angka di kartu "Risiko & kualitas
              hasil" di atas adalah titik tunggal - tidak membedakan strategi yang benar
              punya edge dari strategi yang cuma kebetulan beruntung pada N trade kecil.
              Kartu ini menjawab itu lewat block bootstrap CI95 + permutation test per
              blok minggu kalender (lihat modules/backtest/service/backtest-significance.service.ts) -
              pola yang sama dipakai LensRadar/TP-CL Lab, ditulis ulang khusus untuk
              daftar trade tunggal (bukan spread bucket skor). */}
          {results.significance && (
            <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
                <div className="text-sm font-semibold text-tv-text">Signifikansi statistik</div>
                {results.significance.bootstrap.status !== 'INSUFFICIENT_DATA' && (
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${
                    results.significance.bootstrap.status === 'SUPPORTIVE'
                      ? 'bg-tv-green/10 text-tv-green border-tv-green/30'
                      : results.significance.bootstrap.status === 'NEGATIVE'
                        ? 'bg-tv-red/10 text-tv-red border-tv-red/30'
                        : 'bg-tv-yellow/10 text-tv-yellow border-tv-yellow/30'
                  }`}>
                    {results.significance.bootstrap.status === 'SUPPORTIVE'
                      ? 'Beda signifikan dari nol'
                      : results.significance.bootstrap.status === 'NEGATIVE'
                        ? 'Signifikan NEGATIF'
                        : 'Tidak bisa dibedakan dari kebetulan'}
                  </span>
                )}
              </div>

              {results.significance.bootstrap.status === 'INSUFFICIENT_DATA' ? (
                <p className="text-[11px] leading-relaxed text-tv-muted">{results.significance.note}</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Rata-rata / trade', value: metricPct(results.significance.meanPnlPct, 2), hint: `${results.significance.totalTrades} trade, ${results.significance.weekBlocks} blok minggu` },
                      {
                        label: 'CI 95%',
                        value: results.significance.bootstrap.ci95Low == null || results.significance.bootstrap.ci95High == null
                          ? '—'
                          : `${metricPct(results.significance.bootstrap.ci95Low, 1)} .. ${metricPct(results.significance.bootstrap.ci95High, 1)}`,
                        hint: 'block bootstrap per-minggu',
                      },
                      { label: 'p-value', value: results.significance.permutation.pValueOneTailed == null ? '—' : results.significance.permutation.pValueOneTailed.toFixed(4), hint: 'permutation test, 1 arah' },
                      { label: 'Iterasi', value: String(results.significance.permutation.iterations || 0), hint: 'resample per uji' },
                    ].map((metric) => (
                      <div key={metric.label} className="bg-tv-bg border border-tv-border rounded-lg p-3">
                        <div className="text-[11px] text-tv-muted">{metric.label}</div>
                        <div className="text-lg font-bold font-number text-tv-text mt-0.5">{metric.value}</div>
                        <div className="text-[10px] text-tv-muted mt-0.5">{metric.hint}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-tv-muted mt-3">{results.significance.note}</p>
                </>
              )}
            </Card>
          )}

          {/* Storytelling: empat angka di atas dibaca sendiri-sendiri tidak
              memberi tahu apakah strategi ini layak. Yang menentukan adalah
              hubungan antar angka - terutama alpha terhadap drawdown. Soal
              "jumlah trade cukup atau tidak" sudah dijawab lebih presisi oleh
              kartu Signifikansi Statistik di atas (CI/p-value), jadi tidak
              diulang di sini sebagai heuristik terpisah. */}
          {(() => {
            const alpha = parseSignedPct(results.alpha);
            const dd = Math.abs(parseSignedPct(results.maxDD) ?? 0);
            const notes: string[] = [];

            if (alpha != null && alpha > 0 && dd > 0) {
              notes.push(`Strategi unggul ${alpha.toFixed(1)} poin persen dari IHSG, dengan penurunan terdalam ${dd.toFixed(1)}%. Artinya untuk mengejar keunggulan itu, kamu harus sanggup menahan modal turun ${dd.toFixed(1)}% di tengah jalan tanpa menjual.`);
            } else if (alpha != null && alpha <= 0) {
              notes.push(`Strategi ini TIDAK mengalahkan IHSG pada periode tersebut. Membeli indeks langsung akan memberi hasil serupa atau lebih baik, dengan usaha jauh lebih sedikit.`);
            }
            if (notes.length === 0) return null;

            return (
              <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4 space-y-2">
                {notes.map((n, i) => (
                  <p key={i} className="text-[11px] leading-relaxed text-tv-muted">{n}</p>
                ))}
              </Card>
            );
          })()}

          {/* Chart */}
          <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-5">
            <h3 className="font-heading text-sm font-bold text-tv-text mb-4">Equity Curve</h3>
            <div className="h-64">
              {/* Seluruh warna di chart ini masih hex palet LAMA: #10B981
                  (hijau lama), #8B94B6 (muted lama), #2C3A5A (border lama),
                  #152238 (card lama), #F3F4F6 (teks lama). Disamakan dengan
                  palet Lens yang berlaku. */}
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorStrategy" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.32}/>
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorIHSG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94A3B8" stopOpacity={0.22}/>
                      <stop offset="95%" stopColor="#94A3B8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke="#1E293B" tick={{ fill: '#94A3B8', fontSize: 10 }} tickLine={false} />
                  <YAxis
                    stroke="#1E293B"
                    tick={{ fill: '#94A3B8', fontSize: 10 }}
                    tickLine={false}
                    domain={['auto', 'auto']}
                    width={52}
                    tickFormatter={(val) => `${(val / 1_000_000).toFixed(0)}jt`}
                  />
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  {/* Garis modal awal: tanpa ini, kurva yang seluruhnya di bawah
                      modal awal tetap terlihat "naik" karena sumbu Y otomatis. */}
                  <ReferenceLine
                    y={modal}
                    stroke="#2B3A55"
                    strokeDasharray="4 4"
                    label={{ value: 'Modal awal', position: 'insideTopLeft', fill: '#94A3B8', fontSize: 9 }}
                  />
                  <Tooltip
                    content={<EquityTooltip initialCapital={modal} />}
                    cursor={{ stroke: '#3B82F6', strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                  <Area type="monotone" dataKey="IHSG" stroke="#94A3B8" strokeWidth={1.5} fillOpacity={1} fill="url(#colorIHSG)" />
                  <Area type="monotone" dataKey="Strategy" stroke="#22C55E" strokeWidth={2} fillOpacity={1} fill="url(#colorStrategy)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-4 mt-4 text-xs">
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-tv-green rounded-sm"></div> Strategy</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-tv-muted rounded-sm"></div> IHSG</div>
            </div>
          </Card>

          {/* Trades */}
          <Card padding="none" radius="lg" elevation="sm" overflow="hidden" highlight={false} className="border-tv-border">
            <div className="p-4 border-b border-tv-border bg-tv-bg/40">
              <h3 className="font-heading text-sm font-bold text-tv-text">
                Riwayat Trade {results.totalTrades > 30 ? `(30 terbaru dari ${results.totalTrades})` : ''}
              </h3>
            </div>
            <div className="lens-table-sticky-col overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-tv-card border-b border-tv-border text-xs text-tv-muted uppercase font-semibold tracking-wide">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Symbol</th>
                  <th className="py-3 px-4">Buy Px</th>
                  <th className="py-3 px-4 text-right">PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border text-sm">
                {results.trades.map((t: any, idx: number) => (
                  <tr key={idx} className="hover:bg-tv-hover/30">
                    <td className="py-3 px-4 text-tv-muted">{t.date}</td>
                    <td className="py-3 px-4 text-tv-text font-bold font-number">
                      <span className="inline-flex items-center gap-2">
                        <TickerAvatar symbol={t.symbol} size="sm" />
                        {t.symbol}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-tv-muted font-number">Rp {t.buy}</td>
                    <td className={`py-3 px-4 text-right font-bold font-number ${toneOf(t.pnl)}`}>
                      {t.pnl}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {Boolean(results.is_guest_limited && (results.trades_locked_count > 0 || results.totalTrades > 2)) && (
              <div className="p-4 border-t border-tv-border bg-tv-yellow/5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-tv-yellow">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>{results.trades_locked_count || Math.max(0, results.totalTrades - 2)} riwayat transaksi saham lainnya terkunci.</strong> Masuk untuk melihat seluruh riwayat trade, tanggal entry/exit, dan profit per saham.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    onClick={() => trackSignupClick('backtest_trades')}
                    href="/login?next=%2Fbacktest"
                    className="rounded-md border border-tv-yellow/50 bg-tv-yellow/10 px-3 py-1.5 text-xs font-bold text-tv-yellow hover:bg-tv-yellow/20 hover:text-white transition-colors"
                  >
                    Masuk
                  </Link>
                  <Link
                    onClick={() => trackSignupClick('backtest_trades')}
                    href="/signup?next=%2Fbacktest"
                    className="rounded-md bg-tv-blue px-3 py-1.5 text-xs font-bold text-white hover:bg-tv-blueHover transition-colors shadow-sm"
                  >
                    Daftar Gratis
                  </Link>
                </div>
              </div>
            )}
          </Card>

          {/* Batasan simulasi (audit 2026-08-05, temuan M-12) - dua bias yang
              membuat hasil di atas sistematis lebih baik dari kenyataan HARUS
              terbaca bersama angkanya, bukan cuma tercatat di komentar kode. */}
          <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-yellow/30 p-4">
            <h3 className="font-heading text-sm font-bold text-tv-yellow mb-2">Batasan simulasi ini</h3>
            <ul className="text-[11px] text-tv-muted leading-relaxed list-disc pl-4 space-y-1">
              {BACKTEST_LIMITATIONS.map((l) => <li key={l}>{l}</li>)}
              <li>Hasil masa lalu bukan jaminan hasil di masa depan.</li>
            </ul>
          </Card>
        </>
      )}

</div>
    </>
  );
}
