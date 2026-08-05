export const PRODUCT_VALIDATION_STATUS = 'RESEARCH_ONLY' as const;
export const THRESHOLD_RECOMMENDER_ENABLED = false;
export const MIN_VALIDATION_DAYS = 90;
export const MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION = 30;

export const RESEARCH_ONLY_DISCLAIMER =
  'LensRadar masih dalam mode riset: angka backtest/p-value bersifat indikatif, belum menjadi bukti validasi out-of-sample, dan bukan nasihat investasi.';

export type ValidationStatus =
  | 'NOT_ENOUGH_DATA'
  | 'EXPLORATORY'
  | 'OUT_OF_SAMPLE_PENDING'
  | 'VALIDATED_OUT_OF_SAMPLE'
  | 'FAILED_VALIDATION';

export function resolveValidationStatus(input: {
  validationDays: number;
  effectiveSamples: number;
  pValue: number | null;
  outOfSampleTested: boolean;
}): ValidationStatus {
  if (input.validationDays < MIN_VALIDATION_DAYS || input.effectiveSamples < MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION) {
    return 'NOT_ENOUGH_DATA';
  }
  if (input.pValue == null || input.pValue >= 0.05) return input.outOfSampleTested ? 'FAILED_VALIDATION' : 'EXPLORATORY';
  return input.outOfSampleTested ? 'VALIDATED_OUT_OF_SAMPLE' : 'OUT_OF_SAMPLE_PENDING';
}

export function suppressUnvalidatedSignificance<T extends {
  significant: boolean;
  pValue: number | null;
  conclusion: string;
}>(result: T): T {
  const sanitizedConclusion = result.significant
    ? 'In-sample p-value terlihat kuat, tetapi belum boleh dibaca sebagai keunggulan signifikan karena belum ada uji out-of-sample.'
    : result.conclusion;
  return {
    ...result,
    significant: false,
    conclusion: `Indikatif untuk riset, belum validasi produksi/out-of-sample. ${sanitizedConclusion}`,
  };
}
