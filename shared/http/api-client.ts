import { errorCategoryFor, isErrorCode, type ErrorCategory, type ErrorCode } from '@/shared/errors/error-codes';

export interface ApiErrorBody {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  meta?: { requestId?: unknown } | unknown;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly requestId: string | null;
  readonly retryAfterSec: number | null;
  readonly body: unknown;

  constructor(args: {
    message: string;
    status: number;
    code: ErrorCode;
    requestId?: string | null;
    retryAfterSec?: number | null;
    body?: unknown;
  }) {
    super(args.message);
    this.name = 'ApiClientError';
    this.status = args.status;
    this.code = args.code;
    this.category = errorCategoryFor(args.code);
    this.requestId = args.requestId ?? null;
    this.retryAfterSec = args.retryAfterSec ?? null;
    this.body = args.body;
  }
}

function fallbackCodeForStatus(status: number): ErrorCode {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 402) return 'SUBSCRIPTION_REQUIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 500) return 'INTERNAL_ERROR';
  if (status >= 501 && status < 600) return 'UPSTREAM_ERROR';
  return 'VALIDATION_ERROR';
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function requestIdFrom(body: ApiErrorBody | null, response: Response): string | null {
  const headerId = response.headers.get('X-Request-Id');
  if (headerId) return headerId;
  const meta = body && typeof body.meta === 'object' && body.meta !== null ? body.meta as { requestId?: unknown } : null;
  return typeof meta?.requestId === 'string' ? meta.requestId : null;
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json().catch(() => null);
  return response.text().catch(() => null);
}

/**
 * Browser-safe JSON request helper. It preserves AbortError/network errors as-is, while HTTP
 * failures become ApiClientError with a stable machine code, request-id and Retry-After value.
 */
export async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = await readResponseBody(response);
  if (response.ok) return body as T;

  const errorBody = body && typeof body === 'object' ? body as ApiErrorBody : null;
  const code = isErrorCode(errorBody?.code) ? errorBody.code : fallbackCodeForStatus(response.status);
  const message = typeof errorBody?.error === 'string' && errorBody.error.trim()
    ? errorBody.error
    : typeof errorBody?.message === 'string' && errorBody.message.trim()
      ? errorBody.message
      : `Request gagal (HTTP ${response.status})`;

  throw new ApiClientError({
    message,
    status: response.status,
    code,
    requestId: requestIdFrom(errorBody, response),
    retryAfterSec: parseRetryAfter(response.headers.get('Retry-After')),
    body,
  });
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

/** Human-readable support reference for UI surfaces. Keep the id separate from the
 * primary message so it is easy to copy into a support ticket without making every
 * error sentence noisy. */
export function apiSupportReference(error: unknown): string | null {
  return isApiClientError(error) && error.requestId ? `ID request: ${error.requestId}` : null;
}

export function apiErrorMessage(error: unknown, fallback: string, includeSupportReference = false): string {
  const message = isApiClientError(error) ? error.message : fallback;
  if (!includeSupportReference) return message;
  const reference = apiSupportReference(error);
  return reference ? `${message} (${reference})` : message;
}
