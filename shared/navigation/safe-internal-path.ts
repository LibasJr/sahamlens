/**
 * Path tujuan setelah autentikasi harus selalu berada di SahamLens. Query string
 * berasal dari browser dan tidak boleh dipercaya sebagai URL tujuan walaupun ia
 * terlihat seperti path relatif. Backslash dan slash yang di-encode ikut ditolak
 * karena browser dapat menormalkannya menjadi protocol-relative URL (`//host`).
 */
export function safeInternalPath(value: string | string[] | null | undefined, fallback = '/home'): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith('/')) return fallback;

  let decoded = candidate;
  try {
    // Batasi iterasi agar varian double-encoded juga aman tanpa menerima decoding
    // tak terbatas dari input penyerang.
    for (let i = 0; i < 3; i += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return fallback;
  }

  if (decoded.startsWith('//') || decoded.startsWith('/\\') || decoded.includes('\\')) return fallback;
  return candidate;
}
