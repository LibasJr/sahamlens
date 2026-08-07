# LensAI Smart Provider Rotation v1

Perubahan:
- `buildCombos()` tetap deterministik dan tetap menjadi ranking kualitas dasar.
- `generateAI()` sekarang memakai `buildSmartAttemptOrder()`:
  - hanya combo sehat yang diprioritaskan;
  - request pertama dirotasi antar combo sehat pada warm instance;
  - 429 => cooldown 5 menit (naik jika gagal berulang);
  - timeout => cooldown 45 detik (naik jika gagal berulang);
  - 401/403 => cooldown 30 menit;
  - 404 => cooldown 60 menit;
  - 5xx => cooldown singkat;
  - sukses menghapus status gagal/cooldown combo tersebut.
- Jika seluruh combo sedang cooldown, satu combo dengan waktu cooldown paling dekat selesai
  dipakai sebagai probe agar layanan tidak mati total.
- Tidak membutuhkan Redis/DB tambahan; state health/cursor disimpan di `globalThis`
  pada warm serverless instance. Cold start mereset state, yang aman untuk routing.
- Tidak mengubah system prompt, knowledge LensAI, authentication, scoring, TP/CL, atau database.

Catatan:
- Ini smart rotation, bukan random murni.
- Base ranking kualitas tetap dapat diaudit lewat `buildCombos()`.
