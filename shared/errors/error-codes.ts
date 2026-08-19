/**
 * Stable machine-readable API error taxonomy shared by server controllers and browser clients.
 *
 * Keep this list additive. Human-readable `error` messages may change; clients should branch on
 * `code` (and, when useful, `category`) instead of parsing Indonesian copy or HTTP status text.
 */
export const API_ERROR_CODES = [
  'UNAUTHENTICATED',
  'EMAIL_NOT_VERIFIED',
  'FORBIDDEN',
  'ADMIN_REQUIRED',
  'SUBSCRIPTION_REQUIRED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'COMPUTE_BUDGET_EXCEEDED',
  'DATA_UNAVAILABLE',
  'PROVIDER_UNAVAILABLE',
  'UPSTREAM_ERROR',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof API_ERROR_CODES)[number];

export type ErrorCategory = 'AUTH' | 'ACCESS' | 'REQUEST' | 'THROTTLE' | 'DATA' | 'UPSTREAM' | 'INTERNAL';

const ERROR_CATEGORY: Record<ErrorCode, ErrorCategory> = {
  UNAUTHENTICATED: 'AUTH',
  EMAIL_NOT_VERIFIED: 'AUTH',
  FORBIDDEN: 'ACCESS',
  ADMIN_REQUIRED: 'ACCESS',
  SUBSCRIPTION_REQUIRED: 'ACCESS',
  VALIDATION_ERROR: 'REQUEST',
  NOT_FOUND: 'REQUEST',
  CONFLICT: 'REQUEST',
  RATE_LIMITED: 'THROTTLE',
  COMPUTE_BUDGET_EXCEEDED: 'THROTTLE',
  DATA_UNAVAILABLE: 'DATA',
  PROVIDER_UNAVAILABLE: 'UPSTREAM',
  UPSTREAM_ERROR: 'UPSTREAM',
  INTERNAL_ERROR: 'INTERNAL',
};

const ERROR_CODE_SET = new Set<string>(API_ERROR_CODES);

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODE_SET.has(value);
}

export function errorCategoryFor(code: ErrorCode): ErrorCategory {
  return ERROR_CATEGORY[code];
}
