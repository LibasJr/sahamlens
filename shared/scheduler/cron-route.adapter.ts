import { runController } from '@/shared/http/next-response.adapter';

/**
 * Cron-specific response boundary.
 *
 * Cron handlers intentionally keep their existing scheduler authentication and job
 * semantics (QStash signature, CRON_SECRET, concurrency guards, partial-success
 * payloads). This adapter only standardises the HTTP boundary so scheduled jobs get
 * the same X-Request-Id/error masking guarantees as user-facing controllers.
 *
 * The handler may return an existing Response/NextResponse; runController preserves
 * that body/status/headers and only attaches the authoritative request id.
 */
export function runCronRoute(req: Request, handler: () => Promise<Response>): Promise<Response> {
  return runController(handler, req);
}
