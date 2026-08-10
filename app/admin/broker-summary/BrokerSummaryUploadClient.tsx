'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileJson,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  Upload,
} from 'lucide-react';

const MAX_BYTES = 2 * 1024 * 1024;

type InputFormat = 'stockbit-json' | 'csv';

interface PreviewRow {
  brokerCode: string;
  brokerType: string | null;
  buyValue: number;
  sellValue: number;
  netValue: number;
}

interface ImportResult {
  status: 'OK';
  mode: 'DRY_RUN' | 'INSERT_APPEND_ONLY';
  datasetKind?: 'DAILY_CSV' | 'PERIOD_JSON';
  parsedRows: number;
  insertedRows: number;
  skippedExistingRows: number | null;
  tickers: number;
  brokers: number;
  minTradeDate: string | null;
  maxTradeDate: string | null;
  netBuyValue: number;
  source: string;
  preview?: PreviewRow[];
}

const CSV_SAMPLE = `trade_date,ticker,broker_code,buy_value,sell_value,buy_lot,sell_lot,buy_avg,sell_avg
2026-08-10,BBCA,YP,25400000000,8300000000,39500,12900,6430,6420
2026-08-10,BBCA,AK,12100000000,16800000000,18800,26100,6440,6435`;

const JSON_HINT = `Paste isi tab Response dari request Broker Distribution.
Contoh struktur yang dikenali:
{
  "message": "Successfully loaded Broker Distribution data",
  "data": {
    "date_info": "2026-08-07",
    "start_date": "2026-08-01",
    "end_date": "2026-08-07",
    "by_value": {
      "top_broker_buy": [...],
      "top_broker_sell": [...]
    }
  }
}`;

function idr(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 1_000_000_000 ? 'compact' : 'standard',
  }).format(value);
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-tv-border bg-tv-bg/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-tv-muted">{label}</div>
      <div className="mt-1 text-lg font-bold text-white">{value}</div>
    </div>
  );
}

