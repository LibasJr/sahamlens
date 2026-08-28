import { LENS_SCORE_WEIGHTS } from '@/shared/constants/lens-score-weights';
import { CONSENSUS_DIMENSION_WEIGHTS } from '../service/consensus.service';
import { CONSENSUS_VOTE_THRESHOLDS, SCORING_KATEGORI_THRESHOLDS } from '../service/decision-thresholds';

/**
 * Spesifikasi beku model produksi. Setiap perubahan formula/bobot/threshold wajib
 * menaikkan version; hash membuat payload historis dapat dihubungkan ke konfigurasi
 * yang benar-benar menghitungnya, bukan sekadar nama model yang dapat berubah arti.
 */
export const LENS_SCORE_MODEL_SPEC = {
  id: 'lens-score',
  // Sama persis dengan SCORE_VERSION arsip LensRadar; satu model tidak boleh punya
  // dua nama versi berbeda di API live dan dataset validasi.
  version: 'lens-score-v1.6.0',
  status: 'RESEARCH_ONLY' as const,
  returnPriceBasis: 'SPLIT_ADJUSTED',
  tradingPriceBasis: 'RAW',
  flowSource: 'IDX_OFFICIAL_FOREIGN_FLOW',
  indicatorParameters: {
    rsiPeriod: 14,
    atrPeriod: 14,
    emaFast: 20,
    emaSlow: 50,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    adxPeriod: 14,
    bollingerPeriod: 20,
    bollingerStdDev: 2,
    stochasticPeriod: 14,
    stochasticSmoothK: 3,
    stochasticPeriodD: 3,
    obvSlopeLookback: 10,
    volumeAveragePeriod: 20,
  },
  scoreWeights: LENS_SCORE_WEIGHTS,
  scoreThresholds: SCORING_KATEGORI_THRESHOLDS,
  consensusWeights: CONSENSUS_DIMENSION_WEIGHTS,
  consensusThresholds: CONSENSUS_VOTE_THRESHOLDS,
} as const;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** FNV-1a 32-bit: identity checksum deterministik, bukan primitive keamanan. */
export function modelSpecificationHash(spec: unknown): string {
  const text = canonical(spec);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export const LENS_SCORE_MODEL_HASH = modelSpecificationHash(LENS_SCORE_MODEL_SPEC);

export const LENS_SCORE_MODEL_METADATA = Object.freeze({
  id: LENS_SCORE_MODEL_SPEC.id,
  version: LENS_SCORE_MODEL_SPEC.version,
  status: LENS_SCORE_MODEL_SPEC.status,
  configHash: LENS_SCORE_MODEL_HASH,
});
