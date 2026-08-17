/**
 * Endpoint publik/berbiaya tinggi yang WAJIB punya limiter route-level sendiri.
 * `matcher` menjadi sumber metadata untuk regression test proxy. Next.js meminta
 * matcher sebagai literal statis, jadi test memastikan literal config tidak pernah
 * tertinggal ketika policy ini berubah.
 */
export const EXPENSIVE_PUBLIC_API_POLICY = [
  { id: 'dcf', prefix: '/api/dcf/', matcher: '/api/dcf/:path*' },
  { id: 'intrinsic', prefix: '/api/intrinsic/', matcher: '/api/intrinsic/:path*' },
  { id: 'earnings', prefix: '/api/earnings/', matcher: '/api/earnings/:path*' },
  { id: 'compare', exact: '/api/compare', matcher: '/api/compare/:path*' },
  { id: 'flow', prefix: '/api/flow/', matcher: '/api/flow/:path*' },
  { id: 'live', prefix: '/api/live/', matcher: '/api/live/:path*' },
  { id: 'stock-news', prefix: '/api/news/stock/', matcher: '/api/news/stock/:path*' },
] as const;

export function isSelfLimitedExpensiveApi(pathname: string): boolean {
  return EXPENSIVE_PUBLIC_API_POLICY.some((entry) =>
    'exact' in entry ? pathname === entry.exact : pathname.startsWith(entry.prefix),
  );
}
