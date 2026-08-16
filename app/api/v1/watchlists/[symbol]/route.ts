import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleRemoveWatchlist } from '@/modules/watchlist';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';

// RESTful: DELETE /api/v1/watchlists/{symbol} (path param) - gantikan
// DELETE /api/watchlist?symbol=... (query param) yang dipertahankan terpisah
// untuk kompatibilitas mundur.
export async function DELETE(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  return runController(async () => {
    assertTrustedSameOrigin(req);
    const { symbol } = await params;
    return handleRemoveWatchlist(decodeURIComponent(symbol));
  });
}
