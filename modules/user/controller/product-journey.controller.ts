import { recordJourneyEvents } from '@/modules/user/repository/product-journey.repository';
import { parseJourneyBatch } from '@/shared/analytics/journey-events';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import type { HttpResult } from '@/shared/types/http-result.types';
import { logger } from '@/shared/logger/logger';

/**
 * Satu-satunya jalan tulis ke product_journey_events.
 *
 * Migration 010 sengaja tidak memasang CHECK pada `event_name`, supaya event beta baru
 * tidak menuntut migrasi produksi. Konsekuensinya validasi di sini BUKAN kenyamanan
 * melainkan satu-satunya penjaga kardinalitas tabel - `parseJourneyBatch` menolak
 * seluruh kiriman begitu satu nama atau permukaan berada di luar daftar tertutup.
 */
export async function handleProductJourneyEvents(request: Request): Promise<HttpResult | Response> {
  assertTrustedSameOrigin(request);
  try {
    const parsed = parseJourneyBatch(await request.json());
    if (!parsed) {
      return { status: 400, body: { error: 'Event perjalanan tidak valid', code: 'VALIDATION_ERROR' } };
    }
    await recordJourneyEvents(parsed);
    return new Response(null, { status: 204 });
  } catch (error) {
    logger.error('product journey events failed', { err: error });
    return { status: 500, body: { error: 'Event perjalanan tidak dapat disimpan', code: 'INTERNAL_ERROR' } };
  }
}
