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
  XCircle,
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
            <h2 className='font-heading text-xl font-bold text-white'>Monitor Sinkronisasi Otomatis</h2>
          </div>
          <p className='mt-2 max-w-3xl text-sm leading-relaxed text-tv-muted'>
            Data server-only dari Index Alpha. Value, volume, dan frequency disimpan terpisah agar evidence broker tidak hilang. Data ini belum dicampur ke LensScore sampai tersedia histori PIT yang cukup untuk validasi.
          </p>
        </div>
        <a
          href='/admin/broker-summary'
          className='inline-flex items-center justify-center gap-2 rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-sm font-semibold text-tv-muted transition-colors hover:text-white'
        >
          <RefreshCw className='h-4 w-4' />
          Segarkan
        </a>
      </div>

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
              <p className='mt-1 text-xs text-tv-muted'>Subset data broker dari provider</p>
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
                  Ticker — kosongkan untuk seluruh universe
                  <input
                    id='broker-monitor-ticker'
                    name='ticker'
                    list='broker-monitor-tickers'
                    defaultValue={monitor.selectedTicker ?? ''}
                    placeholder='Contoh: BBCA'
                    maxLength={10}
                    autoComplete='off'
                    className='mt-1.5 block w-full rounded-md border border-tv-border bg-tv-card px-3 py-2 font-mono text-sm uppercase text-white outline-none placeholder:font-sans placeholder:text-tv-muted focus:border-tv-blue'
                  />
                  <datalist id='broker-monitor-tickers'>
                    {monitor.availableTickers.map((ticker) => <option key={ticker} value={ticker} />)}
                  </datalist>
                </label>

                <button type='submit' className='inline-flex items-center justify-center gap-2 rounded-md bg-tv-blue px-4 py-2 text-sm font-bold text-white hover:bg-tv-blueHover'>
                  <Search className='h-4 w-4' />
                  Tampilkan
                </button>
                <Link href='/admin/broker-summary' className='rounded-md border border-tv-border px-4 py-2 text-center text-sm font-semibold text-tv-muted hover:text-white'>
                  Reset
                </Link>
              </form>

              {invalidTicker ? <p className='mt-2 text-xs text-tv-red'>Ticker tidak valid. Gunakan kode seperti BBCA atau BBRI.</p> : null}

              {monitor.selectedTicker && monitor.coverage.rowCount === 0 ? (
                <div className='mt-4 rounded-lg border border-tv-yellow/30 bg-tv-yellow/10 p-4 text-sm text-tv-yellow'>
                  Tidak ada data {monitor.selectedTicker} pada {monitor.selectedDate}.
                </div>
              ) : (
                <>
                  <div className='mt-5 grid gap-4 lg:grid-cols-2'>
                    <div className='overflow-hidden rounded-lg border border-tv-border'>
                      <div className='border-b border-tv-border bg-tv-bg px-4 py-3 text-sm font-bold text-tv-green'>Top Net Buy</div>
                      <div className='divide-y divide-tv-border'>
                        {buyers.length > 0 ? buyers.map((row) => (
                          <div key={'buy-' + row.brokerCode} className='flex items-center justify-between gap-3 px-4 py-3 text-sm'>
                            <span className='font-mono font-bold text-white'>{row.brokerCode}</span>
                            <span className='font-number font-semibold text-tv-green'>+{compactIdr(row.netValue)}</span>
                          </div>
                        )) : <p className='px-4 py-5 text-sm text-tv-muted'>Tidak ada net buyer.</p>}
                      </div>
                    </div>

                    <div className='overflow-hidden rounded-lg border border-tv-border'>
                      <div className='border-b border-tv-border bg-tv-bg px-4 py-3 text-sm font-bold text-tv-red'>Top Net Sell</div>
                      <div className='divide-y divide-tv-border'>
                        {sellers.length > 0 ? sellers.map((row) => (
                          <div key={'sell-' + row.brokerCode} className='flex items-center justify-between gap-3 px-4 py-3 text-sm'>
                            <span className='font-mono font-bold text-white'>{row.brokerCode}</span>
                            <span className='font-number font-semibold text-tv-red'>{compactIdr(row.netValue)}</span>
                          </div>
                        )) : <p className='px-4 py-5 text-sm text-tv-muted'>Tidak ada net seller.</p>}
                      </div>
                    </div>
                  </div>

                  <div className='mt-5 overflow-x-auto rounded-lg border border-tv-border'>
                    <table className='w-full min-w-[1040px] text-sm'>
                      <thead className='bg-tv-bg text-left text-[10px] uppercase tracking-wider text-tv-muted'>
                        <tr>
                          <th className='px-4 py-3'>Broker</th>
                          <th className='px-4 py-3 text-right'>Buy</th>
                          <th className='px-4 py-3 text-right'>Sell</th>
                          <th className='px-4 py-3 text-right'>Buy Freq</th>
                          <th className='px-4 py-3 text-right'>Sell Freq</th>
                          <th className='px-4 py-3 text-right'>Buy Vol</th>
                          <th className='px-4 py-3 text-right'>Sell Vol</th>
                          <th className='px-4 py-3 text-right'>Avg Buy/Tx</th>
                          <th className='px-4 py-3 text-right'>Avg Sell/Tx</th>
                          <th className='px-4 py-3 text-right'>Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monitor.brokers.slice(0, 20).map((row) => (
                          <tr key={row.brokerCode} className='border-t border-tv-border'>
                            <td className='px-4 py-3 font-mono font-bold text-white'>{row.brokerCode}</td>
                            <td className='px-4 py-3 text-right font-number text-tv-text'>{compactIdr(row.buyValue)}</td>
                            <td className='px-4 py-3 text-right font-number text-tv-text'>{compactIdr(row.sellValue)}</td>
                            <td className='px-4 py-3 text-right font-number text-tv-muted'>{integer(row.buyFrequency)}</td>
                            <td className='px-4 py-3 text-right font-number text-tv-muted'>{integer(row.sellFrequency)}</td>
                            <td className='px-4 py-3 text-right font-number text-tv-muted'>{integer(row.buyVolume)}</td>
                            <td className='px-4 py-3 text-right font-number text-tv-muted'>{integer(row.sellVolume)}</td>
                            <td className='px-4 py-3 text-right font-number text-tv-muted'>{row.avgBuyValuePerTrade == null ? '—' : compactIdr(row.avgBuyValuePerTrade)}</td>
                            <td className='px-4 py-3 text-right font-number text-tv-muted'>{row.avgSellValuePerTrade == null ? '—' : compactIdr(row.avgSellValuePerTrade)}</td>
                            <td className={'px-4 py-3 text-right font-number font-bold ' + (row.netValue >= 0 ? 'text-tv-green' : 'text-tv-red')}>
                              {row.netValue >= 0 ? '+' : ''}{compactIdr(row.netValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

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
                  <p className='font-semibold text-tv-yellow'>Belum ada data otomatis</p>
                  <p className='mt-1 text-sm text-tv-muted'>
                    Setelah QStash menjalankan broker-summary-scan pertama kali, ringkasan akan muncul di sini.
                  </p>
                </div>
              </div>
            </div>
          )}

          {monitor.job?.status === 'SUCCESS' && monitor.dates.length > 0 ? (
            <div className='mt-4 flex items-center gap-2 text-xs text-tv-green'>
              <CheckCircle2 className='h-4 w-4' />
              Scheduler dan data otomatis sudah terdeteksi.
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
