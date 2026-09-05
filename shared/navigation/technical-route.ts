/**
 * The website keeps its indexable stock-detail URL. The bundled Tauri build uses the
 * client-rendered LensTechnical workspace because arbitrary dynamic paths cannot be
 * emitted efficiently by Next static export.
 */
export function technicalResearchPath(symbol: string): string {
  const routeSymbol = symbol.trim().toUpperCase();
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return `/dashboard?symbol=${encodeURIComponent(routeSymbol)}`;
  }
  return `/technical/${encodeURIComponent(routeSymbol)}`;
}
