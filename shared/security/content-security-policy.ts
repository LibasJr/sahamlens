export function buildContentSecurityPolicy(nonce: string, isProd: boolean): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // React/visualization surfaces still contain legitimate style attributes. Script
    // execution is hardened first; style migration is deliberately a separate blast radius.
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' https://static.cloudflareinsights.com${isProd ? '' : " 'unsafe-eval'"}`,
    "script-src-attr 'none'",
    // Cloudflare proxied Web Analytics reports to same-origin /cdn-cgi/rum; keep the
    // explicit cloudflareinsights.com destination for manual-beacon compatibility.
    "connect-src 'self' https://*.ingest.sentry.io https://cloudflareinsights.com wss:",
    "worker-src 'self' blob:",
    isProd ? 'upgrade-insecure-requests' : '',
  ].filter(Boolean).join('; ');
}

export function createCspNonce(): string {
  // btoa + UUID is available in both the Next.js Node proxy runtime and Edge-compatible
  // runtimes, unlike Buffer. Base64 is a valid CSP nonce source value.
  return btoa(crypto.randomUUID());
}
