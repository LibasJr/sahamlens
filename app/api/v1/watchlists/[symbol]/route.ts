import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleRemoveWatchlist } from '@/modules/watchlist';

// RESTful: DELETE /api/v1/watchlists/{symbol} (path param) - gantikan
// DELETE /api/watchlist?symbol=... (query param) yang dipertahankan terpisah
// untuk kompatibilitas mundur.
export async function DELETE(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return runController(async () => handleRemoveWatchlist(decodeURIComponent(symbol)));
}
