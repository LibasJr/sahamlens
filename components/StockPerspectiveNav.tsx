'use client';

import type React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Satu emiten, empat sudut pandang.
 *
 * MASALAH YANG DIPECAHKAN (redesign v2, PRD §18): Technical, Fundamental, arus dana, dan
 * valuasi hidup di rute yang berbeda dan masing-masing punya headernya sendiri. Dari sisi
 * pengguna itu terbaca sebagai empat aplikasi yang kebetulan menerima kode saham yang
 * sama - bukan empat cara melihat satu perusahaan. Tidak ada satu pun tempat di layar yang
 * menyatakan bahwa keempatnya bicara tentang emiten yang sama.
 *
 * RUTE SENGAJA TIDAK DIUBAH. Menyatukan keempatnya menjadi satu rute bertab berarti
 * memindahkan empat halaman dengan gerbang akses, paywall, dan data-fetch masing-masing -
 * risiko besar untuk masalah yang murni soal navigasi. Yang disatukan adalah tampilannya.
 *
 * "Flow" menunjuk ke jangkar di halaman Technical, bukan rute tersendiri, karena di situlah
 * panel arus dana asing sungguhan berada (BandarFlowPro). `/ownership-flow` BUKAN
 * padanannya: halaman itu komposisi kepemilikan KSEI se-universe, bukan arus dana emiten
 * ini. Menautkannya ke sana akan menjanjikan hal yang berbeda dari yang dibuka.
 */

const FLOW_ANCHOR_ID = 'lens-flow';

/**
 * "Technical Summary" (breakdown LensScore + alasan teratas) duduk jauh di bawah chart,
 * analyzer, dan bukti teknikal di `/dashboard`. Pengguna yang cuma ingin melihat skornya
 * harus menggulir melewati seluruh halaman untuk sampai ke sana.
 *
 * Karena itu ia ikut ke bar sudut pandang sebagai tab jangkar - sama pola dengan Flow:
 * bukan rute baru, cuma jalan pintas ke bagian yang memang sudah ada.
 */
export const TECHNICAL_SUMMARY_ANCHOR_ID = 'analysis-detail';

/**
 * Kartu ringkasan itu HANYA dirender saat `viewMode === 'full'` (lihat
 * `useDashboardAnalysis`). Tautan jangkar biasa akan mati persis untuk pengguna yang
 * paling butuh jalan pintasnya: yang sedang di mode ringkas, tempat kartunya belum ada
 * di DOM. Jadi tab ini juga menyiarkan event; `/dashboard` yang mendengarkannya membuka
 * mode penuh lalu menggulir sendiri.
 */
export const OPEN_TECHNICAL_SUMMARY_EVENT = 'sahamlens:open-technical-summary';

type Perspective = {
  id: string;
  label: string;
  /** `pathname` ikut masuk karena satu sudut pandang bisa punya lebih dari satu rumah -
   *  lihat catatan `/dashboard` di bawah. */
  href: (code: string, pathname: string) => string;
  /** Rute yang membuat tab ini aktif. Kosong = tab lompat-jangkar, tidak pernah aktif. */
  activePaths?: string[];
};

/**
 * `/dashboard` adalah RUMAH KEDUA sudut pandang Technical, bukan halaman asing.
 *
 * Sidebar menamainya "LensTechnical" - nama yang sama persis dengan tab pertama - jadi
 * sebelum ini pengguna berdiri di halaman bernama Technical sambil melihat tab Technical
 * yang mati, bersama tiga tab mati lainnya. Empat tab mati sekaligus tidak terbaca
 * sebagai "kamu di antara sudut pandang", melainkan sebagai navigasi rusak.
 *
 * Sekadar menyalakannya justru menciptakan masalah kedua yang dicatat aslinya: tab yang
 * tampak aktif tetapi memindahkan pengguna ke `/technical/[symbol]` saat diklik. Karena
 * itu tab aktif SELALU menunjuk ke halaman tempat pengguna sedang berdiri - di
 * `/dashboard` ia menunjuk ke `/dashboard?symbol=...`, bukan ke rute technical.
 *
 * `/moat`, `/earnings`, `/dividend`, dan `/pattern` sengaja TIDAK ikut: mereka Tools,
 * bukan sudut pandang, jadi nol tab menyala di sana memang keadaan yang benar.
 */
const DASHBOARD_PATH = '/dashboard';

