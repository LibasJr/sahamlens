'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { technicalResearchPath } from '@/shared/navigation/technical-route';

export default function NativeNavigationBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    const handleAnchorClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const url = new URL(anchor.href, window.location.href);

      // Tautan keluar dari bundel desktop tidak boleh menavigasi webview. Validasi
      // sesungguhnya ada di Rust; renderer hanya meneruskan kandidatnya.
      if (url.origin !== window.location.origin) {
        event.preventDefault();
        void invoke('native_open_external', { url: url.href }).catch(() => undefined);
        return;
      }

      if (anchor.target === '_blank') return;

      const match = url.pathname.match(/^\/technical\/([^/]+)\/?$/i);
      if (!match) return;

      event.preventDefault();
      router.push(technicalResearchPath(decodeURIComponent(match[1])));
    };

    document.addEventListener('click', handleAnchorClick, true);
    return () => document.removeEventListener('click', handleAnchorClick, true);
  }, [router]);

  return null;
}
