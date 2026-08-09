export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
      <div className="h-8 w-48 animate-pulse rounded bg-white/10" />
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-36 animate-pulse rounded-xl border border-white/10 bg-white/5" />)}
      </div>
    </main>
  );
}
