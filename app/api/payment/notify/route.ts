import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession } from '@/modules/user';
import { sendTelegramMessage } from '@/lib/telegram';

// Dipanggil dari PaywallModal tiap kali user klik "Kirim Bukti Transfer via
// WhatsApp" - notifikasi heads-up instan ke Telegram admin SEBELUM admin
// sempat buka WhatsApp untuk cek bukti fisiknya. Best-effort: selalu balas 200,
// kegagalan kirim Telegram (lihat sendTelegramMessage) tidak boleh menghalangi
// user membuka link WhatsApp di sisi client.
export async function POST() {
  let identifier = 'Pengunjung (belum login)';
  try {
    const session = await getSession();
    if (session?.email) identifier = session.email;
  } catch {
    // Sesi rusak/gagal dibaca - tetap kirim notifikasi tanpa identitas daripada
    // menjatuhkan seluruh request (best-effort, lihat komentar di atas fungsi ini).
  }
  await sendTelegramMessage(
    `💰 <b>Klaim Transfer Pro</b>\n${identifier} klaim sudah transfer Rp99.000/bulan untuk upgrade Pro.\nCek WhatsApp untuk bukti transfer, lalu aktifkan di /admin.`
  );
  return NextResponse.json({ ok: true });
}
