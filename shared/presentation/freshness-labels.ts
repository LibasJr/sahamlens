import type { Freshness } from '@/shared/http/freshness';

/**
 * Satu cara menuliskan umur data ke layar.
 *
 * `classifyFreshness()` sudah memutuskan DELAYED / EOD / STALE / UNKNOWN di server, tetapi
 * setiap permukaan yang menampilkannya dulu mengarang kalimatnya sendiri - jadi data
 * dengan status yang sama terbaca berbeda di halaman yang berbeda, dan yang paling penting
 * (STALE) tidak selalu kelihatan sebagai peringatan.
 *
 * Aturan yang dijaga di sini:
 *   - STALE SELALU berwarna caution dan menyebut dirinya tertunda. Menyembunyikannya
 *     membuat angka berumur tiga hari terbaca seperti harga hari ini.
 *   - UNKNOWN bukan "segar". Sumber yang tidak menyertakan waktu bar harga dinyatakan
 *     apa adanya, bukan diam-diam dianggap baru.
 *   - Tidak ada nilai 'REALTIME': Yahoo Finance gratis tidak pernah realtime untuk IDX.
 */

export interface FreshnessPresentation {
  /** Ringkas untuk baris tabel/kartu. */
  shortLabel: string;
  /** Untuk blok metadata yang punya ruang lebih. */
  label: string;
  /** Kalimat pendukung - menyebut waktu bar harga kalau tersedia. */
  detail: string;
  /** Kelas warna token; caution hanya untuk yang memang perlu dicermati. */
  tone: string;
}

export function formatJakartaTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)} WIB`;
}

export function describeFreshness(
  freshness: Freshness | string | null | undefined,
  dataTimestamp: string | null | undefined,
): FreshnessPresentation {
  const jam = formatJakartaTime(dataTimestamp);

  switch (freshness) {
    case 'DELAYED':
      return {
        shortLabel: jam ? `Diperbarui ${jam}` : 'Delayed ~15 menit',
        label: 'Delayed ~15 menit',
        detail: jam ? `Bar terakhir ${jam}` : 'Sumber harga tidak realtime.',
        tone: 'text-tv-text',
      };
    case 'EOD':
      return {
        shortLabel: jam ? `Penutupan ${jam}` : 'Penutupan (EOD)',
        label: 'Penutupan (EOD)',
        detail: jam ? `Bar terakhir ${jam}` : 'Di luar jam bursa.',
        tone: 'text-tv-text',
      };
    case 'STALE':
      return {
        shortLabel: jam ? `Tertunda · ${jam}` : 'Data mungkin tertunda',
        label: 'Data mungkin tertunda',
        detail: jam ? `Terakhir diperbarui ${jam}` : 'Lebih tua dari satu hari bursa.',
        tone: 'text-tv-yellow',
      };
    default:
      return {
        shortLabel: 'Umur data tidak diketahui',
        label: 'Umur data tidak diketahui',
        detail: 'Sumber tidak menyertakan waktu bar harga.',
        tone: 'text-tv-muted',
      };
  }
}
