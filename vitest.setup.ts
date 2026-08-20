import { beforeEach } from 'vitest';

// Cadangan cache di memori (shared/cache/redis-cache.ts) disimpan di globalThis supaya
// bertahan melewati hot reload Next. Konsekuensinya ia juga bertahan melewati batas antar
// test: satu test menghangatkan sebuah key, test berikutnya memasang mock baru yang lalu
// tidak pernah dipanggil. Kegagalannya muncul sebagai "expected to be called at least
// once" pada mock yang kelihatan benar - menyesatkan, dan makin sering seiring makin
// banyak jalur yang memakai getOrCompute.
//
// Dibersihkan di sini, satu kali untuk seluruh suite, bukan ditambal per berkas test.
//
// Map-nya disentuh lewat globalThis, BUKAN lewat import dari redis-cache. Berkas setup
// ini dimuat oleh SETIAP berkas test, jadi satu import saja menyeret seluruh graf modul
// redis-cache (termasuk klien Redis) ke 258 berkas yang sebagian besar tidak memerlukannya.
// Terukur saat pertama ditulis dengan import: durasi suite 77 detik -> 126 detik.
beforeEach(() => {
  (globalThis as { __sahamlensMemoryCache?: Map<string, unknown> }).__sahamlensMemoryCache?.clear();
});
