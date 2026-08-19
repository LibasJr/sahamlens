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
  /**
   * Header respons tambahan. Ditambahkan supaya controller yang lewat runController bisa
   * ikut menyetel Cache-Control/CDN-Cache-Control seperti route yang memakai
   * NextResponse.json langsung - tanpa itu, satu-satunya cara meng-cache endpoint publik
   * adalah keluar dari adapter, yaitu kehilangan X-Request-Id dan penyamaran error.
   * Tetap framework-agnostic: pasangan nama/nilai biasa, bukan objek Headers milik Next.
   *
   * `X-Request-Id` selalu ditulis adapter SETELAH header ini dipasang, jadi controller
   * tidak bisa menimpanya - kaitan ke baris log server tetap terjamin.
   */
  headers?: Record<string, string>;
}
