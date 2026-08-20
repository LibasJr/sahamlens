'use client';

/**
 * Satu identitas anonim untuk SELURUH analitik produk.
 *
 * Funnel pendaftaran dan perjalanan riset memakai kunci yang sama dengan sengaja. Dua
 * kunci berarti dua populasi yang tidak bisa dibandingkan - "40% pengunjung membuka
 * analisis" dan "12% pengunjung mendaftar" akan menghitung penyebut yang berbeda tanpa
 * ada yang menyadarinya.
 *
 * UUID acak per browser, bukan sidik jari, bukan IP, dan tidak pernah ditautkan ke akun.
 */

const VISITOR_KEY = 'sahamlens.product-funnel.visitor.v1';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getVisitorId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(VISITOR_KEY);
    if (saved && UUID_V4.test(saved)) return saved;
    if (!window.crypto?.randomUUID) return null;
    const visitorId = window.crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, visitorId);
    return visitorId;
  } catch {
    // Storage bisa dilarang penuh (mode privat ketat, kebijakan enterprise). Analitik
    // tidak pernah menjadi alasan sebuah halaman gagal.
    return null;
  }
}
