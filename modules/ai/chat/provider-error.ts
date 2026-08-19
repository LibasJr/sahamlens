import type { AIProviderErrorCode } from '@/lib/aiProviders';

export interface ChatProviderFailure {
  status: number;
  errorCode: 'PROVIDER_ERROR' | 'RATE_LIMIT';
  content: string;
  detailCode: string;
}

export function providerErrorResponse(errorCode: AIProviderErrorCode | null): ChatProviderFailure {
  switch (errorCode) {
    case 'RATE_LIMIT':
      return { status: 429, errorCode: 'RATE_LIMIT', detailCode: 'RATE_LIMIT', content: 'LensAI sedang terkena batas kuota/rate limit dari penyedia AI. Data SahamLens tidak hilang, tetapi jawaban bahasa AI belum dapat dibuat saat ini.' };
    case 'NO_PROVIDER_CONFIGURED':
      return { status: 503, errorCode: 'PROVIDER_ERROR', detailCode: 'NO_PROVIDER_CONFIGURED', content: 'LensAI belum terkonfigurasi dengan penyedia AI di server ini. Fitur data SahamLens tetap dapat digunakan, tetapi jawaban percakapan AI belum tersedia.' };
    case 'AUTH_ERROR':
      return { status: 503, errorCode: 'PROVIDER_ERROR', detailCode: 'PROVIDER_AUTH_ERROR', content: 'LensAI sedang mengalami gangguan autentikasi ke penyedia AI. Silakan coba lagi setelah konfigurasi penyedia diperbaiki.' };
    case 'INVALID_MODEL':
      return { status: 503, errorCode: 'PROVIDER_ERROR', detailCode: 'INVALID_MODEL', content: 'LensAI tidak dapat memakai model AI yang dikonfigurasi saat ini. Silakan coba lagi setelah konfigurasi model diperbaiki.' };
    case 'TIMEOUT':
      return { status: 504, errorCode: 'PROVIDER_ERROR', detailCode: 'PROVIDER_TIMEOUT', content: 'LensAI sedang mengalami timeout saat menghubungi penyedia AI. Silakan ulangi pertanyaan Anda.' };
    default:
      return { status: 503, errorCode: 'PROVIDER_ERROR', detailCode: errorCode ?? 'ALL_PROVIDERS_FAILED', content: 'LensAI sedang mengalami gangguan koneksi ke penyedia AI. Silakan ulangi pertanyaan Anda.' };
  }
}
