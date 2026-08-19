import { runController } from '@/shared/http/next-response.adapter';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { ServiceUnavailableError } from '@/shared/errors/app-error';
import { z } from 'zod';

// Empat field yang WAJIB ada dan tidak boleh kosong. Sebelumnya diperiksa dengan
// `if (!a || !b || !c || !d)` setelah dibersihkan cleanText - satu kondisi gabungan
// yang membalas "Payload feedback tidak valid" tanpa menyebut field mana. Zod
// menamai fieldnya, jadi klien tahu apa yang harus diperbaiki. Batas panjangnya
// tetap ditegakkan cleanText di bawah (ia juga memangkas, bukan hanya menolak).
const feedbackBodySchema = z.object({
  messageId: z.string().min(1, 'messageId wajib diisi'),
  rating: z.enum(['up', 'down'], { message: "rating harus 'up' atau 'down'" }),
  prompt: z.string().min(1, 'prompt wajib diisi'),
  answer: z.string().min(1, 'answer wajib diisi'),
  intent: z.string().optional(),
  sourceLabel: z.string().optional(),
  dataTimestamp: z.string().optional(),
}).passthrough();
import { getSession } from '@/modules/user';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';

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
    assertTrustedSameOrigin(request);
    const body = parseOrThrow(feedbackBodySchema, await request.json());
    const clientMessageId = cleanText(body.messageId, MAX_MESSAGE_ID);
    const rating = body.rating;
    const prompt = cleanText(body.prompt, MAX_PROMPT);
    const answer = cleanText(body.answer, MAX_ANSWER);

    const session = await getSession();

    // Kegagalan DB dibungkus jadi ServiceUnavailableError, BUKAN dibiarkan jatuh ke 500.
    // Niatnya dipertahankan dari catch tangan sebelumnya: menyimpan feedback yang gagal
    // itu kondisi fana, dan UI perlu bisa bilang "coba lagi" alih-alih melaporkan
    // kerusakan. Bedanya, dulu catch itu juga memetakan AppError sendiri lewat
    // toErrorResponse - runController-versi-tangan yang kini tidak diperlukan lagi,
    // sehingga assertTrustedSameOrigin dan ValidationError zod lewat jalur yang sama
    // dengan seluruh route lain.
    try {
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
    } catch (error) {
      throw new ServiceUnavailableError('Feedback belum dapat disimpan.', { cause: error });
    }

    return { status: 200, body: { ok: true } };
  });
}
