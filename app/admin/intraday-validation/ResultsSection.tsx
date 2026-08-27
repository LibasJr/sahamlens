'use client';

import { Sliders } from 'lucide-react';
import {
  ActionButton,
  ConcentrationTable,
  HorizonTabs,
  Metric,
  NA,
  SampleTag,
  Scroller,
  SliceTable,
  StatusBadge,
  Td,
  Th,
  ValidationCard,
  Warnings as WarningsList,
  bps,
  int,
  num,
  pct,
} from './shared-ui';
import type { ActionName, ValidationResult } from './types';

/**
 * Semua kartu hasil validasi (horizon, bucket, time-of-day/likuiditas,
 * konsentrasi, regime, kalibrasi, kelayakan eksekusi, komponen skor, biaya,
 * walk-forward). Ditampilkan HANYA ketika sudah ada `result` - pemanggil
 * (komponen utama) yang memutuskan itu.
 */
export function ResultsSection({ result, horizon, setHorizon }: { result: ValidationResult; horizon: string; setHorizon: (h: string) => void }) {
  const horizons = result.horizons ?? [];
  return (
    <>
      {/* 3. PERFORMANCE PER HORIZON */}
      <ValidationCard
        title="Performa per Horizon"
        subtitle="Setiap horizon punya statistik sendiri. Angka utama adalah NET return setelah fee beli, fee jual, dan slippage dua sisi."
      >
        <Scroller>
          <table className="w-full text-xs">
            <thead className="text-tv-muted">
              <tr>
                <Th>Horizon</Th>
                <Th>N raw</Th>
                <Th>N efektif</Th>
                <Th>Win rate</Th>
                <Th>Avg net</Th>
                <Th>Median net</Th>
                <Th>Expectancy</Th>
                <Th>Avg win</Th>
                <Th>Avg loss</Th>
                <Th>Payoff</Th>
                <Th>Profit factor</Th>
                <Th>Max DD ekuitas harian</Th>
                <Th>Max DD rentetan</Th>
                <Th>MFE</Th>
                <Th>MAE</Th>
                <Th>No fill</Th>
                <Th>Kena SL</Th>
                <Th>Kena TP</Th>
                <Th>CI 95%</Th>
                <Th>p-value</Th>
                <Th>q-value (Holm)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tv-border">
              {horizons.map((h: any) => {
                const corrected = result.multipleTesting?.find((t: any) => t.label?.startsWith(h.horizon));
                return (
                  <tr key={h.horizon} className="align-top">
                    <Td>
                      <span className="font-semibold text-tv-text">{h.label}</span>
                      <SampleTag status={h.status} />
                    </Td>
                    <Td>{int(h.samplesRaw)}</Td>
                    <Td>{int(h.samplesEffective)}</Td>
                    <Td>{pct(h.performance?.winRate)}</Td>
                    <Td>{pct(h.performance?.avgNetReturn, 3)}</Td>
                    <Td>{pct(h.performance?.medianNetReturn, 3)}</Td>
                    <Td>{bps(h.performance?.avgNetReturn)}</Td>
                    <Td>{pct(h.performance?.avgWin, 3)}</Td>
                    <Td>{pct(h.performance?.avgLoss, 3)}</Td>
                    <Td>{num(h.performance?.payoffRatio)}</Td>
                    <Td>{num(h.performance?.profitFactor)}</Td>
                    <Td>{pct(h.performance?.maxDrawdownDailyEquity, 2)}</Td>
                    <Td>{pct(h.performance?.maxDrawdown, 2)}</Td>
                    <Td>{pct(h.avgMfe, 3)}</Td>
                    <Td>{pct(h.avgMae, 3)}</Td>
                    <Td>{pct(h.noFillPct)}</Td>
                    <Td>{pct(h.stopLossPct)}</Td>
                    <Td>{pct(h.takeProfitPct)}</Td>
                    <Td>
                      {h.bootstrap?.ci95Low == null ? NA : `${(h.bootstrap.ci95Low * 100).toFixed(3)}% .. ${(h.bootstrap.ci95High * 100).toFixed(3)}%`}
                    </Td>
                    <Td>{num(h.permutation?.pValueOneTailed, 4)}</Td>
                    <Td>
                      {corrected?.holm == null ? NA : (
                        <span className={corrected.significantAfterCorrection ? 'text-tv-green' : 'text-tv-text'}>
                          {corrected.holm.toFixed(4)}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Scroller>

        <p className="mt-3 text-[11px] text-tv-muted">
          <strong className="text-tv-text">Max DD ekuitas harian</strong>: satu unit modal dibagi rata ke seluruh
          sinyal pada hari yang sama, flat semalam, dimajemukkan antar hari - ini angka drawdown yang bisa dibaca
          sebagai portofolio. <strong className="text-tv-text">Max DD rentetan</strong> adalah jumlah kumulatif
          aditif atas sinyal yang tumpang tindih; ia mengukur rentetan kerugian, BUKAN kinerja akun.
        </p>

        <div className="mt-4 space-y-3">
          {horizons.map((h: any) =>
            h.warnings?.length ? (
              <div key={h.horizon}>
                <p className="text-xs font-semibold text-tv-muted mb-1">{h.label}</p>
                <WarningsList items={h.warnings} />
              </div>
            ) : null
          )}
        </div>
      </ValidationCard>

      {/* 4. BUCKET */}
      <ValidationCard
        title="Performa per Bucket Skor"
        subtitle="Bucket dengan sampel kecil tetap ditampilkan dan dilabeli, tidak disembunyikan."
      >
        <HorizonTabs horizon={horizon} setHorizon={setHorizon} available={Object.keys(result.buckets ?? {})} />
        <Scroller>
          <table className="w-full text-xs">
            <thead className="text-tv-muted">
              <tr>
                <Th>Bucket</Th>
                <Th>N raw</Th>
                <Th>N efektif</Th>
                <Th>Win rate</Th>
                <Th>Avg net</Th>
                <Th>Median net</Th>
                <Th>Profit factor</Th>
                <Th>CI 95%</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tv-border">
              {(result.buckets?.[horizon] ?? []).map((b: any) => (
                <tr key={b.bucket}>
                  <Td>
                    {b.bucket}
                    <SampleTag status={b.status} />
                  </Td>
                  <Td>{int(b.samplesRaw)}</Td>
                  <Td>{int(b.samplesEffective)}</Td>
                  <Td>{pct(b.winRate)}</Td>
                  <Td>{pct(b.avgNetReturn, 3)}</Td>
                  <Td>{pct(b.medianNetReturn, 3)}</Td>
                  <Td>{num(b.profitFactor)}</Td>
                  <Td>{b.ci95Low == null ? NA : `${(b.ci95Low * 100).toFixed(3)}% .. ${(b.ci95High * 100).toFixed(3)}%`}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
        <p className="mt-3 text-xs text-tv-muted">
          Monotonicity {horizon}: rho ={' '}
          <span className="font-number text-tv-text">{num(result.monotonicity?.[horizon]?.rho, 3)}</span>{' '}
          ({result.monotonicity?.[horizon]?.monotonic ? 'skor tinggi cenderung lebih baik' : 'belum menunjukkan urutan yang konsisten'}),
          dihitung atas {int(result.monotonicity?.[horizon]?.bucketsCompared)} bucket.
        </p>
      </ValidationCard>

      {/* 5 & 6. TIME OF DAY + LIKUIDITAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-6">
        <ValidationCard title="Analisis Waktu Sinyal" subtitle="Grid sinyal mengikuti sesi bursa aktif. Pemilihan jam terbaik untuk produksi TIDAK boleh memakai tabel ini.">
          <SliceTable rows={result.timeOfDay?.[horizon] ?? []} keyLabel="Jam WIB" />
        </ValidationCard>
        <ValidationCard title="Analisis Likuiditas" subtitle="Dikelompokkan dari nilai transaksi sesi berjalan sampai signal_timestamp.">
          <SliceTable rows={result.liquidity?.[horizon] ?? []} keyLabel="Kelompok" />
        </ValidationCard>
      </div>

      {/* 7. KONSENTRASI */}
      <ValidationCard title="Konsentrasi Ticker dan Sektor" subtitle={`Horizon utama ${result.horizons?.[1]?.horizon ?? 'H30'}. Sektor dibaca dari arsip point-in-time fundamental_history (hanya dibaca).`}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ConcentrationTable title="Per ticker" data={result.concentration?.ticker} />
          <ConcentrationTable title="Per sektor" data={result.concentration?.sector} />
        </div>
      </ValidationCard>

      {/* 8. REGIME */}
      <ValidationCard title="Kondisi Pasar (Regime)" subtitle={result.regime?.definition}>
        {result.regime?.available ? (
          <SliceTable rows={result.regime.rows} keyLabel="Regime" />
        ) : (
          <p className="text-sm text-tv-muted">
            Regime tidak tersedia untuk jendela ini. Hasil TIDAK dipecah per regime, dan tidak ada klaim bahwa
            model stabil lintas kondisi pasar.
          </p>
        )}
      </ValidationCard>

      {/* 9. KALIBRASI */}
      <ValidationCard
        title="Kalibrasi Skor"
        subtitle="Menguji apakah skor LensIntraday boleh dibaca sebagai probabilitas. Isotonic di-fit HANYA di TRAIN dan diuji di TEST."
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Metric label="Sampel" value={int(result.calibration?.samples)} />
          <Metric label="Base rate" value={pct(result.calibration?.naive?.baseRate)} />
          <Metric label="ECE" value={num(result.calibration?.naive?.ece, 4)} />
          <Metric label="Brier" value={num(result.calibration?.naive?.brier, 4)} />
          <Metric label="Brier base rate" value={num(result.calibration?.naive?.brierBaseRate, 4)} />
          <Metric label="Brier skill score" value={num(result.calibration?.naive?.brierSkillScore, 4)} />
          <Metric label="Split TRAIN/TEST" value={result.calibration?.splitDate ?? NA} />
          <Metric
            label="Isotonic memperbaiki di TEST"
            value={result.calibration?.isotonicOnTest ? (result.calibration.isotonicImprovesOutOfSample ? 'ya' : 'tidak') : NA}
          />
        </div>
        {result.calibration?.bins?.length ? (
          <Scroller>
            <table className="w-full text-xs">
              <thead className="text-tv-muted">
                <tr>
                  <Th>Bin skor</Th>
                  <Th>N</Th>
                  <Th>Prediksi naif</Th>
                  <Th>Win rate teramati</Th>
                  <Th>Wilson 95%</Th>
                  <Th>Reliabel</Th>
                  <Th>Prediksi di dalam CI</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border">
                {result.calibration.bins.map((bin: any) => (
                  <tr key={`${bin.binLow}-${bin.binHigh}`}>
                    <Td>{bin.binLow}-{bin.binHigh}</Td>
                    <Td>{int(bin.samples)}</Td>
                    <Td>{pct(bin.predicted)}</Td>
                    <Td>{pct(bin.observed)}</Td>
                    <Td>{pct(bin.wilsonLow)} .. {pct(bin.wilsonHigh)}</Td>
                    <Td>{bin.reliable ? 'ya' : 'tidak'}</Td>
                    <Td>{bin.predictionWithinCi ? 'ya' : 'TIDAK'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroller>
        ) : null}
        <p
          className={`mt-4 rounded-md border p-3 text-xs ${
            result.calibration?.scoreReadableAsProbability
              ? 'border-tv-border bg-tv-bg text-tv-text'
              : 'border-tv-red/40 bg-tv-red/10 text-tv-red'
          }`}
        >
          {result.calibration?.conclusion}
        </p>
      </ValidationCard>

      {/* KELAYAKAN EKSEKUSI */}
      <ValidationCard
        title="Irisan yang Bisa Dieksekusi"
        subtitle="Grid sinyal sengaja tidak terseleksi supaya bucket skor rendah punya pembanding. Tabel ini membaca hasil yang SAMA pada irisan yang benar-benar bisa dibeli/dijual - menandai, bukan membuang."
      >
        <Scroller>
          <table className="w-full text-xs">
            <thead className="text-tv-muted">
              <tr>
                <Th>Horizon</Th>
                <Th>Porsi lolos</Th>
                <Th>N efektif</Th>
                <Th>Win rate</Th>
                <Th>Avg net</Th>
                <Th>Median net</Th>
                <Th>Profit factor</Th>
                <Th>CI 95%</Th>
                <Th>Avg net seluruh grid</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tv-border">
              {horizons.map((h: any) => (
                <tr key={h.horizon}>
                  <Td>{h.label}</Td>
                  <Td>{pct(h.tradableShare)}</Td>
                  <Td>{int(h.tradablePerformance?.samplesEffective)}</Td>
                  <Td>{pct(h.tradablePerformance?.winRate)}</Td>
                  <Td>{pct(h.tradablePerformance?.avgNetReturn, 3)}</Td>
                  <Td>{pct(h.tradablePerformance?.medianNetReturn, 3)}</Td>
                  <Td>{num(h.tradablePerformance?.profitFactor)}</Td>
                  <Td>
                    {h.tradableBootstrap?.ci95Low == null
                      ? NA
                      : `${(h.tradableBootstrap.ci95Low * 100).toFixed(3)}% .. ${(h.tradableBootstrap.ci95High * 100).toFixed(3)}%`}
                  </Td>
                  <Td>{pct(h.performance?.avgNetReturn, 3)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
        <p className="mt-3 text-[11px] text-tv-muted">
          Gerbang: harga entry di atas gocap, nilai transaksi sesi memadai, dan cukup sering bertransaksi sampai
          waktu sinyal. Baris lama yang diarsipkan sebelum kolom ini ada dihitung{' '}
          <strong className="text-tv-text">tidak layak</strong> — &quot;tidak tahu&quot; bukan &quot;ya&quot;.
        </p>
      </ValidationCard>

      {/* SEBARAN KOMPONEN */}
      <ValidationCard title="Sebaran Komponen Skor" subtitle={result.componentDiagnostics?.note}>
        {result.componentDiagnostics?.rows?.length ? (
          <Scroller>
            <table className="w-full text-xs">
              <thead className="text-tv-muted">
                <tr>
                  <Th>Komponen</Th>
                  <Th>N</Th>
                  <Th>Rata-rata</Th>
                  <Th>p05</Th>
                  <Th>p50</Th>
                  <Th>p95</Th>
                  <Th>Mentok di 0/100</Th>
                  <Th>Sehat</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border">
                {result.componentDiagnostics.rows.map((row: any) => (
                  <tr key={row.component}>
                    <Td>{row.component}</Td>
                    <Td>{int(row.samples)}</Td>
                    <Td>{num(row.meanScore, 2)}</Td>
                    <Td>{num(row.p05, 2)}</Td>
                    <Td>{num(row.p50, 2)}</Td>
                    <Td>{num(row.p95, 2)}</Td>
                    <Td>{pct(row.saturatedShare)}</Td>
                    <Td>
                      <span className={row.healthy ? 'text-tv-text' : 'text-tv-yellow'}>
                        {row.healthy ? 'ya' : 'TIDAK'}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroller>
        ) : (
          <p className="text-sm text-tv-muted">Belum ada snapshot komponen untuk dianalisis.</p>
        )}
      </ValidationCard>

      {/* BIAYA */}
      <ValidationCard title="Sensitivitas Biaya dan Slippage" subtitle="Dihitung ulang dari harga bar mentah yang tersimpan - tidak perlu mengambil data provider lagi.">
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Metric
            label="Trade kena lantai (sisi mana pun)"
            value={pct(result.spreadFloor?.bindingShare)}
            hint="Slippage ditentukan fraksi harga IDX, bukan asumsi konfigurasi."
          />
          <Metric label="Lantai aktif saat entry" value={pct(result.spreadFloor?.entryBindingShare)} hint="Berdasarkan harga entry." />
          <Metric label="Lantai aktif saat exit" value={pct(result.spreadFloor?.exitBindingShare)} hint="Berdasarkan harga exit." />
          <Metric label="Median slippage entry" value={num(result.spreadFloor?.medianEntrySlippageBps ?? result.spreadFloor?.medianAppliedSlippageBps, 2)} hint="bps sisi beli" />
          <Metric label="Median slippage exit" value={num(result.spreadFloor?.medianExitSlippageBps, 2)} hint="bps sisi jual" />
          <Metric label="Maks slippage terpakai" value={num(result.spreadFloor?.maxAppliedSlippageBps, 2)} hint="bps pada satu sisi" />
        </div>
        <p className="mb-4 rounded-md border border-tv-border bg-tv-bg p-2.5 text-[11px] text-tv-muted">
          {result.spreadFloor?.note}
        </p>
        <Scroller>
          <table className="w-full text-xs">
            <thead className="text-tv-muted">
              <tr>
                <Th>Skenario</Th>
                <Th>Versi biaya</Th>
                <Th>Avg net</Th>
                <Th>Median net</Th>
                <Th>Win rate</Th>
                <Th>Profit factor</Th>
                <Th>Masih positif</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tv-border">
              {result.costSensitivity?.map((row: any) => (
                <tr key={row.scenario}>
                  <Td>{row.label}</Td>
                  <Td>{row.costVersion}</Td>
                  <Td>{pct(row.avgNetReturn, 3)}</Td>
                  <Td>{pct(row.medianNetReturn, 3)}</Td>
                  <Td>{pct(row.winRate)}</Td>
                  <Td>{num(row.profitFactor)}</Td>
                  <Td>
                    <span className={row.stillPositive ? 'text-tv-text' : 'text-tv-red'}>
                      {row.stillPositive ? 'ya' : 'tidak'}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      </ValidationCard>

      {/* WALK FORWARD */}
      <ValidationCard title="Walk-Forward (purged + embargo)" subtitle={result.walkForward?.note}>
        {result.walkForward?.folds?.length ? (
          <>
            <Scroller>
              <table className="w-full text-xs">
                <thead className="text-tv-muted">
                  <tr>
                    <Th>Fold</Th>
                    <Th>Train</Th>
                    <Th>Test</Th>
                    <Th>N train</Th>
                    <Th>N test</Th>
                    <Th>Avg net test</Th>
                    <Th>Win rate test</Th>
                    <Th>Embargo</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border">
                  {result.walkForward.folds.map((f: any) => (
                    <tr key={f.fold}>
                      <Td>{f.fold}</Td>
                      <Td>{f.trainStart} - {f.trainEnd}</Td>
                      <Td>{f.testStart} - {f.testEnd}</Td>
                      <Td>{int(f.trainSamples)}</Td>
                      <Td>{int(f.testSamples)}</Td>
                      <Td>{pct(f.testAvgNetReturn, 3)}</Td>
                      <Td>{pct(f.testWinRate)}</Td>
                      <Td>{int(f.purgedDays)} hari</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroller>
            <p className="mt-3 text-xs text-tv-muted">
              Fold positif: {result.walkForward.positiveFolds}/{result.walkForward.totalFolds}
            </p>
          </>
        ) : (
          <p className="text-sm text-tv-muted">{result.walkForward?.note ?? 'Belum cukup hari bursa untuk walk-forward.'}</p>
        )}
      </ValidationCard>
    </>
  );
}

/** Acceptance gate - dipisah karena dipakai langsung setelah ResultsSection di halaman utama. */
export function AcceptanceGateSection({ result }: { result: ValidationResult }) {
  return (
    <ValidationCard
      title="Acceptance Gate"
      subtitle={
        result.acceptance?.frozen
          ? 'Kriteria diambil dari protokol OOS yang sudah dibekukan - tidak boleh diubah setelah melihat hasil.'
          : 'Kriteria default. Bekukan protokol OOS untuk mengunci kriteria SEBELUM pengujian dimulai.'
      }
    >
      <Scroller>
        <table className="w-full text-xs">
          <thead className="text-tv-muted">
            <tr>
              <Th>Kriteria</Th>
              <Th>Syarat</Th>
              <Th>Teramati</Th>
              <Th>Lolos</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tv-border">
            {result.acceptance?.items?.map((item: any) => (
              <tr key={item.key}>
                <Td>{item.label}</Td>
                <Td>{item.required}</Td>
                <Td>{item.observed}</Td>
                <Td>
                  <span className={item.passed ? 'text-tv-green' : 'text-tv-red'}>{item.passed ? 'YA' : 'TIDAK'}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scroller>
      <p className="mt-3 text-xs text-tv-muted">
        Status akhir: <StatusBadge status={result.status} />. Status <code>CANDIDATE_VALIDATED</code> hanya muncul
        kalau SELURUH kriteria lolos DAN run dijalankan dalam mode OOS atas protokol yang sudah dibekukan.
      </p>
    </ValidationCard>
  );
}

/** Threshold simulator + weight optimizer - state-nya dimiliki hook utama. */
export function ThresholdAndWeightSection({
  threshold,
  setThreshold,
  thresholdSim,
  weightProposal,
  busy,
  horizon,
  onRunAction,
}: {
  threshold: number;
  setThreshold: (n: number) => void;
  thresholdSim: any;
  weightProposal: any;
  busy: ActionName | null;
  horizon: string;
  onRunAction: (action: ActionName, payload?: Record<string, unknown>) => void;
}) {
  return (
    <>
      {/* 10. THRESHOLD SIMULATOR */}
      <ValidationCard
        title="Threshold Simulator"
        subtitle="Hanya untuk riset. Slider ini TIDAK mengubah ambang produksi, dan proposal ambang otomatis dibekukan sampai OOS asli memenuhi syarat."
      >
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <label className="flex items-center gap-3 text-xs text-tv-muted">
            <Sliders className="h-4 w-4" />
            Ambang skor
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-48 accent-tv-accent"
            />
            <span className="font-number text-tv-text w-10">{threshold}</span>
          </label>
          <ActionButton
            label="Simulasikan"
            busy={busy === 'threshold_simulation'}
            disabled={busy != null}
            onClick={() => onRunAction('threshold_simulation', { horizon })}
          />
          <ActionButton
            label="Ajukan proposal ambang"
            busy={busy === 'threshold_proposal'}
            disabled={busy != null}
            onClick={() => onRunAction('threshold_proposal', { threshold, horizon })}
          />
        </div>

        {thresholdSim ? (
          <>
            <Scroller>
              <table className="w-full text-xs">
                <thead className="text-tv-muted">
                  <tr>
                    <Th>Ambang</Th>
                    <Th>Jumlah sinyal</Th>
                    <Th>N efektif</Th>
                    <Th>Win rate</Th>
                    <Th>Avg net</Th>
                    <Th>Median net</Th>
                    <Th>Profit factor</Th>
                    <Th>Max DD</Th>
                    <Th>Konsentrasi top-5</Th>
                    <Th>p-value</Th>
                    <Th>q-value (Holm)</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border">
                  {thresholdSim.rows?.map((row: any) => (
                    <tr key={row.threshold}>
                      <Td>
                        {row.threshold}
                        <SampleTag status={row.status} />
                      </Td>
                      <Td>{int(row.signals)}</Td>
                      <Td>{int(row.samplesEffective)}</Td>
                      <Td>{pct(row.winRate)}</Td>
                      <Td>{pct(row.avgNetReturn, 3)}</Td>
                      <Td>{pct(row.medianNetReturn, 3)}</Td>
                      <Td>{num(row.profitFactor)}</Td>
                      <Td>{pct(row.maxDrawdown, 2)}</Td>
                      <Td>{num(row.top5TickerAbsShare)}</Td>
                      <Td>{num(row.pValue, 4)}</Td>
                      <Td>{num(row.correctedPValue, 4)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroller>
            <p className="mt-3 rounded-md border border-tv-yellow/40 bg-tv-yellow/10 p-2.5 text-xs text-tv-yellow">
              {thresholdSim.multipleTestingNote}
            </p>
          </>
        ) : (
          <p className="text-sm text-tv-muted">Tekan &quot;Simulasikan&quot; untuk melihat dampak ambang terhadap sampel dan statistik.</p>
        )}
      </ValidationCard>

      {/* 11. WEIGHT OPTIMIZER */}
      <ValidationCard
        title="Weight Optimizer LensIntraday"
        subtitle="TRAIN / VALIDATION / TEST berurutan waktu dengan embargo, regularisasi terhadap bobot berjalan, dan batas bobot. Hasilnya proposal untuk ditinjau, bukan perubahan otomatis."
      >
        <ActionButton
          label="Hitung proposal bobot"
          busy={busy === 'weight_proposal'}
          disabled={busy != null}
          onClick={() => onRunAction('weight_proposal', { horizon })}
        />
        {weightProposal ? (
          <div className="mt-4">
            {weightProposal.status === 'INSUFFICIENT_DATA' ? (
              <p className="rounded-md border border-tv-yellow/40 bg-tv-yellow/10 p-3 text-xs text-tv-yellow">
                {weightProposal.reason}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <Metric label="Bobot berjalan" value={JSON.stringify(weightProposal.currentWeights)} />
                  <Metric
                    label="Bobot diusulkan"
                    value={weightProposal.proposedWeights ? JSON.stringify(weightProposal.proposedWeights) : <span className="text-tv-muted">tidak ada usulan</span>}
                  />
                </div>
                <Scroller>
                  <table className="w-full text-xs">
                    <thead className="text-tv-muted">
                      <tr>
                        <Th>Split</Th>
                        <Th>Periode</Th>
                        <Th>N</Th>
                        <Th>N efektif</Th>
                        <Th>IC</Th>
                        <Th>Kuintil atas</Th>
                        <Th>Kuintil bawah</Th>
                        <Th>Spread</Th>
                        <Th>p-value</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tv-border">
                      {[weightProposal.train, weightProposal.validation, weightProposal.test]
                        .filter(Boolean)
                        .map((split: any) => (
                          <tr key={split.label}>
                            <Td>{split.label}</Td>
                            <Td>{split.fromDate} - {split.toDate}</Td>
                            <Td>{int(split.samplesRaw)}</Td>
                            <Td>{int(split.samplesEffective)}</Td>
                            <Td>{num(split.informationCoefficient, 4)}</Td>
                            <Td>{pct(split.avgNetReturnTopQuintile, 3)}</Td>
                            <Td>{pct(split.avgNetReturnBottomQuintile, 3)}</Td>
                            <Td>{pct(split.spread, 3)}</Td>
                            <Td>{num(split.pValue, 4)}</Td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </Scroller>
                <p className="mt-3 text-xs text-tv-muted">{weightProposal.reason}</p>
              </>
            )}
          </div>
        ) : null}
      </ValidationCard>
    </>
  );
}
