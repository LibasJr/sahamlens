// Satu-satunya tempat "buang komentar sebelum mencocokkan pola" didefinisikan.
//
// Kenapa ini berkas tersendiri: repo ini beberapa kali salah menghitung kode karena
// prosa. `scripts/audit-adoption-ratchet.mjs` pernah menghitung `fetch('/api/...')`
// yang ditulis di komentar dokumentasi sebagai pemanggilan nyata, dan gerbang
// tipografi ini sendiri menjelaskan dirinya dengan menulis `text-[10px]` di komentar.
// Kalau setiap gerbang menyalin regex-nya sendiri, cepat atau lambat salinannya
// berbeda dan salah satunya menghitung prosa lagi.
//
// Dipakai oleh: scripts/audit-typography-ratchet.mjs, __tests__/typography-migrated-surfaces.test.ts.

/** Buang komentar blok dan komentar baris. Komentar baris menghindari `://` (URL). */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}