import { runController } from '@/shared/http/next-response.adapter';
import { getSession } from '@/modules/user';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import { toErrorResponse } from '@/shared/errors/app-error';

const MAX_MESSAGE_ID = 100;
const MAX_PROMPT = 1_500;
const MAX_ANSWER = 6_000;
const MAX_INTENT = 80;
const MAX_SOURCE = 160;
const MAX_TIMESTAMP = 120;

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Pengumpulan feedback eksplisit untuk evaluasi LensAI. Route ini tidak membaca
 * history percakapan dari browser; hanya jawaban yang dipilih pengguna untuk dinilai.
 */
export async function POST(request: Request) {
  return runController(async () => {
    try {
    assertTrustedSameOrigin(request);
    const body = await request.json();
    const clientMessageId = cleanText(body?.messageId, MAX_MESSAGE_ID);
    const rating = body?.rating === 'up' || body?.rating === 'down' ? body.rating : null;
    const prompt = cleanText(body?.prompt, MAX_PROMPT);
    const answer = cleanText(body?.answer, MAX_ANSWER);

    if (!clientMessageId || !rating || !prompt || !answer) {
      return { status: 400, body: { error: 'Payload feedback tidak valid.' } };
    }

    const session = await getSession();
    await ensureSharedSchema();
    await pool.query(
      `INSERT INTO lensai_feedback
        (id, client_message_id, user_id, rating, prompt, answer, intent, source_label, data_timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (client_message_id) DO UPDATE SET
         rating = EXCLUDED.rating,
         prompt = EXCLUDED.prompt,
         answer = EXCLUDED.answer,
         intent = EXCLUDED.intent,
         source_label = EXCLUDED.source_label,
         data_timestamp = EXCLUDED.data_timestamp,
         updated_at = now()`,
      [
        crypto.randomUUID(),
        clientMessageId,
        session?.id ?? null,
        rating,
        prompt,
        answer,
        cleanText(body?.intent, MAX_INTENT) || null,
        cleanText(body?.sourceLabel, MAX_SOURCE) || null,
        cleanText(body?.dataTimestamp, MAX_TIMESTAMP) || null,
      ],
    );

    return { status: 200, body: { ok: true } };
  } catch (error) {
    const mapped = toErrorResponse(error);
    if (mapped.status < 500) return { status: mapped.status, body: mapped.body, headers: mapped.headers };
    console.error('[LensAI:feedback] gagal menyimpan feedback', error instanceof Error ? error.message : String(error));
    return { status: 503, body: { error: 'Feedback belum dapat disimpan.' } };
    }
  }, request);
}
