import { requireUser } from '../../../shared/middleware/require-auth';
import { ValidationError } from '../../../shared/errors/app-error';
import { parseOrThrow } from '../../../shared/validation/parse-or-throw';
// Lihat catatan yang sama di watchlist.controller.ts - impor langsung dari shared/
// untuk menghindari circular dependency dengan modules/user (admin/export).
import { checkProAccess, checkProAccessLive } from '../../../shared/auth/session';
import { getAlerts, addAlert, removeAlert } from '../service/alert.service';
import { alertSchema } from '../validator/watchlist.validator';
import type { HttpResult } from '../../../shared/types/http-result.types';

export async function handleListAlerts(): Promise<HttpResult> {
  const session = await requireUser();
  const alerts = await getAlerts(session.id);
  return { status: 200, body: { data: alerts } };
}

export async function handleCreateAlert(rawBody: unknown): Promise<HttpResult> {
  const session = await requireUser();
  const input = parseOrThrow(alertSchema, rawBody);
  const alert = await addAlert(session.id, await checkProAccessLive(session), input);
  return { status: 200, body: { success: true, alert } };
}

export async function handleDeleteAlert(id: string | null): Promise<HttpResult> {
  const session = await requireUser();
  if (!id) throw new ValidationError('id wajib diisi');
  await removeAlert(session.id, id);
  return { status: 200, body: { success: true } };
}
