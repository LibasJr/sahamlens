'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/ui';

// Server menolak di atas 1 MB (MAX_CSV_BYTES di fundamental-backfill-import.service.ts).
// Diperiksa juga di sisi klien supaya file besar ditolak seketika, bukan setelah
// dibaca penuh ke memori lalu dikirim dan ditolak di ujung sana.
const MAX_CSV_BYTES = 1024 * 1024;

interface ImportResult {
  status: 'OK';
  mode: 'DRY_RUN' | 'INSERT_APPEND_ONLY';
  rawRows: number;
  parsedRows: number;
  skippedEmptyRows: number;
  insertedRows: number;
  skippedExistingRows: number | null;
  tickers: number;
  minObservedDate: string | null;
  maxObservedDate: string | null;
  percentInput: 'percent' | 'decimal';
  meta?: { requestId?: string };
}

const SAMPLE = `Kode,observed_date,period_end,PER,PBV,ROE,DER,current_ratio,revenue_growth,source
BBCA,2024-10-31,2024-09-30,22.1,4.3,18.5,0.2,1.4,8.0,IDX
BBRI,2024-10-30,2024-09-30,12.4,2.1,15.2,5.8,,6.5,IDX`;

function SummaryCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-tv-border bg-tv-bg/50 p-3">
      <div className="text-[10px] uppercase tracking-wide text-tv-muted">{label}</div>
      <div className="mt-1 font-number text-lg font-bold text-tv-text">{value}</div>
    </div>
  );
}

