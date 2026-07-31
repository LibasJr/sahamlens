import { requireUser } from '../../../shared/middleware/require-auth';
import { ValidationError } from '../../../shared/errors/app-error';
import { parseOrThrow } from '../../../shared/validation/parse-or-throw';
// Import langsung dari shared/, BUKAN dari '../../user' - modules/user butuh
// mengimpor modules/watchlist untuk admin/export, jadi arah sebaliknya (watchlist
// -> user) akan bikin circular dependency antar-module. checkProAccess memang
// aslinya didefinisikan di shared/auth/session, modules/user cuma re-export.
import { checkProAccess } from '../../../shared/auth/session';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '../service/watchlist.service';
import { addWatchlistSchema } from '../validator/watchlist.validator';
import type { HttpResult } from '../../../shared/types/http-result.types';

export async function handleListWatchlist(): Promise<HttpResult> {
  const session = await requireUser();
  const items = await getWatchlist(session.id);
  return { status: 200, body: { data: items } };
}

export async function handleAddWatchlist(rawBody: unknown): Promise<HttpResult> {
  const session = await requireUser();
  const input = parseOrThrow(addWatchlistSchema, rawBody);
  const item = await addToWatchlist(session.id, checkProAccess(session), input);
  return { status: 200, body: { success: true, item } };
}

export async function handleRemoveWatchlist(symbol: string | null): Promise<HttpResult> {
  const session = await requireUser();
  if (!symbol) throw new ValidationError('symbol wajib diisi');
  await removeFromWatchlist(session.id, symbol);
  return { status: 200, body: { success: true } };
}
