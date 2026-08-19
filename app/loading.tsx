// TIDAK memakai <main>: AppShell sudah merender satu-satunya <main> halaman, dan
// landmark <main> bersarang membuat pembaca layar mengumumkan dua wilayah utama pada
// halaman yang sama. Di sini cukup <div>.
//
// Balok placeholder memakai .lens-skeleton, bukan bg-white/10 seperti sebelumnya. Kelas
// palet mentah itu adalah putih 10% - di tema terang ia duduk di atas latar yang sudah
// hampir putih dan praktis lenyap, jadi layar pemuatan tampak kosong, bukan memuat.
// .lens-skeleton memakai token yang berbalik arah antar tema dan dijaga
// __tests__/skeleton-visibility.test.ts.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
      <div className="lens-skeleton h-8 w-48 rounded" />
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="lens-skeleton h-36 rounded-xl border border-tv-border" />
        ))}
      </div>
      <span className="sr-only" role="status">Memuat konten</span>
    </div>
  );
}
