'use client';

import { useEffect } from 'react';

type NetworkInformationLike = {
  saveData?: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
};

export default function EnergySaver() {
  useEffect(() => {
    const root = document.documentElement;
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;

    const sync = () => {
      root.classList.toggle('lens-page-hidden', document.hidden);
      root.classList.toggle('lens-save-data', Boolean(connection?.saveData));
      root.classList.toggle('lens-energy-mobile', window.matchMedia('(max-width: 767px)').matches);
    };

    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('resize', sync, { passive: true });
    connection?.addEventListener?.('change', sync);

    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('resize', sync);
      connection?.removeEventListener?.('change', sync);
      root.classList.remove('lens-page-hidden', 'lens-save-data', 'lens-energy-mobile');
    };
  }, []);

  return null;
}
