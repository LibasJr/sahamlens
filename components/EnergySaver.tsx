'use client';

import { useEffect } from 'react';

type NetworkInformationLike = {
  saveData?: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
};

type BatteryManagerLike = {
  charging: boolean;
  level: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

export default function EnergySaver() {
  useEffect(() => {
    const root = document.documentElement;
    const nav = navigator as Navigator & {
      connection?: NetworkInformationLike;
      getBattery?: () => Promise<BatteryManagerLike>;
    };

    let batteryManager: BatteryManagerLike | null = null;

    const sync = () => {
      const isHidden = document.hidden;
      const isSaveData = Boolean(nav.connection?.saveData);
      const isMobile = window.matchMedia('(max-width: 767px)').matches;
      const isLowBattery = Boolean(batteryManager && !batteryManager.charging && batteryManager.level <= 0.2);

      root.classList.toggle('lens-page-hidden', isHidden);
      root.classList.toggle('lens-save-data', isSaveData);
      root.classList.toggle('lens-energy-mobile', isMobile);
      root.classList.toggle('lens-battery-saver', isLowBattery || isSaveData);
    };

    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('resize', sync, { passive: true });
    nav.connection?.addEventListener?.('change', sync);

    if (typeof nav.getBattery === 'function') {
      nav.getBattery().then((bm) => {
        batteryManager = bm;
        sync();
        bm.addEventListener?.('chargingchange', sync);
        bm.addEventListener?.('levelchange', sync);
      }).catch(() => {});
    }

    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('resize', sync);
      nav.connection?.removeEventListener?.('change', sync);
      if (batteryManager) {
        batteryManager.removeEventListener?.('chargingchange', sync);
        batteryManager.removeEventListener?.('levelchange', sync);
      }
      root.classList.remove('lens-page-hidden', 'lens-save-data', 'lens-energy-mobile', 'lens-battery-saver');
    };
  }, []);

  return null;
}
