import { Card } from '@/components/ui/Card';

export default function Loading() {
  return (
    <div className="min-h-screen bg-tv-bg px-4 py-6 text-tv-text sm:px-8" role="status" aria-live="polite">
      <div className="mx-auto max-w-7xl space-y-4 animate-pulse">
        <div className="h-8 w-56 rounded bg-tv-border/70" />
        <div className="h-4 w-80 max-w-full rounded bg-tv-border/50" />
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} padding="none" radius="xl" elevation="none" highlight={false} className="h-28 border-tv-border" />
          ))}
        </div>
        <Card padding="none" radius="xl" elevation="none" highlight={false} className="h-80 border-tv-border" />
        <span className="sr-only">Memuat data SahamLens…</span>
      </div>
    </div>
  );
}
