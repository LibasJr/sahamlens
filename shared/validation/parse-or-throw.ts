import type { z } from 'zod';
import { ValidationError } from '../errors/app-error';

// Satu titik parsing Zod dipakai semua controller (code review L2 - sebelumnya
// tiap controller punya salinan fungsi ini sendiri dengan tipe schema buatan
// tangan alih-alih z.ZodType<T> asli, kehilangan akses ke ZodIssue[] yang benar).
export function parseOrThrow<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || 'Input tidak valid';
    throw new ValidationError(message);
  }
  return parsed.data;
}
