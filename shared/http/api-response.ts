export interface ApiResponseMeta {
  requestId?: string;
  dataAsOf?: string;
  calculatedAt?: string;
  marketDate?: string;
  source?: string;
  staleness?: string;
  modelVersion?: string;
  universeVersion?: string;
}

export type ApiResponse<T> =
  | { ok: true; data: T; meta?: ApiResponseMeta }
  | { ok: false; error: { code: string; message: string }; meta?: Pick<ApiResponseMeta, 'requestId'> };

export function apiOk<T>(data: T, meta: Omit<ApiResponseMeta, 'requestId'> = {}): ApiResponse<T> {
  return { ok: true, data, meta };
}

export function apiFail(code: string, message: string): ApiResponse<never> {
  return { ok: false, error: { code, message } };
}
