export interface CookieToSet {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure?: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    path: string;
    maxAge?: number;
  };
}

// Bentuk hasil controller yang framework-agnostic dipakai SEMUA module - adapter di
// app/api/**/route.ts (lewat shared/http/next-response.adapter.ts) yang mengubahnya
// jadi NextResponse sungguhan. Controller sendiri tidak pernah mengimpor next/server,
// supaya tetap gampang di-unit-test tanpa mock Next.js.
export interface HttpResult<T = unknown> {
  status: number;
  body: T;
  cookiesToSet?: CookieToSet[];
  cookiesToClear?: string[];
  /** Kalau diisi, adapter melakukan redirect (path relatif/absolut) alih-alih NextResponse.json(). */
  redirectTo?: string;
}
