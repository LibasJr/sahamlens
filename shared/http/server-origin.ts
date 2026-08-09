/**
 * Trusted same-app origin for server-to-server calls.
 * Never derive this from the incoming Host header: request headers are attacker-controlled
 * on self-hosted deployments and must not decide where secrets/cookies are forwarded.
 */
export function getTrustedAppOrigin(): string {
  const explicit = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

  if (process.env.NODE_ENV === 'production') return 'https://sahamlens.id';
  return 'http://localhost:3001';
}
