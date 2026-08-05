'use client';

import React, { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react';

type Bucket = '80-100' | '70-79' | '60-69' | '<60';

interface TransparencyBucketRow {
  bucket: Bucket;
  avgT1: number | null;
  avgT5: number | null;
  avgT20: number | null;
  winRateT20: number | null;
  totalSamples: number;
  maxDrawdownT20: number | null;
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

function pct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(digits)}%`;
}

function num(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('id-ID');
}

function pValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  if (value < 0.0001) return '<0.0001';
  return value.toFixed(4);
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
      <div className="bg-tv-card border border-tv-border rounded-xl p-10 text-center">
        <RefreshCw className="w-8 h-8 mx-auto mb-3 text-tv-accent animate-spin" />
        <p className="text-sm text-tv-muted">Memuat data validasi LensRadar...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-tv-card border border-tv-border rounded-xl p-8">
        <div className="flex items-start gap-3 text-tv-yellow">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-heading font-bold text-tv-text mb-1">Data transparansi belum tersedia</h2>
            <p className="text-sm text-tv-muted">{error || 'Silakan coba lagi nanti.'}</p>
            <button
              onClick={loadData}
              className="mt-4 px-4 py-2 rounded-lg border border-tv-border text-sm text-tv-text hover:bg-tv-hover transition-colors"
            >
              Coba Muat Ulang
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Banner data={data} />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-tv-card border border-tv-border rounded-xl p-4">
          <div className="text-xs text-tv-muted uppercase">Data Sejak</div>
          <div className="font-number text-xl font-bold mt-1">{data.startDate || '-'}</div>
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
          <div className="font-number text-xl font-bold mt-1">{num(data.totalSamples)}</div>
        </div>
      </div>

      <section className="bg-tv-card border border-tv-border rounded-xl p-5">
        <h2 className="font-heading text-lg font-bold mb-1">Performa per Bucket LensScore</h2>
        <p className="text-xs text-tv-muted mb-4">
          Return bersih setelah biaya. Win Rate, Max Drawdown, Avg Win/Loss ditampilkan untuk horizon T+20.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-tv-bg text-tv-muted">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap">Bucket</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Avg T+1</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Avg T+5</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Avg T+20</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Win Rate</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Total Sampel</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Max Drawdown</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Avg Win</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Avg Loss</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tv-border">
              {data.buckets.map((row) => (
                <tr key={row.bucket} className="hover:bg-tv-hover">
                  <td className="px-4 py-3 font-bold">{row.bucket}</td>
                  <td className="px-4 py-3 text-right font-number">{pct(row.avgT1)}</td>
                  <td className="px-4 py-3 text-right font-number">{pct(row.avgT5)}</td>
                  <td className={`px-4 py-3 text-right font-number font-bold ${(row.avgT20 ?? 0) >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                    {pct(row.avgT20)}
                  </td>
                  <td className="px-4 py-3 text-right font-number">{pct(row.winRateT20)}</td>
                  <td className="px-4 py-3 text-right font-number">{num(row.totalSamples)}</td>
                  <td className="px-4 py-3 text-right font-number text-tv-red">{pct(row.maxDrawdownT20)}</td>
                  <td className="px-4 py-3 text-right font-number text-tv-green">{pct(row.avgWinT20)}</td>
                  <td className="px-4 py-3 text-right font-number text-tv-red">{pct(row.avgLossT20)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-tv-card border border-tv-border rounded-xl p-5">
        <h2 className="font-heading text-lg font-bold mb-1">Equity Curve: Top 5 LensRadar Hold T+20 vs IHSG</h2>
        <p className="text-xs text-tv-muted mb-4">
          Simulasi publik: setiap tanggal validasi memilih Top 5 LensRadar, masuk di open H+1,
          keluar T+20, lalu return hari sinyal dirangkai menjadi indeks kumulatif basis 100.
        </p>
        {data.equityCurve.length === 0 ? (
          <div className="h-[320px] flex items-center justify-center text-sm text-tv-muted border border-dashed border-tv-border rounded-lg">
            Equity curve belum tersedia karena sampel Top 5 T+20 belum cukup.
          </div>
        ) : (
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.equityCurve} margin={{ top: 12, right: 18, left: -8, bottom: 6 }}>
                <CartesianGrid stroke="#2A2E39" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#131722', borderColor: '#2A2E39', color: '#fff', borderRadius: 12 }}
                  formatter={(value: any, name: any) => [Number(value).toFixed(2), name === 'lensTop5' ? 'LensRadar Top 5' : 'IHSG']}
                  labelFormatter={(label) => `Tanggal sinyal: ${label}`}
                />
                <Legend />
                <Line type="monotone" dataKey="lensTop5" name="LensRadar Top 5" stroke="#22c55e" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="ihsg" name="IHSG" stroke="#94a3b8" strokeWidth={2} dot={false} connectNulls />
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
