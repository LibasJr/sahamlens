export const metadata = {
  title: 'Decision Lab Stack Role | SahamLens',
  robots: { index: false, follow: false },
};

const roles = [
  ['Lead', 'Ambil keputusan akhir dan jaga konsistensi aturan.', 'Keputusan final yang patuh v1.6'],
  ['Analyst', 'Hitung skor, baca indikator, rangkum angka.', 'Ringkasan berbasis data real'],
  ['Reviewer', 'Validasi hasil dan cari konflik sinyal.', 'Verdict grounded / challenge'],
  ['Security', 'Cek kebocoran, auth boundary, exposure.', 'Temuan hardening'],
  ['Frontend', 'Jaga penyajian hasil dan UX.', 'Tampilan yang jelas dan ringkas'],
  ['Ops', 'Jaga service, health check, deploy.', 'Status produksi yang sehat'],
  ['Research', 'Cari konteks berita dan evidence.', 'Evidensi pendukung'],
];

export default function DecisionLabRoleStackPage() {
  return (
    <main className="min-h-screen bg-tv-bg px-4 py-8 text-tv-text sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-3xl font-bold">Stack Role Decision Lab</h1>
        <p className="max-w-3xl text-sm text-tv-muted">
          Struktur role SahamLens untuk decision lab. LensScore v1.6.1 tetap sumber skor, review layer hanya menguatkan atau menolak berbasis evidence real.
        </p>
        <section className="rounded-2xl border border-tv-border bg-tv-card p-5">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-tv-green/30 bg-tv-green/10 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-tv-muted">1. Otomatis</div>
              <div className="mt-2 font-semibold text-tv-text">Scan & status blokir</div>
              <p className="mt-2 text-sm text-tv-muted">Data real, LensScore, klasifikasi sinyal, dan blokir stale/data quality/model/broker.</p>
            </div>
            <div className="rounded-xl border border-tv-blue/30 bg-tv-blue/10 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-tv-muted">2. Tampilan role</div>
              <div className="mt-2 font-semibold text-tv-text">Lead, Analyst, Reviewer, Security, Frontend, Ops, Research</div>
              <p className="mt-2 text-sm text-tv-muted">Ini diagram kerja tim agar alur gampang dibaca, bukan daftar model AI independen.</p>
            </div>
            <div className="rounded-xl border border-tv-yellow/30 bg-tv-yellow/10 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-tv-muted">3. AI backend</div>
              <div className="mt-2 font-semibold text-tv-text">Decision Engine + Hybrid Analyst</div>
              <p className="mt-2 text-sm text-tv-muted">Hybrid review hanya untuk kandidat lolos syarat, lalu model fallback dicoba berurutan memakai evidence real.</p>
            </div>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          {roles.map(([role, task, output], index) => {
            const palette = [
              'border-tv-yellow/30 bg-tv-yellow/10',
              'border-tv-blue/30 bg-tv-blue/10',
              'border-tv-green/30 bg-tv-green/10',
              'border-tv-red/30 bg-tv-red/10',
              'border-tv-purple/30 bg-tv-purple/10',
              'border-tv-border bg-tv-bg/70',
              'border-tv-border bg-tv-bg/70',
            ][index] ?? 'border-tv-border bg-tv-card';
            return (
              <article key={role} className={`rounded-2xl border p-5 ${palette}`}>
                <h2 className="text-xl font-semibold">{role}</h2>
                <p className="mt-2 text-sm text-tv-muted">{task}</p>
                <p className="mt-3 text-sm font-medium text-tv-text">Output: {output}</p>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
