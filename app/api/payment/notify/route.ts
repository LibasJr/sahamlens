import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession } from '@/modules/user';
import { sendTelegramMessage } from '@/lib/telegram';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';

// Dipanggil dari PaywallModal tiap kali user klik "Kirim Bukti Transfer via
// WhatsApp" - notifikasi heads-up instan ke Telegram admin SEBELUM admin
// sempat buka WhatsApp untuk cek bukti fisiknya. Best-effort: selalu balas 200,
// kegagalan kirim Telegram (lihat sendTelegramMessage) tidak boleh menghalangi
// user membuka link WhatsApp di sisi client.
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const rate = await checkRateLimitShared(`payment-notify:${ip}`, Date.now(), { windowMs: 15 * 60_000, maxPerWindow: 3, blockMs: 60 * 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Terlalu banyak notifikasi. Coba lagi nanti.' }, { status: 429, headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined });
  }
  let identifier = 'Pengunjung (belum login)';
  try {
    const session = await getSession();
    if (session?.email) identifier = session.email;
  } catch {
    // Sesi rusak/gagal dibaca - tetap kirim notifikasi tanpa identitas daripada
    // menjatuhkan seluruh request (best-effort, lihat komentar di atas fungsi ini).
  }
  await sendTelegramMessage(
    `💰 <b>Klaim Transfer Pro</b>\n${identifier} klaim sudah transfer untuk upgrade Pro.\nCek WhatsApp untuk detail paket & bukti transfer, lalu aktifkan di /admin.`
  );
  return NextResponse.json({ ok: true });
}
