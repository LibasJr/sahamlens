/**
 * API admin seharusnya selalu JSON. Kalau proxy (mis. Cloudflare timeout) mengirim
 * halaman HTML, jangan biarkan JSON.parse menampilkan error teknis "Unexpected token".
 */
export async function readAdminJsonResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    const requestId = response.headers.get('x-request-id');
    const detail = requestId ? ` ID request: ${requestId}.` : '';
    throw new Error(
      `Server mengembalikan respons non-JSON (HTTP ${response.status}). ` +
      `Ini biasanya timeout atau halaman error proxy, bukan kesalahan input Anda.${detail}`,
    );
  }
}
