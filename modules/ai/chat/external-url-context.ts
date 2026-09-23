import { isIP } from 'node:net';

const URL_RE = /https?:\/\/[^\s<>()\[\]{}"']+/i;
const MAX_BYTES = 750_000;
const MAX_CHARS = 12_000;
const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain']);

function blockedIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a >= 224;
  }
  const normalized = ip.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:') || normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:10.') || normalized.startsWith('::ffff:192.168.');
}

function safeUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (BLOCKED_HOSTS.has(host) || blockedIp(host)) return null;
    return url;
  } catch { return null; }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ').trim();
}

/** Fetch one user-supplied public HTTP(S) URL. Redirects are revalidated. */
export async function buildExternalUrlContext(prompt: string): Promise<string> {
  const match = prompt.match(URL_RE);
  if (!match) return '';
  let url = safeUrl(match[0]);
  if (!url) return '\n\n## Link Eksternal\nURL ditolak: hanya URL HTTP(S) publik yang dapat dibaca.';

  for (let redirects = 0; redirects <= 3; redirects++) {
    try {
      const response: Response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
        headers: { 'User-Agent': 'SahamLens-LinkReader/1.0', Accept: 'text/html,text/plain;q=0.9' },
      });
      if (response.status >= 300 && response.status < 400) {
        const next: string | null = response.headers.get('location');
        url = next ? safeUrl(new URL(next, url).toString()) : null;
        if (!url) return '\n\n## Link Eksternal\nRedirect link ditolak karena bukan URL publik yang aman.';
        continue;
      }
      if (!response.ok) return `\n\n## Link Eksternal\nLink tidak dapat dibaca (HTTP ${response.status}).`;
      const contentType = response.headers.get('content-type') ?? '';
      if (!/^(text\/html|text\/plain)/i.test(contentType)) return '\n\n## Link Eksternal\nLink bukan halaman teks/HTML yang dapat dianalisis.';
      const size = Number(response.headers.get('content-length') ?? 0);
      if (size > MAX_BYTES) return '\n\n## Link Eksternal\nHalaman terlalu besar untuk dianalisis.';
      const raw = await response.text();
      if (raw.length > MAX_BYTES) return '\n\n## Link Eksternal\nHalaman terlalu besar untuk dianalisis.';
      const text = (contentType.toLowerCase().startsWith('text/html') ? htmlToText(raw) : raw.replace(/\s+/g, ' ').trim()).slice(0, MAX_CHARS);
      if (!text) return '\n\n## Link Eksternal\nTidak ada teks yang dapat diekstrak dari link.';
      return `\n\n## Konten Link Eksternal (user-supplied, belum diverifikasi SahamLens)\nURL: ${url.toString()}\nIsi: ${text}`;
    } catch { return '\n\n## Link Eksternal\nLink gagal diakses atau waktu baca habis.'; }
  }
  return '\n\n## Link Eksternal\nTerlalu banyak redirect.';
}
