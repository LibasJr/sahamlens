'use client';

import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Target, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';

interface IntrinsicValueProps {
  symbol: string;
}

export default function IntrinsicValue({ symbol }: IntrinsicValueProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/intrinsic/${symbol}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        console.error("Error fetching intrinsic data:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [symbol]);

  // Penjelasan LensAI - dipanggil terpisah setelah angka intrinsic value siap,
  // supaya kartu tetap tampil cepat walau penjelasan AI-nya lebih lambat.
  useEffect(() => {
    if (!data || data.error) return;
    let cancelled = false;
    setLoadingExplanation(true);
    fetch('/api/intrinsic-explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Hanya simbol yang dikirim (audit 2026-08-05, temuan H-12) - angka valuasinya
      // dihitung ulang di server, supaya narasi LensAI tidak pernah bisa dibangun di atas
      // angka yang dikirim dari browser.
      body: JSON.stringify({ symbol }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.explanation) setExplanation(d.explanation); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingExplanation(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (loading) {
    return (
      <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 flex justify-center items-center h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tv-accent"></div>
      </div>
    );
  }

  if (!data || data.error) {
    return null;
  }

  const { fair_value, harga, mos, methods, sektor, applied_rule = {} } = data;
  const weightedParts = Object.entries(applied_rule)
    .map(([key, weight]) => {
      const method = methods?.[key];
      const numericWeight = typeof weight === 'number' ? weight : Number(weight);
      if (!method || !Number.isFinite(method.value) || !Number.isFinite(numericWeight)) return null;
      return { key, name: method.name, value: method.value as number, weight: numericWeight };
    })
    .filter(Boolean) as Array<{ key: string; name: string; value: number; weight: number }>;
  const hasWeightedFormula = weightedParts.length > 0;
  
  // Format data for chart
  const chartData = Object.keys(methods).map(key => ({
    name: methods[key].name,
    value: methods[key].value,
    fill: methods[key].color
  }));

  const formatIDR = (val: number) => {
    if (!val) return '0';
    return Math.round(val).toLocaleString('id-ID');
  };

  // Asumsi model boleh null (mis. beta emiten tidak tersedia, ROE hilang). Nilai yang
  // tidak ada harus terbaca "—", bukan "0%" yang menyamar sebagai hasil hitungan.
  const fmtNum = (val: unknown, digits = 2) =>
    typeof val === 'number' && Number.isFinite(val) ? val.toFixed(digits) : '—';

  let mosStatus = 'FAIR';
  let mosColor = 'tv-yellow';
  // BARU (2026-08-14): dulu `#f59e0b` dikunci mati - itu nilai tema GELAP dari
  // --lens-warning (245,158,11); di tema terang seharusnya jadi #9D4808 (kontras
  // sudah diukur & lolos AA, lihat catatan besar di app/globals.css). Diganti ke
  // token tv-warning yang sudah peka-tema, konsisten dengan mosBg/mosBorder/mosText
  // untuk UNDERVALUED/OVERVALUED di bawah yang sudah memakai tv-green/tv-red.
  let mosBg = 'bg-tv-warning';
  let mosBorder = 'border-tv-warning';
  let mosText = 'text-tv-warning';
  let mosLabel = 'Harga sekitar nilai wajar model';
  let Icon = Target;

  if (mos >= 15) {
    mosStatus = 'UNDERVALUED';
    mosColor = 'tv-green';
    mosBg = 'bg-tv-green';
    mosBorder = 'border-tv-green';
    mosText = 'text-tv-green';
    mosLabel = 'Harga di bawah nilai wajar model';
    Icon = TrendingUp;
  } else if (mos <= -15) {
    mosStatus = 'OVERVALUED';
    mosColor = 'tv-red';
    mosBg = 'bg-tv-red';
    mosBorder = 'border-tv-red';
    mosText = 'text-tv-red';
    mosLabel = 'Harga di atas nilai wajar model';
    Icon = TrendingDown;
  }
  
  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1">
      <div className="flex justify-between items-center border-b border-tv-border pb-3 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-heading text-base font-bold text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-tv-accent" />
            Intrinsic Value Engine
          </h3>
        </div>
        <div className="text-xs font-sans text-tv-muted px-2 py-1 rounded bg-tv-bg border border-tv-border">
          Sector: {sektor || 'Unknown'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Value Summary */}
        <div className="col-span-1 flex flex-col justify-center space-y-4">
          <div className="bg-tv-bg border border-tv-border rounded-lg p-4 text-center relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-1 ${mosBg}`}></div>
            {/* BUG FIX (audit logika & algoritma 2026-08-05, temuan H-3/H-4): label ini
                dulu berbunyi "Estimasi Harga Wajar (Median)" - dua klaim yang keliru
                sekaligus. (1) Angkanya BUKAN median, melainkan rata-rata BERBOBOT menurut
                router sektor (median cuma dipakai di satu cabang cadangan yang jarang
                terjadi). (2) Tidak ada penanda bahwa ini keluaran MODEL dengan asumsi
                tetap (discount rate 12%, pertumbuhan perpetuitas 5%, PER wajar 15x yang
                SAMA untuk semua emiten), sehingga terbaca seperti pengukuran. */}
            <div className="text-xs text-tv-muted uppercase mb-2">Estimasi Nilai Wajar (Model)</div>
            <div className="font-number text-3xl font-bold text-white mb-1">
              Rp {formatIDR(fair_value)}
            </div>
            <div className="font-number text-sm text-tv-muted flex items-center justify-center gap-2">
              Harga saat ini: Rp {formatIDR(harga)}
            </div>
            {/* Perbaikan C-05: PBV & PER wajar tidak lagi memakai pengali tetap yang sama
                untuk semua emiten. Keduanya kini dari model Gordon dengan biaya ekuitas
                CAPM per emiten - model yang SAMA dengan komponen Valuasi LensScore, jadi
                dua angka di layar tidak lagi berasal dari dua model yang berbeda. */}
            <div className="text-[10px] text-tv-muted/80 mt-2 leading-relaxed">
              Rata-rata berbobot beberapa metode valuasi menurut sektor.
              {data?.assumptions ? (
                <>
                  {' '}PBV &amp; PER wajar dari model Gordon dengan biaya ekuitas{' '}
                  <span className="font-number">{fmtNum(data.assumptions.cost_of_equity_pct, 2)}%</span>
                  {' '}(beta <span className="font-number">{fmtNum(data.assumptions.beta_used, 2)}</span>
                  {data.assumptions.beta_source === 'sector-default' ? ', default sektor' : ''}) dan
                  pertumbuhan <span className="font-number">{fmtNum(data.assumptions.growth_pct, 2)}%</span>
                  {data.assumptions.fair_per_basis === 'no-growth'
                    ? ' — ROE tidak tersedia, PER wajar memakai perpetuitas tanpa pertumbuhan (angka bersyarat)'
                    : ''}
                  . DDM dan perpetuitas FCF masih memakai diskonto tetap{' '}
                  <span className="font-number">{data.assumptions.discount_rate_pct}%</span> untuk semua emiten.
                  Bobot antar metode per sektor belum divalidasi terhadap forward return.
                </>
              ) : null}
              {' '}Keluaran model - bukan target harga analis.
            </div>
          </div>

          <div className={`border rounded-lg p-4 text-center bg-opacity-10 ${mosBorder}/30 ${mosText}`} style={{ backgroundColor: mosStatus === 'FAIR' ? 'rgb(var(--lens-warning) / 0.1)' : undefined }}>
            <div className="flex items-center justify-center gap-2 mb-1">
              <Icon className="w-5 h-5" />
              <span className="font-bold">Margin of Safety (MOS)</span>
            </div>
            <div className="font-number text-2xl font-extrabold">
              {mos > 0 ? '+' : ''}{mos.toFixed(2)}%
            </div>
            <div className="text-xs mt-1 opacity-90 font-sans">
              <span className="font-semibold">{mosStatus === 'FAIR' ? 'HARGA SEKITAR NILAI WAJAR' : mosStatus}</span>
              <span className="block mt-0.5 opacity-80">
                {Math.abs(mos).toFixed(2)}% {mos >= 0 ? 'di bawah' : 'di atas'} nilai model · {mosLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Chart and Methods Breakdown */}
        <div className="col-span-1 lg:col-span-2 flex flex-col">
          <div className="h-[200px] w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#6B7280" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#6B7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => Number(v).toLocaleString('id-ID')} />
                {/* BARU (2026-08-14): tooltip Recharts dulu latar+teks hex mati (dark-only) -
                    kotak tooltip tetap gelap dengan teks putih walau tema terang, tidak
                    terbaca di atas kartu putih. rgb(var(--lens-*)) sudah peka-tema (bukan
                    class Tailwind - Recharts butuh style inline literal). */}
                <Tooltip
                  cursor={{ fill: 'rgb(var(--lens-hover))', opacity: 0.4 }}
                  contentStyle={{ backgroundColor: 'rgb(var(--lens-card))', borderColor: 'rgb(var(--lens-border))', color: 'rgb(var(--lens-text))', fontSize: '12px' }}
                  itemStyle={{ color: 'rgb(var(--lens-text))' }}
                  formatter={(value: any) => [`Rp ${Number(value).toLocaleString('id-ID')}`, 'Value']}
                />
                <ReferenceLine y={harga} stroke="#EF4444" strokeDasharray="3 3" label={{ position: 'top', value: 'Harga Sekarang', fill: '#EF4444', fontSize: 10 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-4 pt-4 border-t border-tv-border">
            {Object.keys(methods).map(key => (
              <div key={key} className="bg-tv-bg border border-tv-border rounded p-2 text-center">
                <div className="text-[10px] text-tv-muted uppercase truncate" title={methods[key].name}>{methods[key].name}</div>
                <div className="text-sm font-bold text-white mt-1" style={{ color: methods[key].color }}>
                  {formatIDR(methods[key].value)}
                </div>
              </div>
            ))}
          </div>
          
          {/* Active Methods (Sector Router) */}
          {data.applied_rule && Object.keys(data.applied_rule).length > 0 && (
            <div className="mt-4 pt-3 border-t border-tv-border">
              <div className="text-[10px] text-tv-muted uppercase mb-2">Metode Kalkulasi Aktif (Weighted Sector Router)</div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(data.applied_rule).map(key => (
                  <div key={key} className="px-2 py-1 rounded bg-tv-card border border-tv-border text-[10px] font-mono text-white">
                    {key.toUpperCase()} <span className="text-tv-accent ml-1">{(data.applied_rule[key] * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
              {hasWeightedFormula && (
                <details className="mt-3 rounded-lg border border-tv-border bg-tv-bg/70">
                  <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold text-tv-blue">
                    Lihat cara Rp {formatIDR(fair_value)} dihitung
                  </summary>
                  <div className="border-t border-tv-border px-3 py-3 text-[11px] leading-relaxed text-tv-muted">
                    <div className="mb-2">Nilai model adalah penjumlahan nilai tiap metode × bobot aktif setelah redistribusi metode yang tersedia.</div>
                    <div className="space-y-1 font-number">
                      {weightedParts.map((part) => (
                        <div key={part.key} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate font-sans text-tv-text">{part.name}</span>
                          <span className="shrink-0">Rp {formatIDR(part.value)} × {(part.weight * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                      <div className="mt-2 border-t border-tv-border pt-2 flex items-center justify-between font-bold text-white">
                        <span className="font-sans">Hasil model</span>
                        <span>≈ Rp {formatIDR(fair_value)}</span>
                      </div>
                    </div>
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Penjelasan LensAI - substantif tapi mudah dipahami, kenapa harga wajar
          bisa segitu (bukan cuma ulang angka). Fallback rule-based kalau Gemini
          tidak tersedia, lihat app/api/intrinsic-explain/route.ts. */}
      <div className="mt-4 pt-4 border-t border-tv-border">
        <h4 className="text-xs font-bold text-tv-text uppercase tracking-wide font-heading mb-2 flex items-center gap-1.5">
          <Target className="w-3 h-3 text-tv-accent" /> Penjelasan LensAI
        </h4>
        {loadingExplanation ? (
          <div className="text-xs text-tv-muted animate-pulse">LensAI sedang menganalisis...</div>
        ) : explanation ? (
          <p className="text-xs text-tv-text leading-relaxed">{explanation}</p>
        ) : (
          <p className="text-xs text-tv-muted">Penjelasan belum tersedia.</p>
        )}
      </div>
    </div>
  );
}
