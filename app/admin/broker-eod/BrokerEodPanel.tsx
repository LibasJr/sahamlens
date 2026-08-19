'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, Database, Layers, Receipt } from 'lucide-react';
import type { BrokerMarketDaily } from '@/modules/broker-flow/service/broker-market-daily.service';
import { Card } from '@/components/ui/Card';

interface Props {
  data: BrokerMarketDaily | null;
  error: string | null;
}

function compactIdr(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `Rp ${(value / 1_000_000_000_000).toFixed(2)} T`;
  if (abs >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(2)} M`;
  if (abs >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(2)} Jt`;
  return `Rp ${value.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
}

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

export default function BrokerEodPanel({ data, error }: Props) {
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-tv-red/40 bg-tv-red/10 p-4 text-sm text-tv-text">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-tv-red" />
        <div>
          <p className="font-bold">Gagal membaca data broker EOD.</p>
          <p className="mt-1 text-tv-muted">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (!data.tableReady) {
    return (
      <Card className="flex items-start gap-3 text-sm">
        <Database className="mt-0.5 h-5 w-5 shrink-0 text-tv-muted" />
        <div>
          <p className="font-bold text-tv-text">Tabel broker_market_daily belum ada di database ini.</p>
          <p className="mt-1 text-tv-muted">
            Jalankan migration lebih dulu: <code className="rounded bg-tv-bg px-1.5 py-0.5">npm run db:migrate</code>{' '}
            (migration <code className="rounded bg-tv-bg px-1.5 py-0.5">009_broker_market_daily.sql</code>).
          </p>
        </div>
      </Card>
    );
  }

  if (data.dates.length === 0) {
    return (
      <Card className="flex items-start gap-3 text-sm">
        <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-tv-muted" />
        <div>
          <p className="font-bold text-tv-text">Belum ada data broker EOD yang diimpor.</p>
          <p className="mt-1 text-tv-muted">
            Ambil datanya dari BEI lalu impor:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-tv-bg p-3 text-xs text-tv-muted">
{`python scripts/sync-idx-broker-summary.py
node --env-file=.env.production scripts/import-broker-market-daily.mjs --confirm`}
          </pre>
          <p className="mt-2 text-tv-muted">
            Panel ini sengaja kosong selama belum ada data resmi - tidak ada angka contoh yang ditampilkan.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Pilih tanggal bursa */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-tv-muted">Tanggal bursa</span>
        {data.dates.map((item) => {
          const active = item.tradeDate === data.selectedDate;
          return (
            <Link
              key={item.tradeDate}
              href={`/admin/broker-eod?date=${item.tradeDate}`}
              className={`rounded-lg border px-2.5 py-1 font-mono text-xs transition-colors ${
                active
                  ? 'border-tv-blue bg-tv-blue/10 text-tv-blue'
                  : 'border-tv-border bg-tv-card text-tv-muted hover:border-tv-borderLight hover:text-tv-text'
              }`}
            >
              {item.tradeDate}
              <span className="ml-1.5 text-[10px] opacity-70">{item.brokerCount}</span>
            </Link>
          );
        })}
      </div>

      {/* Cakupan hari terpilih */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-tv-muted">
            <Layers className="h-3.5 w-3.5" /> Broker tercatat
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-tv-text">{data.coverage.brokerCount}</div>
        </Card>
        <Card>
          <div className="text-[10px] font-bold uppercase tracking-wide text-tv-muted">Total nilai transaksi</div>
          <div className="mt-1 font-mono text-2xl font-bold text-tv-text">{compactIdr(data.coverage.totalValue)}</div>
        </Card>
        <Card>
          <div className="text-[10px] font-bold uppercase tracking-wide text-tv-muted">Total volume (lembar)</div>
          <div className="mt-1 font-mono text-2xl font-bold text-tv-text">{compactNumber(data.coverage.totalVolume)}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-tv-muted">
            <Receipt className="h-3.5 w-3.5" /> Total frekuensi
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-tv-text">{compactNumber(data.coverage.totalFrequency)}</div>
        </Card>
      </div>

      {/* Tabel broker */}
      <Card padding="none" className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-tv-border text-left text-[11px] uppercase tracking-wide text-tv-muted">
              <th className="px-4 py-3 font-bold">#</th>
              <th className="px-4 py-3 font-bold">Kode</th>
              <th className="px-4 py-3 font-bold">Nama Anggota Bursa</th>
              <th className="px-4 py-3 text-right font-bold">Nilai</th>
              <th className="px-4 py-3 text-right font-bold">Porsi</th>
              <th className="px-4 py-3 text-right font-bold">Volume</th>
              <th className="px-4 py-3 text-right font-bold">Frekuensi</th>
            </tr>
          </thead>
          <tbody>
            {data.brokers.map((broker, index) => (
              <tr key={broker.brokerCode} className="border-b border-tv-border/60 last:border-0 hover:bg-tv-hover">
                <td className="px-4 py-2.5 font-mono text-xs text-tv-muted">{index + 1}</td>
                <td className="px-4 py-2.5 font-mono font-bold text-tv-text">{broker.brokerCode}</td>
                <td className="px-4 py-2.5 text-tv-muted">{broker.brokerName || '-'}</td>
                <td className="px-4 py-2.5 text-right font-mono text-tv-text">{compactIdr(broker.value)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-tv-muted">
                  {broker.valueSharePct === null ? '-' : `${broker.valueSharePct}%`}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-tv-muted">{compactNumber(broker.volume)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-tv-muted">{compactNumber(broker.frequency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-xs leading-relaxed text-tv-muted">
        Sumber: API resmi BEI <code className="rounded bg-tv-card px-1.5 py-0.5">TradingSummary/GetBrokerSummary</code>.
        Angka di tabel ini adalah agregat SELURUH PASAR per kode broker - Bursa tidak memecahnya per emiten maupun per
        sisi beli/jual di endpoint ini, jadi kolom seperti &quot;net buy per saham&quot; memang tidak ada dan tidak boleh
        ditambahkan dari perhitungan karangan.
        {data.coverage.lastImportedAt ? ` Impor terakhir: ${data.coverage.lastImportedAt}.` : ''}
      </p>
    </div>
  );
}
