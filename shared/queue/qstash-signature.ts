import { Receiver } from '@upstash/qstash';

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

export async function verifyQStashSignature(signature: string | null, body: string): Promise<boolean> {
  const r = getReceiver();
  if (!r || !signature) return false;
  try {
    return await r.verify({ signature, body });
  } catch {
    return false;
  }
}