export default function BrokerSummaryUploadClient() {
  const [format, setFormat] = useState<InputFormat>('stockbit-json');
  const [text, setText] = useState('');
  const [ticker, setTicker] = useState('');
  const [source, setSource] = useState('STOCKBIT_MANUAL_JSON');
  const [sourceFile, setSourceFile] = useState<string | null>(null);
  const [loadingMode, setLoadingMode] = useState<'dry-run' | 'insert' | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifiedInput, setVerifiedInput] = useState<string | null>(null);

  const fingerprint = useMemo(
    () => JSON.stringify({ format, text, ticker: ticker.trim().toUpperCase(), source, sourceFile }),
    [format, text, ticker, source, sourceFile],
  );
  const dryRunValid = verifiedInput != null && verifiedInput === fingerprint;
  const lineCount = useMemo(() => text.split(/\r?\n/).filter((line) => line.trim()).length, [text]);
  const hasInput = text.trim().length > 0 && (format === 'csv' || ticker.trim().length > 0);

  function invalidate() {
    setVerifiedInput(null);
    setResult(null);
    setError(null);
  }

  function switchFormat(next: InputFormat) {
    setFormat(next);
    setText('');
    setSourceFile(null);
    setTicker('');
    setSource(next === 'stockbit-json' ? 'STOCKBIT_MANUAL_JSON' : 'STOCKBIT_MANUAL');
    invalidate();
  }

  async function readFile(file: File | null) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      invalidate();
      setError(`File ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 2 MB.`);
      return;
    }

    const lower = file.name.toLowerCase();
    if (format === 'csv' && !lower.endsWith('.csv')) {
      invalidate();
      setError('Mode CSV hanya menerima file .csv.');
      return;
    }
    if (format === 'stockbit-json' && !(lower.endsWith('.json') || lower.endsWith('.txt'))) {
      invalidate();
      setError('Mode Broker Distribution menerima file .json atau .txt.');
      return;
    }

    setSourceFile(file.name);
    setText(await file.text());
    if (format === 'stockbit-json' && !ticker.trim()) {
      const guessed = file.name.toUpperCase().match(/^([A-Z0-9]{4,6})/)?.[1];
      if (guessed) setTicker(guessed);
    }
    setVerifiedInput(null);
    setResult(null);
    setError(null);
  }

  async function submit(mode: 'dry-run' | 'insert') {
    setLoadingMode(mode);
    setError(null);
    try {
      const payload = format === 'stockbit-json'
        ? { format, jsonText: text, ticker: ticker.trim().toUpperCase(), mode, source, sourceFile }
        : { format, csvText: text, mode, source, sourceFile };
      const response = await fetch('/api/admin/broker-summary/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Import gagal');
      setResult(json);
      if (mode === 'dry-run') setVerifiedInput(fingerprint);
      if (mode === 'insert') setVerifiedInput(null);
    } catch (e) {
      setVerifiedInput(null);
      setError(e instanceof Error ? e.message : 'Import gagal');
    } finally {
      setLoadingMode(null);
    }
  }

  const targetTable = format === 'stockbit-json' ? 'broker_summary_period' : 'broker_summary_daily';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-6">
      <div>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-tv-blue" />
          <h1 className="font-heading text-xl font-bold text-white">Broker Summary Import</h1>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tv-muted">
          Import data broker untuk riset Broker Flow SahamLens. Jalur utama sekarang mendukung
          <strong className="text-white"> JSON Broker Distribution</strong> yang Anda salin sendiri dari
          response browser, serta CSV harian dari sumber lain. Data ini tetap terpisah dan
          <strong className="text-white"> belum memengaruhi LensScore atau advisory</strong>.
        </p>
      </div>

      <div className="rounded-lg border border-tv-yellow/30 bg-tv-yellow/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-tv-yellow" />
          <div className="text-sm leading-relaxed text-tv-muted">
            <strong className="text-tv-yellow">Tidak ada cookie/token Stockbit yang disimpan.</strong>{' '}
            Importer hanya menerima JSON yang Anda paste/upload. Label sumber tetap manual; jangan
            ditandai IDX/OFFICIAL bila bukan feed resmi berlisensi.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => switchFormat('stockbit-json')}
          className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-bold ${format === 'stockbit-json' ? 'border-tv-blue bg-tv-blue/15 text-tv-blue' : 'border-tv-border bg-tv-card text-tv-muted'}`}
        >
          <FileJson className="h-4 w-4" /> Stockbit JSON
        </button>
        <button
          type="button"
          onClick={() => switchFormat('csv')}
          className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-bold ${format === 'csv' ? 'border-tv-blue bg-tv-blue/15 text-tv-blue' : 'border-tv-border bg-tv-card text-tv-muted'}`}
        >
          <FileSpreadsheet className="h-4 w-4" /> CSV Harian
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <section className="rounded-xl border border-tv-border bg-tv-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Upload className="h-5 w-5 text-tv-blue" />
            <h2 className="font-heading text-lg font-bold text-white">
              {format === 'stockbit-json' ? 'Upload / Paste Broker Distribution JSON' : 'Upload / Paste CSV'}
            </h2>
          </div>

          {format === 'stockbit-json' && (
            <div className="mb-4">
              <label className="text-xs font-semibold text-white">Ticker *</label>
              <input
                value={ticker}
                onChange={(e) => { setTicker(e.target.value.toUpperCase()); invalidate(); }}
                placeholder="BBRI"
                maxLength={12}
                className="mt-2 w-full rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-sm font-mono text-white outline-none focus:border-tv-blue"
              />
              <p className="mt-1 text-[11px] text-tv-muted">
                Response Broker Distribution tidak membawa symbol di body, jadi ticker harus dikonfirmasi di sini.
              </p>
            </div>
          )}

          <input
            type="file"
            accept={format === 'stockbit-json' ? '.json,.txt,application/json,text/plain' : '.csv,text/csv'}
            onChange={(e) => readFile(e.target.files?.[0] ?? null)}
            className="block w-full rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-sm text-tv-muted file:mr-3 file:rounded file:border-0 file:bg-tv-blue file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
          />

          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setSourceFile(null); invalidate(); }}
            placeholder={format === 'stockbit-json' ? JSON_HINT : CSV_SAMPLE}
            className="mt-3 h-80 w-full rounded-lg border border-tv-border bg-tv-bg p-3 font-mono text-xs text-tv-text outline-none focus:border-tv-blue"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-tv-muted">
            <span>{text.trim() ? `${lineCount} baris teks terdeteksi.` : 'Belum ada data.'}</span>
            <span>Maks. 2 MB</span>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-tv-border bg-tv-card p-4">
            <label className="text-xs font-semibold text-white">Data Source</label>
            <select
              value={source}
              onChange={(e) => { setSource(e.target.value); invalidate(); }}
              className="mt-2 w-full rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-sm text-white"
            >
              {format === 'stockbit-json' && <option value="STOCKBIT_MANUAL_JSON">STOCKBIT_MANUAL_JSON</option>}
              <option value="STOCKBIT_MANUAL">STOCKBIT_MANUAL</option>
              <option value="IDX_MANUAL">IDX_MANUAL</option>
              <option value="VENDOR_MANUAL">VENDOR_MANUAL</option>
            </select>
          </div>

          <div className="rounded-xl border border-tv-border bg-tv-card p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              {format === 'stockbit-json' ? <FileJson className="h-4 w-4 text-tv-blue" /> : <FileSpreadsheet className="h-4 w-4 text-tv-blue" />}
              {format === 'stockbit-json' ? 'Yang dibaca' : 'Kolom minimum'}
            </div>
            {format === 'stockbit-json' ? (
              <div className="mt-3 space-y-1 text-[11px] text-tv-muted">
                <div>start_date / end_date</div>
                <div>date_info</div>
                <div>top_broker_buy.detail</div>
                <div>top_broker_sell.detail</div>
                <div>code / type / amount</div>
                <div className="pt-2 text-tv-yellow">distribute_to tidak dijadikan summary row.</div>
              </div>
            ) : (
              <div className="mt-3 space-y-1 font-mono text-[11px] text-tv-muted">
                <div>trade_date *</div><div>ticker *</div><div>broker_code *</div>
                <div>buy_value</div><div>sell_value</div><div>buy_lot</div>
                <div>sell_lot</div><div>buy_avg</div><div>sell_avg</div>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={!hasInput || loadingMode !== null}
            onClick={() => submit('dry-run')}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-tv-blue/40 bg-tv-blue/10 px-4 py-2.5 text-sm font-bold text-tv-blue hover:bg-tv-blue/20 disabled:opacity-50"
          >
            {loadingMode === 'dry-run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Dry Run & Preview
          </button>

          <button
            type="button"
            disabled={!hasInput || loadingMode !== null || !dryRunValid}
            onClick={() => {
              const summary = result ? `${result.brokers} broker, ${result.minTradeDate} s/d ${result.maxTradeDate}` : '';
              if (window.confirm(
                `Import append-only ke ${targetTable}?\n\n${summary}\n\nData existing dengan key periode/ticker/broker/source yang sama TIDAK ditimpa.`
              )) submit('insert');
            }}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-tv-green px-4 py-2.5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40"
          >
            {loadingMode === 'insert' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Import Broker Data
          </button>

          {!dryRunValid && hasInput && loadingMode === null && (
            <p className="text-[11px] leading-relaxed text-tv-muted">
              Jalankan Dry Run dulu. Jika JSON/CSV, ticker, atau source berubah, Dry Run wajib diulang.
            </p>
          )}
        </aside>
      </div>

      {error && <div className="rounded-lg border border-tv-red/40 bg-tv-red/10 p-4 text-sm text-tv-red">{error}</div>}

      {result && (
        <section className="rounded-xl border border-tv-border bg-tv-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-tv-green" />
            <h2 className="font-heading text-lg font-bold text-white">{result.mode === 'DRY_RUN' ? 'Dry Run Lolos' : 'Import Selesai'}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Broker Rows" value={result.parsedRows} />
            <Metric label="Tickers" value={result.tickers} />
            <Metric label="Brokers" value={result.brokers} />
            <Metric label={result.mode === 'DRY_RUN' ? 'Akan Disimpan' : 'Inserted'} value={result.mode === 'DRY_RUN' ? result.parsedRows : result.insertedRows} />
            <Metric label="Skipped Existing" value={result.skippedExistingRows ?? '—'} />
            <Metric label="Tanggal Awal" value={result.minTradeDate ?? '—'} />
            <Metric label="Tanggal Akhir" value={result.maxTradeDate ?? '—'} />
            <Metric label="Net Top-Broker Subset" value={idr(result.netBuyValue)} />
          </div>

          {result.preview && result.preview.length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-lg border border-tv-border">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="bg-tv-bg text-tv-muted">
                  <tr><th className="px-3 py-2">Broker</th><th className="px-3 py-2">Tipe</th><th className="px-3 py-2 text-right">Buy</th><th className="px-3 py-2 text-right">Sell</th><th className="px-3 py-2 text-right">Net</th></tr>
                </thead>
                <tbody>
                  {result.preview.map((row) => (
                    <tr key={row.brokerCode} className="border-t border-tv-border text-white">
                      <td className="px-3 py-2 font-bold">{row.brokerCode}</td>
                      <td className="px-3 py-2 text-tv-muted">{row.brokerType ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{idr(row.buyValue)}</td>
                      <td className="px-3 py-2 text-right">{idr(row.sellValue)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${row.netValue >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{idr(row.netValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs leading-relaxed text-tv-muted">
            {result.datasetKind === 'PERIOD_JSON'
              ? <>JSON period disimpan di <code className="font-mono text-white">broker_summary_period</code> dengan unique key <code className="font-mono text-white">(start_date, end_date, ticker, broker_code, source)</code>.</>
              : <>CSV harian disimpan di <code className="font-mono text-white">broker_summary_daily</code>.</>}
            {' '}Data ini masih untuk riset dan belum otomatis menjadi Broker Accumulation Score.
          </p>
        </section>
      )}
    </div>
  );
}