const PERSPECTIVES: Perspective[] = [
  {
    id: 'technical',
    label: 'Technical',
    href: (code, pathname) => (
      isUnder(pathname, DASHBOARD_PATH)
        ? `${DASHBOARD_PATH}?symbol=${code}.JK`
        : `/technical/${code}.JK`
    ),
    activePaths: ['/technical', DASHBOARD_PATH],
  },
  { id: 'fundamental', label: 'Fundamental', href: (code) => `/fundamental?symbol=${code}.JK`, activePaths: ['/fundamental'] },
  { id: 'flow', label: 'Flow', href: (code) => `/technical/${code}.JK#${FLOW_ANCHOR_ID}` },
  { id: 'valuation', label: 'Valuation', href: (code) => `/dcf?symbol=${code}.JK`, activePaths: ['/dcf'] },
  {
    id: 'summary',
    label: 'Summary',
    href: (code) => `${DASHBOARD_PATH}?symbol=${code}.JK#${TECHNICAL_SUMMARY_ANCHOR_ID}`,
  },
];

function isUnder(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export type PerspectiveTab = {
  id: string;
  label: string;
  href: string;
  active: boolean;
};

/**
 * Tab yang harus dirender untuk `symbol` saat pengguna berada di `pathname`.
 *
 * Dipisah dari komponennya supaya aturan "tab aktif tidak boleh memindahkan pengguna"
 * bisa diuji sungguhan - repo ini tidak punya jsdom maupun Playwright, jadi apa pun yang
 * hanya hidup di dalam JSX praktis tidak tergerbang.
 */
export function perspectiveTabsFor(
  symbol: string | null | undefined,
  pathname: string,
): PerspectiveTab[] {
  const code = stockCodeFor(symbol);
  if (!code) return [];
  return PERSPECTIVES.map((perspective) => ({
    id: perspective.id,
    label: perspective.label,
    href: perspective.href(code, pathname),
    active: Boolean(perspective.activePaths?.some((route) => isUnder(pathname, route))),
  }));
}

/** Nama indeks yang beredar sebagai "kode" di UI ini.
 *
 * "IHSG" LOLOS pola empat huruf kapital, jadi tanpa daftar ini halaman
 * /technical/IHSG - yang memang mengirim `currentTicker="IHSG"` - akan menampilkan tab
 * Fundamental dan Valuation yang menuju `?symbol=IHSG.JK`: emiten yang tidak ada.
 * Terukur lewat test sebelum sempat sampai ke pengguna. */
const NAMA_INDEKS = new Set(['IHSG', 'LQ45', 'JKSE']);

/** Kode emiten 4 huruf, atau null kalau yang diberikan bukan emiten (indeks, kosong). */
export function stockCodeFor(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const raw = symbol.trim().toUpperCase().replace(/\.JK$/i, '');
  // Indeks tidak punya fundamental perusahaan, valuasi DCF, maupun catatan Net Foreign
  // Buy/Sell di Bursa. Menawarkan tab itu akan menuntun ke halaman yang pasti kosong.
  if (!/^[A-Z]{4}$/.test(raw)) return null;
  if (NAMA_INDEKS.has(raw)) return null;
  return raw;
}

/** Kalau `/dashboard` belum terpasang, tidak ada yang mendengarkan dan Link tetap
 *  melakukan navigasinya seperti biasa.
 *
 *  Klik yang membuka tab baru sengaja dilewati: halaman yang ditinggalkan tidak ikut
 *  berpindah, jadi membuka kartu ringkasannya di situ cuma menggeser layar tanpa diminta. */
function announceSummaryIntent(event: React.MouseEvent<HTMLAnchorElement>) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  window.dispatchEvent(new CustomEvent(OPEN_TECHNICAL_SUMMARY_EVENT));
}

export default function StockPerspectiveNav({ symbol }: { symbol: string | null | undefined }) {
  const pathname = usePathname();
  const code = stockCodeFor(symbol);
  const tabs = perspectiveTabsFor(symbol, pathname ?? '');
  if (!code || tabs.length === 0) return null;

  return (
    <nav
      aria-label={`Sudut pandang analisis ${code}`}
      className="lens-stock-nav -mx-1 flex items-center gap-1 overflow-x-auto px-1"
    >
      {tabs.map(({ id, label, href, active }) => {
        return (
          <Link
            key={id}
            href={href}
            onClick={id === 'summary' ? announceSummaryIntent : undefined}
            aria-current={active ? 'page' : undefined}
            // 44px di SEMUA lebar, tanpa varian yang mengecilkannya di md+. Tablet
            // mewarisi ukuran kontrol desktop sementara alat masukannya tetap jari -
            // itu justru rentang yang paling sering meleset saat ditekan.
            className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 lens-label transition-colors ${
              active
                ? 'bg-tv-blue/10 text-tv-blue'
                : 'text-tv-muted hover:bg-white/[0.05] hover:text-tv-text'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
