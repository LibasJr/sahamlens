'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, FileJson, Loader2, Upload, XCircle } from 'lucide-react';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 40;

type BatchStatus = 'READY' | 'DRY_RUNNING' | 'DRY_OK' | 'IMPORTING' | 'IMPORTED' | 'ERROR';

interface BatchItem {
  id: string;
  name: string;
  text: string;
  ticker: string;
  status: BatchStatus;
  error?: string;
  parsedRows?: number;
  insertedRows?: number;
  minTradeDate?: string | null;
  maxTradeDate?: string | null;
}

function guessTicker(fileName: string): string {
  const base = fileName.replace(/\.(json|txt)$/i, '').toUpperCase();
  return base.match(/^([A-Z0-9]{4,6})(?:[^A-Z0-9]|$)/)?.[1] ?? '';
}

async function postImport(item: BatchItem, mode: 'dry-run' | 'insert') {
  const response = await fetch('/api/admin/broker-summary/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'stockbit-json',
      jsonText: item.text,
      ticker: item.ticker.trim().toUpperCase(),
      mode,
      source: 'STOCKBIT_MANUAL_JSON',
      sourceFile: item.name,
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Import gagal');
  return json;
}

export default function BrokerSummaryBatchUploadClient() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);

  const importable = items.length > 0 && items.every((item) => item.status === 'DRY_OK' || item.status === 'IMPORTED');

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files).slice(0, MAX_FILES);
    const next: BatchItem[] = [];
    for (const file of selected) {
      const id = `${file.name}-${file.lastModified}-${file.size}`;
      if (file.size > MAX_FILE_BYTES) {
        next.push({ id, name: file.name, text: '', ticker: guessTicker(file.name), status: 'ERROR', error: 'File > 2 MB' });
      } else if (!/\.(json|txt)$/i.test(file.name)) {
        next.push({ id, name: file.name, text: '', ticker: '', status: 'ERROR', error: 'Harus .json/.txt' });
      } else {
        next.push({ id, name: file.name, text: await file.text(), ticker: guessTicker(file.name), status: 'READY' });
      }
    }
    setItems(next);
    if (inputRef.current) inputRef.current.value = '';
  }

  function updateTicker(id: string, ticker: string) {
    setItems((current) => current.map((item) => item.id === id ? {
      ...item,
      ticker: ticker.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      status: item.text ? 'READY' : item.status,
      error: item.text ? undefined : item.error,
      parsedRows: undefined,
      insertedRows: undefined,
      minTradeDate: undefined,
      maxTradeDate: undefined,
    } : item));
  }

  async function runAll(mode: 'dry-run' | 'insert') {
    if (running) return;
    setRunning(true);
    const working = [...items];
    for (let i = 0; i < working.length; i++) {
      const current = working[i]!;
      if (!current.text || (mode === 'insert' && current.status === 'IMPORTED')) continue;
      if (!current.ticker.trim()) {
        working[i] = { ...current, status: 'ERROR', error: 'Ticker belum diisi' };
        setItems([...working]);
        continue;
      }
      if (mode === 'insert' && current.status !== 'DRY_OK') continue;
      working[i] = { ...current, status: mode === 'dry-run' ? 'DRY_RUNNING' : 'IMPORTING', error: undefined };
      setItems([...working]);
      try {
        const result = await postImport(working[i]!, mode);
        working[i] = mode === 'dry-run'
          ? { ...working[i]!, status: 'DRY_OK', parsedRows: result.parsedRows, minTradeDate: result.minTradeDate, maxTradeDate: result.maxTradeDate }
          : { ...working[i]!, status: 'IMPORTED', insertedRows: result.insertedRows };
      } catch (error) {
        working[i] = { ...working[i]!, status: 'ERROR', error: error instanceof Error ? error.message : 'Gagal' };
      }
      setItems([...working]);
    }
    setRunning(false);
  }

  const pendingImport = items.filter((item) => item.status === 'DRY_OK').length;

  return (
    <section className="mt-8 rounded-xl border border-tv-border bg-tv-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><FileJson className="h-5 w-5 text-tv-blue" /><h2 className="font-heading text-lg font-bold text-white">Batch Stockbit JSON</h2></div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tv-muted">Browse banyak file sekaligus. Gunakan nama file seperti BBRI.txt, BBCA.txt, TLKM.json agar ticker terisi otomatis; ticker tetap bisa dikoreksi.</p>
        </div>
        <span className="text-xs text-tv-muted">Maks. {MAX_FILES} file · 2 MB/file</span>
      </div>

      <input ref={inputRef} type="file" multiple accept=".json,.txt,application/json,text/plain" onChange={(e) => onFiles(e.target.files)} className="mt-4 block w-full rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-sm text-tv-muted file:mr-3 file:rounded file:border-0 file:bg-tv-blue file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white" />

      {items.length > 0 && <>
        <div className="mt-4 overflow-x-auto rounded-lg border border-tv-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-tv-bg text-left text-[10px] uppercase tracking-wider text-tv-muted"><tr><th className="px-3 py-2">File</th><th className="px-3 py-2">Ticker</th><th className="px-3 py-2">Periode</th><th className="px-3 py-2">Rows</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.id} className="border-t border-tv-border">
              <td className="px-3 py-2 font-mono text-xs text-tv-text">{item.name}</td>
              <td className="px-3 py-2"><input value={item.ticker} disabled={running || item.status === 'IMPORTED'} onChange={(e) => updateTicker(item.id, e.target.value)} placeholder="BBRI" maxLength={12} className="w-28 rounded border border-tv-border bg-tv-bg px-2 py-1 font-mono text-xs text-white outline-none focus:border-tv-blue disabled:opacity-60" /></td>
              <td className="px-3 py-2 text-xs text-tv-muted">{item.minTradeDate && item.maxTradeDate ? `${item.minTradeDate} s/d ${item.maxTradeDate}` : '—'}</td>
              <td className="px-3 py-2 text-xs text-tv-muted">{item.parsedRows ?? '—'}</td>
              <td className="px-3 py-2"><div className="flex items-center gap-2 text-xs">{(item.status === 'DRY_RUNNING' || item.status === 'IMPORTING') && <Loader2 className="h-3.5 w-3.5 animate-spin text-tv-blue" />}{(item.status === 'DRY_OK' || item.status === 'IMPORTED') && <CheckCircle2 className="h-3.5 w-3.5 text-tv-green" />}{item.status === 'ERROR' && <XCircle className="h-3.5 w-3.5 text-tv-red" />}<span className={item.status === 'ERROR' ? 'text-tv-red' : item.status === 'IMPORTED' ? 'text-tv-green' : 'text-tv-muted'}>{item.status === 'READY' ? 'Siap Dry Run' : item.status === 'DRY_RUNNING' ? 'Dry Run…' : item.status === 'DRY_OK' ? 'Dry Run Lolos' : item.status === 'IMPORTING' ? 'Import…' : item.status === 'IMPORTED' ? `Imported (${item.insertedRows ?? 0})` : item.error || 'Error'}</span></div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={running} onClick={() => runAll('dry-run')} className="inline-flex items-center gap-2 rounded-md border border-tv-blue/40 bg-tv-blue/10 px-4 py-2.5 text-sm font-bold text-tv-blue disabled:opacity-50">{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Dry Run Semua</button>
          <button type="button" disabled={running || !importable || pendingImport === 0} onClick={() => { if (window.confirm(`Import ${pendingImport} file yang sudah lolos Dry Run?`)) runAll('insert'); }} className="rounded-md bg-tv-green px-4 py-2.5 text-sm font-bold text-black disabled:opacity-40">Import Semua ({pendingImport})</button>
          <button type="button" disabled={running} onClick={() => setItems([])} className="rounded-md border border-tv-border px-4 py-2.5 text-sm font-semibold text-tv-muted disabled:opacity-50">Bersihkan</button>
        </div>
        <p className="mt-3 text-[11px] text-tv-muted">Batch diproses berurutan agar tidak membanjiri API/database. Cookie/token Stockbit tetap tidak dibaca atau disimpan.</p>
      </>}
    </section>
  );
}
