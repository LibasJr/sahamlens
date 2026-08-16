// FEATURE FLAG OWNERSHIP FLOW.
//
// Dua gerbang TERPISAH, dan pemisahan ini disengaja:
//
//   OWNERSHIP_FLOW_ENABLED            -> modul terlihat (menu, API, admin).
//   OWNERSHIP_FLOW_INGESTION_ENABLED  -> cron boleh MENULIS ke database.
//
// Tahap sekarang: modul boleh tampil (menampilkan status "menunggu verifikasi
// sumber"), tetapi ingestion produksi TETAP MATI sampai audit sumber di VPS
// berhasil. Menggabungkan keduanya menjadi satu flag akan memaksa pilihan
// salah: entah menyembunyikan seluruh fitur, atau menyalakan penulisan data
// dari sumber yang belum terbukti strukturnya.
//
// Keduanya default FALSE di kode (fail-closed). Deployment yang belum menyetel
// apa pun tidak akan diam-diam menyalakan fitur atau menembak server KSEI.

function readBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

function readInt(key: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[key]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(raw)));
}

export interface OwnershipFlowConfig {
  /** Modul terlihat di UI/API. */
  enabled: boolean;
  /** Cron boleh dieksekusi sama sekali. */
  cronEnabled: boolean;
  /**
   * Cron boleh MENULIS observasi ke database. Ini BUKAN satu-satunya syarat -
   * `canIngest()` juga menuntut sumbernya berstatus VERIFIED.
   */
  ingestionEnabled: boolean;
  /** Batas request paralel ke sumber. Sengaja kecil - lihat fetcher. */
  maxConcurrency: number;
  /** Timeout per request (ms). */
  timeoutMs: number;
  /** Jeda antar request dalam satu worker (ms) - rate limit sopan. */
  minDelayMs: number;
  /** Batas ticker per eksekusi cron. 0 = tanpa batas. */
  universeLimit: number;
  /** TTL cache presentasi (detik). */
  cacheTtlSec: number;
}

export function getOwnershipFlowConfig(): OwnershipFlowConfig {
  return {
    enabled: readBool('OWNERSHIP_FLOW_ENABLED', false),
    cronEnabled: readBool('OWNERSHIP_FLOW_CRON_ENABLED', false),
    ingestionEnabled: readBool('OWNERSHIP_FLOW_INGESTION_ENABLED', false),
    // 3 request paralel. Ini bukan angka yang boleh dinaikkan sembarangan:
    // sumbernya server publik milik lembaga, bukan API berbayar dengan kuota.
    maxConcurrency: readInt('OWNERSHIP_FLOW_MAX_CONCURRENCY', 3, 1, 8),
    timeoutMs: readInt('OWNERSHIP_FLOW_TIMEOUT_MS', 15_000, 2_000, 60_000),
    minDelayMs: readInt('OWNERSHIP_FLOW_MIN_DELAY_MS', 250, 0, 10_000),
    universeLimit: readInt('OWNERSHIP_FLOW_UNIVERSE_LIMIT', 0, 0, 2_000),
    // Data kepemilikan tidak berubah intraday. TTL 30 menit hanya meredam beban
    // baca; ia TIDAK boleh cukup panjang untuk membuat observasi baru tertahan
    // sampai esok hari, dan TIDAK PERNAH membuat data basi terlihat segar -
    // freshness dihitung dari observedDate, bukan dari umur cache.
    cacheTtlSec: readInt('OWNERSHIP_FLOW_CACHE_TTL_SEC', 1_800, 60, 21_600),
  };
}

/** User-Agent yang jujur menyebut siapa kita dan ke mana harus mengadu. */
export const OWNERSHIP_FLOW_USER_AGENT =
  'SahamLens-OwnershipFlow/1.0 (+https://sahamlens.id; kontak: admin@sahamlens.id)';
