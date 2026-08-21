import { Receiver } from '@upstash/qstash';
import { timingSafeEqual } from 'node:crypto';

// Verifikasi bahwa request ke /api/cron/* atau /api/queue/* benar-benar datang
// dari QStash (bukan siapa pun yang menebak URL-nya) - tanpa ini, job mahal
// (AI Scan misalnya) bisa dipicu berulang-ulang dari luar dan membebani biaya
// Gemini/Yahoo tanpa kontrol (Scheduler Architecture, bagian Keamanan Endpoint).
let receiver: Receiver | null = null;

function getReceiver(): Receiver | null {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) return null;
  if (!receiver) {
    receiver = new Receiver({ currentSigningKey, nextSigningKey });
  }
  return receiver;
}

function verifyCronSecret(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorization?.startsWith('Bearer ')) return false;

  const expected = Buffer.from(secret);
  const supplied = Buffer.from(authorization.slice('Bearer '.length));
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function verifyQStashSignature(
  signature: string | null,
  body: string,
  authorization: string | null = null,
): Promise<boolean> {
  // systemd di VPS memakai CRON_SECRET; QStash tetap diterima selama cutover.
  // Kedua mekanisme fail-closed jika kredensial terkait tidak tersedia.
  if (verifyCronSecret(authorization)) return true;

  const r = getReceiver();
  if (!r || !signature) return false;
  try {
    return await r.verify({ signature, body });
  } catch {
    return false;
  }
}
