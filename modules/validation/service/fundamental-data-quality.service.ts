export interface FundamentalDataQualityInput {
  price: number | null;
  eps: number | null;
  bvps: number | null;
  per: number | null;
  pbv: number | null;
  roePct: number | null;
}

export interface IdentityCheck {
  key: 'PER_PRICE_EPS' | 'PBV_PRICE_BVPS' | 'ROE_EPS_BVPS';
  available: boolean;
  passed: boolean | null;
  expected: number | null;
  actual: number | null;
  relativeErrorPct: number | null;
}

export interface FundamentalDataQualityScore {
  score: number;
  checks: IdentityCheck[];
  flags: string[];
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function checkIdentity(
  key: IdentityCheck['key'],
  expected: number | null,
  actual: number | null,
  tolerancePct = 10,
): IdentityCheck {
  const available = isFinitePositive(expected) && isFiniteNumber(actual);
  if (!available) {
    return { key, available: false, passed: null, expected, actual, relativeErrorPct: null };
  }
  const relativeErrorPct = Math.abs((actual - expected) / expected) * 100;
  return {
    key,
    available: true,
    passed: relativeErrorPct <= tolerancePct,
    expected,
    actual,
    relativeErrorPct: parseFloat(relativeErrorPct.toFixed(2)),
  };
}

/**
 * Data Quality Score fundamental 0-100 berbasis identity accounting sederhana.
 *
 * Tujuan utamanya mendeteksi mismatch satuan/mata uang secara otomatis. Contoh klasik:
 * harga IDR dibandingkan BVPS USD membuat PBV Yahoo terlihat belasan ribu kali; check
 * `PBV ≈ price / BVPS` akan gagal dan score turun.
 */
export function scoreFundamentalDataQuality(input: FundamentalDataQualityInput): FundamentalDataQualityScore {
  const perExpected = isFinitePositive(input.price) && isFinitePositive(input.eps)
    ? input.price / input.eps
    : null;
  const pbvExpected = isFinitePositive(input.price) && isFinitePositive(input.bvps)
    ? input.price / input.bvps
    : null;
  const roeExpected = isFinitePositive(input.eps) && isFinitePositive(input.bvps)
    ? (input.eps / input.bvps) * 100
    : null;

  const checks = [
    checkIdentity('PER_PRICE_EPS', perExpected, input.per),
    checkIdentity('PBV_PRICE_BVPS', pbvExpected, input.pbv),
    checkIdentity('ROE_EPS_BVPS', roeExpected, input.roePct),
  ];

  const available = checks.filter((c) => c.available);
  const failed = available.filter((c) => c.passed === false);
  const missingCount = checks.length - available.length;

  let score = 100;
  score -= failed.length * 25;
  score -= missingCount * 10;
  score = Math.max(0, Math.min(100, score));

  const flags = [
    ...failed.map((c) => `${c.key}_MISMATCH`),
    ...(missingCount > 0 ? [`${missingCount}_IDENTITY_CHECK_MISSING`] : []),
  ];

  return { score, checks, flags };
}
