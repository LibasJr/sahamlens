export function buildContentSecurityPolicy(nonce: string, isProd: boolean): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Stylesheet/style-element execution is nonce-restricted now. Existing React,
    // visualization, and image-export surfaces still render legitimate style attributes,
    // so that compatibility exception is isolated to style-src-attr while those callers
    // migrate. Keeping unsafe-inline out of style-src prevents it from authorizing both
    // style elements and attributes through the broad fallback directive.
    `style-src 'self' 'nonce-${nonce}'`,
    `style-src-elem 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
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
