import { buildAraObservation, type AraMarketBar, type AraObservation } from './ara-observation-pipeline.service';
import type { AraScannerInputKey, AraScannerInputStatus } from '../types/ara-scanner.types';

/**
 * Readiness harus DITURUNKAN dari perilaku pipeline, bukan ditulis tangan.
 *
 * Sebelum ini, `CURRENT_ARA_INPUT_READINESS` adalah konstanta: PR #341 sudah
 * mengimplementasikan lima input, tetapi deklarasinya tetap PARTIAL karena tidak
 * ada yang menyuntingnya. Drift itu berbahaya ke dua arah — ia bisa menyembunyikan
 * kemajuan, dan nanti bisa mengklaim kesiapan yang sudah tidak benar.
 *
 * Probe ini menjalankan pipeline pada fixture deterministik dan menyimpulkan
 * status dari hasilnya. Kalau pipeline rusak atau sebuah kemampuan hilang,
 * statusnya turun sendiri tanpa ada yang perlu ingat memperbaruinya.
 *
 * Probe hanya boleh membuktikan kemampuan HITUNG. Ia tidak bisa dan tidak boleh
 * membuktikan ketersediaan feed eksternal (UMA, suspensi, aksi korporasi,
 * cross-check harga, katalis) — itu tetap ditentukan di luar probe.
 */

export interface AraProbeOutcome {
  key: AraScannerInputKey;
  status: AraScannerInputStatus;
  detail: string;
  evidence: Record<string, unknown> | null;
}

/** Fixture deterministik: tren naik dengan volume dan turnover memadai. */
function buildProbeFixture(): { daily: AraMarketBar[]; intraday: AraMarketBar[] } {
  const daily: AraMarketBar[] = Array.from({ length: 21 }, (_, i) => {
    const close = 1_000 + i * 10;
    return {
      time: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(),
      open: close - 5, high: close + 8, low: close - 8, close,
      volume: 8_000_000,
    };
  });
  const intraday: AraMarketBar[] = Array.from({ length: 6 }, (_, i) => {
    const close = 1_240 + i * 6;
    return {
      time: new Date(Date.UTC(2026, 7, 22, 2, i * 5)).toISOString(),
      open: close - 3, high: close + 4, low: close - 4, close,
      volume: 900_000,
    };
  });
  return { daily, intraday };
}

function num(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Menjalankan pipeline sekali, lalu menilai tiap kemampuan dari keluarannya.
 * Melempar exception berarti pipeline rusak: semua kemampuan turun ke ERROR.
 */
export function probeAraPipelineCapabilities(): AraProbeOutcome[] {
  const fixture = buildProbeFixture();
  let observation: AraObservation;

  try {
    observation = buildAraObservation({
      ticker: 'PROBE.JK',
      daily: fixture.daily,
      intraday: fixture.intraday,
      benchmarkDaily: fixture.daily,
      source: 'readiness-probe-fixture',
      fetchedAt: fixture.intraday[fixture.intraday.length - 1].time,
    });
  } catch (error) {
    const detail = `Pipeline observasi gagal dijalankan: ${error instanceof Error ? error.message : String(error)}`;
    return (['ARA_CANDIDATES', 'ARA_LIMIT', 'LIQUIDITY_PROXY', 'BREAKOUT_PERSISTENCE',
      'RELATIVE_TRADING_ACTIVITY', 'MOMENTUM_EXHAUSTION'] as const)
      .map((key) => ({ key, status: 'ERROR' as const, detail, evidence: null }));
  }

  const outcomes: AraProbeOutcome[] = [];

  outcomes.push(num(observation.distanceToAraPct) && typeof observation.nearAra === 'boolean'
    ? { key: 'ARA_CANDIDATES', status: 'READY',
        detail: 'Pipeline membentuk kandidat near-ARA dengan jarak terukur dari harga aktual.',
        evidence: { nearAra: observation.nearAra, distanceToAraPct: observation.distanceToAraPct } }
    : { key: 'ARA_CANDIDATES', status: 'PARTIAL',
        detail: 'Pipeline tidak menghasilkan jarak ke ARA yang terukur.', evidence: null });

  outcomes.push(num(observation.araLimit) && observation.araLimit > observation.previousClose
    ? { key: 'ARA_LIMIT', status: 'READY',
        detail: 'Batas ARA riset dihitung dari previous close dengan pembulatan fraksi harga IDX.',
        evidence: { previousClose: observation.previousClose, araLimit: observation.araLimit } }
    : { key: 'ARA_LIMIT', status: 'PARTIAL',
        detail: 'Batas ARA tidak terhitung dengan benar dari previous close.', evidence: null });

  const liq = observation.liquidity;
  outcomes.push(num(liq.avgDailyTurnover) && num(liq.avgDailyVolume) && liq.meetsMinimum
    ? { key: 'LIQUIDITY_PROXY', status: 'READY',
        detail: 'Baseline likuiditas 20 hari terhitung dan ambang lapisan analisa terpenuhi. Bukan pengganti kedalaman pasar.',
        evidence: { avgDailyTurnover: liq.avgDailyTurnover, avgDailyVolume: liq.avgDailyVolume, zeroVolumeDays: liq.zeroVolumeDays } }
    : { key: 'LIQUIDITY_PROXY', status: 'PARTIAL',
        detail: `Baseline likuiditas belum memenuhi kontrak: ${liq.failures.join(', ') || 'tidak terhitung'}.`,
        evidence: { failures: liq.failures } });

  outcomes.push(Number.isInteger(observation.diagnostics.persistenceBars) && num(observation.components.B)
    ? { key: 'BREAKOUT_PERSISTENCE', status: 'READY',
        detail: 'Persistensi breakout intraday terhitung dari bar berurutan dan dipetakan ke komponen B.',
        evidence: { persistenceBars: observation.diagnostics.persistenceBars, B: observation.components.B } }
    : { key: 'BREAKOUT_PERSISTENCE', status: 'PARTIAL',
        detail: 'Persistensi breakout tidak terhitung.', evidence: null });

  outcomes.push(num(observation.diagnostics.volumeRatio) && num(observation.components.V) && num(observation.components.T)
    ? { key: 'RELATIVE_TRADING_ACTIVITY', status: 'READY',
        detail: 'Volume dan turnover berjalan dinormalisasi terhadap baseline 20 hari pada timestamp yang sama.',
        evidence: { volumeRatio: observation.diagnostics.volumeRatio, V: observation.components.V, T: observation.components.T } }
    : { key: 'RELATIVE_TRADING_ACTIVITY', status: 'PARTIAL',
        detail: 'Normalisasi volume atau turnover belum terhitung.', evidence: null });

  outcomes.push(num(observation.diagnostics.upperWickRatio) && typeof observation.diagnostics.exhaustion === 'boolean'
    ? { key: 'MOMENTUM_EXHAUSTION', status: 'READY',
        detail: 'Rejection dan kelelahan momentum menghasilkan kontrak eksplisit dari rasio upper wick dan kegagalan breakout.',
        evidence: { upperWickRatio: observation.diagnostics.upperWickRatio, exhaustion: observation.diagnostics.exhaustion } }
    : { key: 'MOMENTUM_EXHAUSTION', status: 'PARTIAL',
        detail: 'Kontrak rejection/exhaustion belum dihasilkan.', evidence: null });

  return outcomes;
}
