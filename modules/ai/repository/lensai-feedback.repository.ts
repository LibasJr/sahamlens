import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';

export interface LensAiFeedbackRow {
  id: string;
  rating: 'up' | 'down';
  prompt: string;
  answer: string;
  intent: string | null;
  source_label: string | null;
  data_timestamp: string | null;
  created_at: string;
}

export interface LensAiFeedbackIntentSummary {
  intent: string | null;
  total: number;
  negative: number;
  positive: number;
}

/** Admin-only reader. Batas 100 menjaga halaman audit tidak berubah menjadi dump seluruh
 * percakapan; tujuan halaman ini adalah melihat pola jawaban yang perlu diperbaiki. */
export async function listRecentLensAiFeedback(limit = 100): Promise<LensAiFeedbackRow[]> {
  await ensureSharedSchema();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const { rows } = await pool.query<LensAiFeedbackRow>(
    `SELECT id, rating, prompt, answer, intent, source_label, data_timestamp, created_at
     FROM lensai_feedback
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit],
  );
  return rows;
}

/** Ringkasan berbasis intent agar admin dapat memprioritaskan pola jawaban yang paling
 * sering ditandai tidak tepat, tanpa membaca seluruh percakapan satu per satu. */
export async function summarizeLensAiFeedbackByIntent(limit = 12): Promise<LensAiFeedbackIntentSummary[]> {
  await ensureSharedSchema();
  const safeLimit = Math.max(1, Math.min(24, Math.floor(limit)));
  const { rows } = await pool.query<LensAiFeedbackIntentSummary>(
    `SELECT
       NULLIF(intent, '') AS intent,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE rating = 'down')::int AS negative,
       COUNT(*) FILTER (WHERE rating = 'up')::int AS positive
     FROM lensai_feedback
     GROUP BY NULLIF(intent, '')
     ORDER BY COUNT(*) FILTER (WHERE rating = 'down') DESC, COUNT(*) DESC, NULLIF(intent, '') ASC NULLS LAST
     LIMIT $1`,
    [safeLimit],
  );
  return rows;
}
