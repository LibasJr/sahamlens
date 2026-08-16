import { ForbiddenError } from '../errors/app-error';
import { getTrustedAppOrigin } from './server-origin';

/**
 * CSRF/same-origin guard for state-changing browser endpoints.
 *
 * Browsers normally send Origin on POST/PUT/PATCH/DELETE. Requests without Origin are
 * accepted only when Sec-Fetch-Site says same-origin/none (CLI/server calls) so
 * internal automation keeps working while cross-site and sibling-subdomain browser submissions fail closed.
 */
function trustedOrigins(): Set<string> {
  const values = [getTrustedAppOrigin(), ...(process.env.TRUSTED_APP_ORIGINS || '').split(',')];
  return new Set(values.map((value) => value.trim().replace(/\/$/, '')).filter(Boolean));
}

export function assertTrustedSameOrigin(request: Request): void {
  const allowed = trustedOrigins();
  const origin = request.headers.get('origin')?.replace(/\/$/, '') || null;
  if (origin) {
    if (!allowed.has(origin)) throw new ForbiddenError('Origin tidak dikenali');
    return;
  }

  const fetchSite = request.headers.get('sec-fetch-site')?.toLowerCase();
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    throw new ForbiddenError('Request lintas situs ditolak');
  }
}
