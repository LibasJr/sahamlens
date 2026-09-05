# Bundled desktop web target

Target ini mengekspor UI SahamLens dari komponen `app/` dan `components/` yang sama
menjadi aset statis untuk Tauri. Backend, database, API route, dan secret tidak ikut
masuk ke installer.

Request `/api/*` diteruskan oleh command Rust hanya ke `https://sahamlens.id/api/*`.
Login desktop memakai bearer token karena cookie HTTP-only milik website tidak tersedia
di origin lokal Tauri.

Rute detail `/technical/[symbol]` pada website tetap dipertahankan untuk SEO. Di desktop,
tautan tersebut dibuka di `/dashboard?symbol=...`, yaitu workspace LensTechnical client
yang sama, agar static export tidak menggandakan aset untuk hampir seribu emiten.

`desktop/src` tetap dipertahankan sementara sebagai rollback untuk UI Vite lama.
Build rollback dapat diperiksa dengan `npm --prefix desktop run build:native`, dan
server pengembangannya dengan `npm --prefix desktop run dev:native`.
