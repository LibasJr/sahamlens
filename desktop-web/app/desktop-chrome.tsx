'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Button } from '@/components/ui/Button';

export default function DesktopChrome({ children }: { children: ReactNode }) {
  const appWindow = () => getCurrentWindow();

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-tv-bg">
      <header
        data-tauri-drag-region
        className="flex h-10 shrink-0 select-none items-center border-b border-tv-border bg-[#090d16] pl-3"
      >
        <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-2">
          <Image src="/sahamlens-logo.png" alt="" width={22} height={22} className="h-[22px] w-[22px] rounded-md object-contain" priority />
          <span data-tauri-drag-region className="text-xs font-semibold tracking-tight text-tv-text">SahamLens Desktop</span>
          <span data-tauri-drag-region className="rounded border border-tv-blue/25 bg-tv-blue/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-tv-blue">Beta</span>
        </div>

        <div className="flex h-full shrink-0" aria-label="Kontrol jendela">
          <Button variant="bare" size="none" type="button" aria-label="Minimalkan" title="Minimalkan" onClick={() => void appWindow().minimize()} className="h-full w-12 rounded-none text-tv-muted hover:bg-white/[0.07] hover:text-tv-text">
            <Minus className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="bare" size="none" type="button" aria-label="Maksimalkan atau pulihkan" title="Maksimalkan atau pulihkan" onClick={() => void appWindow().toggleMaximize()} className="h-full w-12 rounded-none text-tv-muted hover:bg-white/[0.07] hover:text-tv-text">
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button variant="bare" size="none" type="button" aria-label="Tutup" title="Tutup" onClick={() => void appWindow().close()} className="h-full w-12 rounded-none text-tv-muted hover:bg-red-600 hover:text-white">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto [&_.lens-app-shell]:!min-h-full">{children}</div>
    </div>
  );
}
