'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { technicalResearchPath } from '@/shared/navigation/technical-route';

export default function NativeNavigationBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    const redirectTechnicalLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank') return;

      const url = new URL(anchor.href, window.location.href);
      const match = url.pathname.match(/^\/technical\/([^/]+)\/?$/i);
      if (!match) return;

      event.preventDefault();
      router.push(technicalResearchPath(decodeURIComponent(match[1])));
    };

    document.addEventListener('click', redirectTechnicalLink, true);
    return () => document.removeEventListener('click', redirectTechnicalLink, true);
  }, [router]);

  return null;
}
