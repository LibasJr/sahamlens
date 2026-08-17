'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  Search,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import type { BrokerSummaryMonitor } from '@/modules/broker-flow/service/broker-summary-monitor.service';

interface Props {
  monitor: BrokerSummaryMonitor | null;
  error: string | null;
  invalidTicker: boolean;
}

function compactIdr(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function integer(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value);
}

function wib(value: string | null | undefined): string {
  if (!value) return 'Belum ada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waktu tidak valid';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date) + ' WIB';
}

function jobBadge(status: string | undefined): string {
  if (status === 'SUCCESS') return 'border-tv-green/30 bg-tv-green/10 text-tv-green';
  if (status === 'FAILED') return 'border-tv-red/30 bg-tv-red/10 text-tv-red';
  return 'border-tv-yellow/30 bg-tv-yellow/10 text-tv-yellow';
}

export default function BrokerSummaryMonitorPanel({ monitor, error, invalidTicker }: Props) {
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillMsg(null);
    try {
      const res = await fetch('/api/admin/broker-summary/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = { error: text.includes('DOCTYPE') ? 'Sesi admin kedaluwarsa atau server belum selesai restart' : text.slice(0, 100) };
      }

      if (res.ok && json.success) {
        setBackfillMsg(`✓ ${json.message}`);
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        setBackfillMsg(`✗ Gagal: ${json.error || 'Terjadi kesalahan'}`);
      }
    } catch (err: any) {
      setBackfillMsg(`✗ Gagal: ${err.message}`);
    } finally {
      setBackfilling(false);
    }
  };

  const buyers = monitor
    ? [...monitor.brokers].filter((row) => row.netValue > 0).sort((a, b) => b.netValue - a.netValue).slice(0, 5)
    : [];
  const sellers = monitor
    ? [...monitor.brokers].filter((row) => row.netValue < 0).sort((a, b) => a.netValue - b.netValue).slice(0, 5)
    : [];
  const netValue = monitor ? monitor.coverage.totalBuyValue - monitor.coverage.totalSellValue : 0;

  return (
    <section className='mb-8 rounded-xl border border-tv-border bg-tv-card p-5 sm:p-6'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <div className='flex items-center gap-2'>
            <Bot className='h-5 w-5 text-tv-green' />
            <h2 className='font-heading text-xl font-bold text-white'>Monitor EOD Broker Summary & Bandarmology</h2>
          </div>
          <p className='mt-2 max-w-3xl text-sm leading-relaxed text-tv-muted'>
            Data resmi transaksi harian kode broker BEI (End-of-Day) yang otomatis diproses setiap hari bursa pukul 17:30 WIB. Value, volume, dan frequency tersimpan lengkap untuk analisis konsentrasi akumulasi dan distribusi bandar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleBackfill}
            disabled={backfilling}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-tv-purple/40 bg-tv-purple/10 px-3 py-2 text-sm font-semibold text-tv-purple transition-all hover:bg-tv-purple/20 hover:text-white disabled:opacity-50"
          >
            {backfilling ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {backfilling ? 'Mengisi Data...' : 'Isi Data Minggu Lalu'}
          </button>
          <a
            href='/admin/broker-summary'
            className='inline-flex items-center justify-center gap-2 rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-sm font-semibold text-tv-muted transition-colors hover:text-white'
          >
            <RefreshCw className='h-4 w-4' />
            Segarkan
          </a>
        </div>
      </div>

      {backfillMsg && (
        <div className={`mt-4 p-3 rounded-lg border text-xs font-semibold ${
          backfillMsg.startsWith('✓') ? 'border-tv-green/30 bg-tv-green/10 text-tv-green' : 'border-tv-red/30 bg-tv-red/10 text-tv-red'
        }`}>
          {backfillMsg}
        </div>
      )}

      {error ? (
        <div className='mt-5 rounded-lg border border-tv-red/30 bg-tv-red/10 p-4'>
          <div className='flex items-start gap-3'>
            <XCircle className='mt-0.5 h-5 w-5 shrink-0 text-tv-red' />
            <div>
              <p className='font-semibold text-tv-red'>Monitor belum dapat membaca database</p>
              <p className='mt-1 text-sm text-tv-muted'>{error}</p>
            </div>
          </div>
        </div>
      ) : monitor ? (
        <>
          <div className='mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
            <div className='rounded-lg border border-tv-border bg-tv-bg p-4'>
              <div className='flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-tv-muted'>
                <Clock3 className='h-4 w-4' /> Job terakhir
              </div>
              <div className='mt-3 flex items-center gap-2'>
                <span className={'rounded-full border px-2.5 py-1 text-xs font-bold ' + jobBadge(monitor.job?.status)}>
                  {monitor.job?.status ?? 'BELUM JALAN'}
                </span>
              </div>
              <p className='mt-2 text-xs text-tv-muted'>{wib(monitor.job?.finished_at ?? monitor.job?.started_at)}</p>
              {monitor.job?.error_message ? <p className='mt-2 text-xs text-tv-red'>{monitor.job.error_message}</p> : null}
            </div>

            <div className='rounded-lg border border-tv-border bg-tv-bg p-4'>
              <div className='flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-tv-muted'>
                <CalendarDays className='h-4 w-4' /> Data terbaru
              </div>
              <p className='mt-3 font-number text-xl font-bold text-white'>{monitor.dates[0]?.tradeDate ?? 'Belum ada'}</p>
              <p className='mt-1 text-xs text-tv-muted'>Import {wib(monitor.dates[0]?.lastImportedAt)}</p>
            </div>

            <div className='rounded-lg border border-tv-border bg-tv-bg p-4'>
              <div className='flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-tv-muted'>
                <Database className='h-4 w-4' /> Cakupan pilihan
              </div>
              <p className='mt-3 font-number text-xl font-bold text-white'>{integer(monitor.coverage.tickerCount)} emiten</p>
              <p className='mt-1 text-xs text-tv-muted'>
                {integer(monitor.coverage.brokerCount)} broker · {integer(monitor.coverage.rowCount)} baris
              </p>
            </div>

            <div className='rounded-lg border border-tv-border bg-tv-bg p-4'>
              <div className='text-xs font-bold uppercase tracking-wider text-tv-muted'>Net pilihan</div>
              <p className={'mt-3 font-number text-xl font-bold ' + (netValue >= 0 ? 'text-tv-green' : 'text-tv-red')}>
                {netValue >= 0 ? '+' : ''}{compactIdr(netValue)}
              </p>
              <p className='mt-1 text-xs text-tv-muted'>Total transaksi broker pilihan</p>
            </div>
          </div>

          {monitor.tableReady && monitor.dates.length > 0 ? (
            <>
              <form action='/admin/broker-summary' method='get' className='mt-5 grid gap-3 rounded-lg border border-tv-border bg-tv-bg p-4 md:grid-cols-[180px_1fr_auto_auto] md:items-end'>
                <label className='block text-xs font-semibold text-tv-muted' htmlFor='broker-monitor-date'>
                  Tanggal perdagangan
                  <select
                    id='broker-monitor-date'
                    name='date'
                    defaultValue={monitor.selectedDate ?? ''}
                    className='mt-1.5 block w-full rounded-md border border-tv-border bg-tv-card px-3 py-2 text-sm text-white outline-none focus:border-tv-blue'
                  >
                    {monitor.dates.map((item) => (
                      <option key={item.tradeDate} value={item.tradeDate}>{item.tradeDate}</option>
                    ))}
                  </select>
                </label>

                <label className='block text-xs font-semibold text-tv-muted' htmlFor='broker-monitor-ticker'>
                  Filter emiten (opsional)
                  <input
                    id='broker-monitor-ticker'
                    name='ticker'
                    type='text'
                    defaultValue={monitor.selectedTicker ?? ''}
                    placeholder='Contoh: BBCA, BBRI, TLKM'
                    className='mt-1.5 block w-full rounded-md border border-tv-border bg-tv-card px-3 py-2 text-sm text-white uppercase outline-none focus:border-tv-blue'
                  />
                </label>

                <button
                  type='submit'
                  className='inline-flex items-center justify-center gap-2 rounded-md bg-tv-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-tv-blue/90'
                >
                  <Search className='h-4 w-4' />
                  Terapkan
                </button>

                {monitor.selectedTicker ? (
                  <Link
                    href={`/admin/broker-summary?date=${encodeURIComponent(monitor.selectedDate ?? '')}`}
                    className='inline-flex items-center justify-center rounded-md border border-tv-border bg-tv-card px-3 py-2 text-sm font-semibold text-tv-muted transition-colors hover:text-white'
                  >
                    Reset Filter
                  </Link>
                ) : null}
              </form>

              {invalidTicker ? (
                <p className='mt-2 text-xs text-tv-yellow'>
                  Ticker yang dimasukkan tidak valid. Filter diabaikan dan menampilkan seluruh emiten pada tanggal ini.
                </p>
              ) : null}

              <div className='mt-5 grid gap-5 lg:grid-cols-2'>
                <div className='rounded-lg border border-tv-border bg-tv-bg p-4'>
                  <div className='flex items-center justify-between border-b border-tv-border pb-3'>
                    <div>
                      <h3 className='font-heading text-sm font-bold text-tv-green'>Top Buyer</h3>
                      <p className='text-xs text-tv-muted'>Broker dengan nilai net buy terbesar</p>
                    </div>
                  </div>
                  <div className='mt-3 space-y-2'>
                    {buyers.length === 0 ? (
                      <p className='py-6 text-center text-xs text-tv-muted'>Tidak ada data net buyer.</p>
                    ) : (
                      buyers.map((row) => (
                        <div key={row.brokerCode} className='flex items-center justify-between rounded-lg border border-tv-border/50 bg-tv-card/60 p-3 text-xs'>
                          <div>
                            <span className='font-mono font-bold text-white'>{row.brokerCode}</span>
                            <p className='mt-0.5 text-[11px] text-tv-muted'>
                              Beli {compactIdr(row.buyValue)} · {integer(row.buyFrequency)}x
                            </p>
                          </div>
                          <div className='text-right'>
                            <span className='font-number font-bold text-tv-green'>+{compactIdr(row.netValue)}</span>
                            {row.avgBuyValuePerTrade ? (
                              <p className='mt-0.5 text-[11px] text-tv-muted'>~{compactIdr(row.avgBuyValuePerTrade)}/trade</p>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className='rounded-lg border border-tv-border bg-tv-bg p-4'>
                  <div className='flex items-center justify-between border-b border-tv-border pb-3'>
                    <div>
                      <h3 className='font-heading text-sm font-bold text-tv-red'>Top Seller</h3>
                      <p className='text-xs text-tv-muted'>Broker dengan nilai net sell terbesar</p>
                    </div>
                  </div>
                  <div className='mt-3 space-y-2'>
                    {sellers.length === 0 ? (
                      <p className='py-6 text-center text-xs text-tv-muted'>Tidak ada data net seller.</p>
                    ) : (
                      sellers.map((row) => (
                        <div key={row.brokerCode} className='flex items-center justify-between rounded-lg border border-tv-border/50 bg-tv-card/60 p-3 text-xs'>
                          <div>
                            <span className='font-mono font-bold text-white'>{row.brokerCode}</span>
                            <p className='mt-0.5 text-[11px] text-tv-muted'>
                              Jual {compactIdr(row.sellValue)} · {integer(row.sellFrequency)}x
                            </p>
                          </div>
                          <div className='text-right'>
                            <span className='font-number font-bold text-tv-red'>{compactIdr(row.netValue)}</span>
                            {row.avgSellValuePerTrade ? (
                              <p className='mt-0.5 text-[11px] text-tv-muted'>~{compactIdr(row.avgSellValuePerTrade)}/trade</p>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className='mt-5 overflow-x-auto rounded-lg border border-tv-border'>
                <table className='w-full min-w-[560px] text-sm'>
                  <caption className='border-b border-tv-border bg-tv-bg px-4 py-3 text-left text-sm font-bold text-white'>Riwayat sinkronisasi data</caption>
                  <thead className='bg-tv-bg text-left text-[10px] uppercase tracking-wider text-tv-muted'>
                    <tr>
                      <th className='px-4 py-2'>Tanggal</th>
                      <th className='px-4 py-2 text-right'>Emiten</th>
                      <th className='px-4 py-2 text-right'>Broker</th>
                      <th className='px-4 py-2 text-right'>Baris</th>
                      <th className='px-4 py-2 text-right'>Diimpor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitor.dates.slice(0, 10).map((item) => (
                      <tr key={item.tradeDate} className='border-t border-tv-border'>
                        <td className='px-4 py-2.5 font-number text-white'>{item.tradeDate}</td>
                        <td className='px-4 py-2.5 text-right font-number text-tv-muted'>{integer(item.tickerCount)}</td>
                        <td className='px-4 py-2.5 text-right font-number text-tv-muted'>{integer(item.brokerCount)}</td>
                        <td className='px-4 py-2.5 text-right font-number text-tv-muted'>{integer(item.rowCount)}</td>
                        <td className='px-4 py-2.5 text-right text-xs text-tv-muted'>{wib(item.lastImportedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className='mt-5 rounded-lg border border-tv-yellow/30 bg-tv-yellow/10 p-4'>
              <div className='flex items-start gap-3'>
                <AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-tv-yellow' />
                <div>
                  <p className='font-semibold text-tv-yellow'>Belum ada data transaksi broker</p>
                  <p className='mt-1 text-sm text-tv-muted'>
                    Klik tombol <strong>"Isi Data Minggu Lalu"</strong> di atas atau tunggu jadwal cron bursa untuk memuat ringkasan transaksi.
                  </p>
                </div>
              </div>
            </div>
          )}

          {monitor.dates.length > 0 ? (
            <div className='mt-4 flex items-center gap-2 text-xs text-tv-green'>
              <CheckCircle2 className='h-4 w-4' />
              Data transaksi broker terverifikasi dan siap digunakan.
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
