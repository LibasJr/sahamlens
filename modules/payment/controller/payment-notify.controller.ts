import { z } from 'zod';
import type { HttpResult } from '@/shared/types/http-result.types';
import { getSession } from '@/modules/user';
import { sendTelegramMessage } from '@/lib/telegram';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';
import { getTrustedClientIp } from '@/shared/http/client-ip';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import { PRICING_PLANS } from '@/shared/config/pricing';
import { claimPaymentOrder } from '../repository/payment-order.repository';

const bodySchema = z.object({ planCode: z.enum(['1m', '3m', '6m', '12m']), reference: z.string().uuid() });

export async function handlePaymentNotify(request: Request): Promise<HttpResult> {
  assertTrustedSameOrigin(request);
  const ip = getTrustedClientIp(request.headers);
  const rate = await checkRateLimitShared(`payment-notify:${ip}`, Date.now(), { windowMs: 15 * 60_000, maxPerWindow: 3, blockMs: 60 * 60_000 });
  if (!rate.allowed) {
    return {
      status: 429,
      body: { error: 'Terlalu banyak notifikasi. Coba lagi nanti.', code: 'RATE_LIMITED' },
      headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined,
    };
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return { status: 400, body: { error: 'Data klaim pembayaran tidak valid.', code: 'VALIDATION_ERROR' } };

  const plan = PRICING_PLANS.find((item) => item.id === parsed.data.planCode)!;
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try { session = await getSession(); } catch { /* handled below */ }
  if (!session?.id || !session.email) {
    return { status: 401, body: { error: 'Login diperlukan sebelum membuat klaim pembayaran agar order terikat ke akun.', code: 'UNAUTHENTICATED' } };
  }

  let order: Awaited<ReturnType<typeof claimPaymentOrder>>;
  try {
    order = await claimPaymentOrder({
      userId: session.id,
      email: session.email,
      planCode: plan.id,
      amountIdr: plan.finalPrice,
      externalReference: parsed.data.reference,
      claimChannel: 'WHATSAPP',
    });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'PAYMENT_REFERENCE_REUSE_MISMATCH') {
      return { status: 409, body: { error: 'Referensi pembayaran sudah dipakai untuk klaim yang berbeda. Buat referensi baru.', code: 'CONFLICT' } };
    }
    return { status: 503, body: { error: 'Klaim belum tercatat. WhatsApp tetap dapat digunakan, tetapi sertakan kode referensi pada pesan.', code: 'DATA_UNAVAILABLE' } };
  }

  try {
    await sendTelegramMessage(`💰 <b>Klaim Transfer Pro</b>\n${session.email}\nPaket: ${plan.label}\nNominal: Rp${plan.finalPrice.toLocaleString('id-ID')}\nReferensi: <code>${parsed.data.reference}</code>\nOrder: <code>${order.id}</code>\nCocokkan bukti transfer sebelum aktivasi Pro.`);
    return { status: 200, body: { ok: true, orderId: order.id, reference: parsed.data.reference, notification: 'SENT' } };
  } catch {
    return { status: 202, body: { ok: true, orderId: order.id, reference: parsed.data.reference, notification: 'TELEGRAM_FAILED' } };
  }
}
