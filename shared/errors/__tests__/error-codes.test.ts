import { describe, expect, it } from 'vitest';
import { errorCategoryFor, isErrorCode } from '../error-codes';
import { AdminRequiredError, ProviderUnavailableError, toErrorResponse } from '../app-error';

describe('API error taxonomy', () => {
  it('classifies stable machine-readable codes', () => {
    expect(isErrorCode('RATE_LIMITED')).toBe(true);
    expect(errorCategoryFor('RATE_LIMITED')).toBe('THROTTLE');
    expect(errorCategoryFor('SUBSCRIPTION_REQUIRED')).toBe('ACCESS');
    expect(errorCategoryFor('PROVIDER_UNAVAILABLE')).toBe('UPSTREAM');
  });

  it('maps typed server errors to additive code fields', () => {
    expect(toErrorResponse(new AdminRequiredError('Khusus admin'))).toMatchObject({ status: 403, body: { error: 'Khusus admin', code: 'ADMIN_REQUIRED' } });
    expect(toErrorResponse(new ProviderUnavailableError())).toMatchObject({ status: 503, body: { code: 'PROVIDER_UNAVAILABLE' } });
  });
});
