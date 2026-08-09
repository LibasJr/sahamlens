'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  Upload,
} from 'lucide-react';

const MAX_CSV_BYTES = 2 * 1024 * 1024;

interface ImportResult {
  status: 'OK';
  mode: 'DRY_RUN' | 'INSERT_APPEND_ONLY';
  parsedRows: number;
  insertedRows: number;
  skippedExistingRows: number | null;
  tickers: number;
  brokers: number;
  minTradeDate: string | null;
  maxTradeDate: string | null;
  netBuyValue: number;
  source: string;
}

const SAMPLE = `trade_date,ticker,broker_code,buy_value,sell_value,buy_lot,sell_lot,buy_avg,sell_avg
2026-08-10,BBCA,YP,25400000000,8300000000,39500,12900,6430,6420
2026-08-10,BBCA,AK,12100000000,16800000000,18800,26100,6440,6435`;

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
  const [csvText, setCsvText] = useState('');
  const [source, setSource] = useState('STOCKBIT_MANUAL');
  const [sourceFile, setSourceFile] = useState<string | null>(null);
  const [loadingMode, setLoadingMode] = useState<'dry-run' | 'insert' | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifiedInput, setVerifiedInput] = useState<string | null>(null);

  const fingerprint = useMemo(
    () => JSON.stringify({ csvText, source, sourceFile }),
    [csvText, source, sourceFile],
  );
  const dryRunValid = verifiedInput != null && verifiedInput === fingerprint;
  const lineCount = useMemo(
    () => csvText.split(/\r?\n/).filter((line) => line.trim()).length,
    [csvText],
  );

  function invalidate() {
    setVerifiedInput(null);
    setResult(null);
    setError(null);
  }

  async function readFile(file: File | null) {
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) {
      invalidate();
      setError(`File ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 2 MB.`);
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      invalidate();
      setError('Gunakan file .CSV. XLSX sengaja tidak diterima pada fase ini.');
      return;
    }
    setSourceFile(file.name);
    setCsvText(await file.text());
    setVerifiedInput(null);
    setResult(null);
    setError(null);
  }

  async function submit(mode: 'dry-run' | 'insert') {
    setLoadingMode(mode);
    setError(null);
    try {
      const response = await fetch('/api/admin/broker-summary/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, mode, source, sourceFile }),
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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-6">
      <div>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-tv-blue" />
          <h1 className="font-heading text-xl font-bold text-white">Broker Summary Upload</h1>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tv-muted">
          Kumpulkan data broker-level harian untuk riset Broker Flow SahamLens. Data ini disimpan
          terpisah dan <strong className="text-white">belum memengaruhi LensScore atau advisory</strong>.
        </p>
      </div>

      <div className="rounded-lg border border-tv-yellow/30 bg-tv-yellow/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-tv-yellow" />
          <div className="text-sm leading-relaxed text-tv-muted">
            <strong className="text-tv-yellow">Sumber harus jujur.</strong> Untuk upload manual dari
            Stockbit gunakan <code className="text-white">STOCKBIT_MANUAL</code>. Jangan ganti menjadi
            IDX/OFFICIAL bila file bukan feed resmi berlisensi. Ini berbeda dari CMF/Yahoo OHLCV.
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <section className="rounded-xl border border-tv-border bg-tv-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Upload className="h-5 w-5 text-tv-blue" />
            <h2 className="font-heading text-lg font-bold text-white">Upload / Paste CSV</h2>
          </div>

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => readFile(e.target.files?.[0] ?? null)}
            className="block w-full rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-sm text-tv-muted file:mr-3 file:rounded file:border-0 file:bg-tv-blue file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
          />

          <textarea
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setSourceFile(null);
              invalidate();
            }}
            placeholder={SAMPLE}
            className="mt-3 h-80 w-full rounded-lg border border-tv-border bg-tv-bg p-3 font-mono text-xs text-tv-text outline-none focus:border-tv-blue"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-tv-muted">
            <span>{lineCount ? `${lineCount} baris terdeteksi termasuk header.` : 'Belum ada CSV.'}</span>
            <span>Maks. 2 MB / 50.000 row</span>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-tv-border bg-tv-card p-4">
            <label className="text-xs font-semibold text-white">Data Source</label>
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                invalidate();
              }}
              className="mt-2 w-full rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-sm text-white"
            >
              <option value="STOCKBIT_MANUAL">STOCKBIT_MANUAL</option>
              <option value="IDX_MANUAL">IDX_MANUAL</option>
              <option value="VENDOR_MANUAL">VENDOR_MANUAL</option>
            </select>
            <p className="mt-2 text-[11px] leading-relaxed text-tv-muted">
              Source menjadi bagian dari unique key sehingga sumber berbeda dapat dibandingkan tanpa
              saling menimpa.
            </p>
          </div>

          <div className="rounded-xl border border-tv-border bg-tv-card p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <FileSpreadsheet className="h-4 w-4 text-tv-blue" />
              Kolom minimum
            </div>
            <div className="mt-3 space-y-1 font-mono text-[11px] text-tv-muted">
              <div>trade_date *</div>
              <div>ticker *</div>
              <div>broker_code *</div>
              <div>buy_value</div>
              <div>sell_value</div>
              <div>buy_lot</div>
              <div>sell_lot</div>
              <div>buy_avg</div>
              <div>sell_avg</div>
            </div>
          </div>

          <button
            type="button"
            disabled={!csvText.trim() || loadingMode !== null}
            onClick={() => submit('dry-run')}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-tv-blue/40 bg-tv-blue/10 px-4 py-2.5 text-sm font-bold text-tv-blue hover:bg-tv-blue/20 disabled:opacity-50"
          >
            {loadingMode === 'dry-run'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <ShieldCheck className="h-4 w-4" />}
            Dry Run & Validate
          </button>

          <button
            type="button"
            disabled={!csvText.trim() || loadingMode !== null || !dryRunValid}
            onClick={() => {
              const summary = result
                ? `${result.parsedRows} row, ${result.tickers} ticker, ${result.brokers} broker, ${result.minTradeDate} s/d ${result.maxTradeDate}`
                : '';
              if (window.confirm(
                `Import append-only ke broker_summary_daily?\n\n${summary}\n\nData existing dengan tanggal+ticker+broker+source yang sama TIDAK ditimpa.`
              )) submit('insert');
            }}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-tv-green px-4 py-2.5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40"
          >
            {loadingMode === 'insert'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Database className="h-4 w-4" />}
            Import Broker Data
          </button>

          {!dryRunValid && csvText.trim() && loadingMode === null && (
            <p className="text-[11px] leading-relaxed text-tv-muted">
              Jalankan Dry Run dulu. Jika isi file atau source berubah, Dry Run wajib diulang.
            </p>
          )}
        </aside>
      </div>

      {error && (
        <div className="rounded-lg border border-tv-red/40 bg-tv-red/10 p-4 text-sm text-tv-red">
          {error}
        </div>
      )}

      {result && (
        <section className="rounded-xl border border-tv-border bg-tv-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-tv-green" />
            <h2 className="font-heading text-lg font-bold text-white">
              {result.mode === 'DRY_RUN' ? 'Dry Run Lolos' : 'Import Selesai'}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Parsed Rows" value={result.parsedRows} />
            <Metric label="Tickers" value={result.tickers} />
            <Metric label="Brokers" value={result.brokers} />
            <Metric label={result.mode === 'DRY_RUN' ? 'Akan Disimpan' : 'Inserted'} value={result.mode === 'DRY_RUN' ? result.parsedRows : result.insertedRows} />
            <Metric label="Skipped Existing" value={result.skippedExistingRows ?? '—'} />
            <Metric label="Tanggal Awal" value={result.minTradeDate ?? '—'} />
            <Metric label="Tanggal Akhir" value={result.maxTradeDate ?? '—'} />
            <Metric label="Net Buy Dataset" value={idr(result.netBuyValue)} />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-tv-muted">
            Unique key: <code className="font-mono text-white">(trade_date, ticker, broker_code, source)</code>.
            Data broker ini dikumpulkan untuk riset; belum otomatis menjadi Broker Accumulation Score.
          </p>
        </section>
      )}
    </div>
  );
}