export default function FundamentalBackfillClient() {
  const [csvText, setCsvText] = useState('');
  const [source, setSource] = useState('IDX');
  const [skipEmptyRows, setSkipEmptyRows] = useState(true);
  const [percentInput, setPercentInput] = useState<'percent' | 'decimal'>('percent');
  const [loadingMode, setLoadingMode] = useState<'dry-run' | 'insert' | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Sidik jari dari SELURUH masukan yang mengubah arti impor - bukan hanya teks CSV.
  // Dipakai untuk memastikan Dry Run yang sudah lolos benar-benar menguji kombinasi
  // yang sama dengan yang akan di-insert.
  const [verifiedInput, setVerifiedInput] = useState<string | null>(null);

  const lineCount = useMemo(() => csvText.split(/\r?\n/).filter((line) => line.trim()).length, [csvText]);
  const inputFingerprint = useMemo(
    () => JSON.stringify({ csvText, source, skipEmptyRows, percentInput }),
    [csvText, source, skipEmptyRows, percentInput]
  );

  // Insert baru boleh dijalankan setelah Dry Run atas kombinasi masukan yang PERSIS
  // sama berhasil. Sebelumnya tombol Insert aktif begitu ada teks CSV, sehingga alur
  // "Dry Run dulu" yang dijanjikan di deskripsi halaman tidak pernah ditegakkan -
  // padahal tabel tujuannya append-only dan koreksinya menuntut DELETE bertarget.
  const dryRunValid = verifiedInput !== null && verifiedInput === inputFingerprint;

  function resetVerification() {
    setResult(null);
    setError(null);
    setVerifiedInput(null);
  }

  async function readFile(file: File | null) {
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) {
      resetVerification();
      setError(`File ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 1 MB. Pecah jadi beberapa file lebih kecil.`);
      return;
    }
    setCsvText(await file.text());
    resetVerification();
  }

  async function submit(mode: 'dry-run' | 'insert') {
    setLoadingMode(mode);
    setResult(null);
    setError(null);
    // Sidik jari dibekukan sebelum request berangkat: kalau pengguna mengubah opsi
    // saat request sedang berjalan, hasil yang kembali tidak akan salah dicap sah
    // untuk masukan yang baru.
    const submittedFingerprint = inputFingerprint;
    try {
      const res = await fetch('/api/admin/fundamental-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvText,
          mode,
          skipEmptyRows,
          percentInput,
          source,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import gagal');
      setResult(data);
      setVerifiedInput(mode === 'dry-run' ? submittedFingerprint : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setVerifiedInput(null);
    } finally {
      setLoadingMode(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-tv-yellow/30 bg-tv-yellow/10 p-4 text-sm text-tv-yellow">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Import ini untuk snapshot fundamental point-in-time. Jangan pakai data hari ini untuk tanggal lampau.
            Baris kosong boleh dilewati dengan checkbox, tapi baris yang masuk harus punya minimal satu metrik.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-tv-border bg-tv-card p-5 shadow-1">
        <div className="mb-4 flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-tv-accent" />
          <h2 className="font-heading text-lg font-bold text-tv-text">Upload / Paste CSV</h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="space-y-3">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => readFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-sm text-tv-muted file:mr-3 file:rounded file:border-0 file:bg-tv-accent file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
            />
            <textarea
              value={csvText}
              onChange={(event) => {
                setCsvText(event.target.value);
                resetVerification();
              }}
              placeholder={SAMPLE}
              className="h-72 w-full rounded-lg border border-tv-border bg-tv-bg p-3 font-mono text-xs text-tv-text outline-none focus:border-tv-accent"
            />
            <div className="text-xs text-tv-muted">
              {lineCount > 0 ? `${lineCount} baris terdeteksi termasuk header.` : 'Belum ada CSV.'}
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-tv-border bg-tv-bg/40 p-4">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-tv-muted">Source default</span>
              {/* Ketiga kontrol ini mengubah ARTI angka yang masuk. Sebelumnya
                  mengubahnya tidak membatalkan hasil Dry Run yang sudah tampil -
                  admin bisa dry-run dengan "18.5 = 18.5%", lalu memindah pilihan ke
                  desimal, lalu menekan Insert, dan yang tertulis ke basis data bukan
                  angka yang barusan diverifikasi. */}
              <input
                value={source}
                onChange={(event) => { setSource(event.target.value); resetVerification(); }}
                className="w-full rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-sm text-tv-text outline-none focus:border-tv-accent"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-tv-muted">Input persen</span>
              <select
                value={percentInput}
                onChange={(event) => { setPercentInput(event.target.value as 'percent' | 'decimal'); resetVerification(); }}
                className="w-full rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-sm text-tv-text outline-none focus:border-tv-accent"
              >
                <option value="percent">18.5 berarti 18.5%</option>
                <option value="decimal">0.185 berarti 18.5%</option>
              </select>
            </label>

            <label className="flex items-start gap-2 text-sm text-tv-muted">
              <input
                type="checkbox"
                checked={skipEmptyRows}
                onChange={(event) => { setSkipEmptyRows(event.target.checked); resetVerification(); }}
                className="mt-1"
              />
              <span>Lewati baris placeholder kosong</span>
            </label>

            <button
              type="button"
              disabled={!csvText.trim() || loadingMode !== null}
              onClick={() => submit('dry-run')}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-tv-accent/40 bg-tv-accent/10 px-4 py-2 text-sm font-bold text-tv-accent transition-colors hover:bg-tv-accent/20 disabled:opacity-50"
            >
              {loadingMode === 'dry-run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Dry Run
            </button>

            <button
              type="button"
              disabled={!csvText.trim() || loadingMode !== null || !dryRunValid}
              title={!dryRunValid ? 'Jalankan Dry Run atas masukan ini dulu' : undefined}
              onClick={() => {
                const ringkas = result
                  ? `${result.parsedRows} baris dari ${result.tickers} emiten, ${result.minObservedDate} s/d ${result.maxObservedDate}`
                  : '';
                if (window.confirm(
                  `Insert append-only ke fundamental_history?\n\n${ringkas}\n\nBaris yang sudah ada TIDAK ditimpa. Koreksi setelah ini menuntut DELETE bertarget - pastikan tanggal dan sumbernya benar.`
                )) {
                  submit('insert');
                }
              }}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-tv-blue px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-tv-blueHover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loadingMode === 'insert' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Insert ke DB
            </button>

            {/* Tombol nonaktif tanpa keterangan hanya terbaca sebagai rusak. */}
            {!dryRunValid && csvText.trim() && loadingMode === null && (
              <p className="text-[11px] leading-relaxed text-tv-muted">
                {verifiedInput === null && result === null
                  ? 'Jalankan Dry Run dulu. Insert baru terbuka setelah masukan ini lolos pemeriksaan.'
                  : 'Masukan berubah setelah Dry Run terakhir - jalankan Dry Run lagi sebelum Insert.'}
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-tv-red/30 bg-tv-card">
          <EmptyState
            illustration="empty"
            title="Import ditolak"
            description={`${error} Tidak ada baris yang tertulis - validasi berjalan sebelum penulisan, jadi penolakan berarti basis data tidak tersentuh sama sekali.`}
          />
        </div>
      )}

      {result && (() => {
        const isDry = result.mode === 'DRY_RUN';
        return (
          <div className={`rounded-xl border p-5 ${isDry ? 'border-tv-border bg-tv-card' : 'border-tv-green/30 bg-tv-green/[0.04]'}`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-lg font-bold text-tv-text">
                Hasil {isDry ? 'Dry Run' : 'Insert'}
              </h2>
              {/* Dry Run dan Insert dulu memakai badge hijau "OK" yang identik - dua
                  hasil dengan konsekuensi sangat berbeda terlihat sama. */}
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${
                isDry
                  ? 'border-tv-border bg-tv-hover text-tv-muted'
                  : 'border-tv-green/30 bg-tv-green/10 text-tv-green'
              }`}>
                {isDry ? 'Simulasi - belum ditulis' : 'Tertulis ke basis data'}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard label="Raw Rows" value={result.rawRows} />
              <SummaryCard label="Diproses" value={result.parsedRows} />
              <SummaryCard label="Placeholder Dilewati" value={result.skippedEmptyRows} />
              <SummaryCard label="Ticker" value={result.tickers} />
              <SummaryCard
                label={isDry ? 'Akan Di-insert' : 'Inserted'}
                value={result.insertedRows}
              />
              <SummaryCard
                label="Sudah Ada Sebelumnya"
                value={result.skippedExistingRows ?? <span className="text-sm font-normal text-tv-muted">tidak dihitung saat dry run</span>}
              />
              <SummaryCard
                label="Start Date"
                value={result.minObservedDate ?? <span className="text-sm font-normal text-tv-muted">belum ada</span>}
              />
              <SummaryCard
                label="End Date"
                value={result.maxObservedDate ?? <span className="text-sm font-normal text-tv-muted">belum ada</span>}
              />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-tv-muted">
              Insert bersifat append-only: konflik <code className="font-mono">(ticker, observed_date)</code> dilewati, bukan di-update.
              {isDry
                ? ' Angka di atas adalah perkiraan dari hasil parsing - belum ada satu baris pun yang tertulis.'
                : ' Untuk membatalkan, hapus hanya jendela tanggal dan sumber yang spesifik - jangan DELETE tanpa filter.'}
            </p>
          </div>
        );
      })()}
    </div>
  );
}

