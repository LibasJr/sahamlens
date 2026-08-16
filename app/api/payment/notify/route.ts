import { guard } from '@/lib/sahamLensGuard'; guard();
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/modules/user';
import { sendTelegramMessage } from '@/lib/telegram';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';
import { getTrustedClientIp } from '@/shared/http/client-ip';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import { toErrorResponse } from '@/shared/errors/app-error';
import { PRICING_PLANS } from '@/shared/config/pricing';
import { claimPaymentOrder } from '@/modules/payment/repository/payment-order.repository';

const bodySchema=z.object({ planCode:z.enum(['1m','3m','6m','12m']), reference:z.string().uuid() });
export async function POST(req: Request) {
  try {
    assertTrustedSameOrigin(req);
  } catch (error) {
    const mapped = toErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status, headers: mapped.headers });
  }
  const ip=getTrustedClientIp(req.headers);
  const rate=await checkRateLimitShared(`payment-notify:${ip}`,Date.now(),{windowMs:15*60_000,maxPerWindow:3,blockMs:60*60_000});
  if(!rate.allowed) return NextResponse.json({error:'Terlalu banyak notifikasi. Coba lagi nanti.'},{status:429,headers:rate.retryAfterSec?{'Retry-After':String(rate.retryAfterSec)}:undefined});
  const parsed=bodySchema.safeParse(await req.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:'Data klaim pembayaran tidak valid.'},{status:400});
  const plan=PRICING_PLANS.find((x)=>x.id===parsed.data.planCode)!;
  let session: Awaited<ReturnType<typeof getSession>>=null;
  try { session=await getSession(); } catch { /* handled as unauthenticated below */ }
  if (!session?.id || !session.email) {
    return NextResponse.json({error:'Login diperlukan sebelum membuat klaim pembayaran agar order terikat ke akun.'},{status:401});
  }
  let order: Awaited<ReturnType<typeof claimPaymentOrder>>;
  try {
    order=await claimPaymentOrder({ userId:session?.id??null,email:session?.email??null,planCode:plan.id,amountIdr:plan.finalPrice,externalReference:parsed.data.reference,claimChannel:'WHATSAPP' });
  } catch (error) {
    if ((error as {code?:string}|null)?.code === 'PAYMENT_REFERENCE_REUSE_MISMATCH') {
      return NextResponse.json({error:'Referensi pembayaran sudah dipakai untuk klaim yang berbeda. Buat referensi baru.'},{status:409});
    }
    // Audit row is the source of truth. Do not pretend a claim exists if DB storage failed.
    return NextResponse.json({error:'Klaim belum tercatat. WhatsApp tetap dapat digunakan, tetapi sertakan kode referensi pada pesan.'},{status:503});
  }

  const identifier=session.email;
  try {
    await sendTelegramMessage(`💰 <b>Klaim Transfer Pro</b>\n${identifier}\nPaket: ${plan.label}\nNominal: Rp${plan.finalPrice.toLocaleString('id-ID')}\nReferensi: <code>${parsed.data.reference}</code>\nOrder: <code>${order.id}</code>\nCocokkan bukti transfer sebelum aktivasi Pro.`);
    return NextResponse.json({ok:true,orderId:order.id,reference:parsed.data.reference,notification:'SENT'});
  } catch {
    // Order tetap tersimpan dan dapat direkonsiliasi dari reference; kegagalan Telegram
    // tidak boleh menghapus audit trail atau mengklaim order tidak tercatat.
    return NextResponse.json({ok:true,orderId:order.id,reference:parsed.data.reference,notification:'TELEGRAM_FAILED'},{status:202});
  }
}
