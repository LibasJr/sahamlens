const WIB_TIME_ZONE = 'Asia/Jakarta';
const ISO_TIMESTAMP_PATTERN = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})\b/g;

/**
 * Format timestamp untuk teks yang DILIHAT pengguna Indonesia.
 *
 * Penyimpanan/API tetap boleh memakai ISO-8601 UTC (`...Z`) karena itu format mesin yang
 * tidak ambigu. Batas presentasi mengubahnya ke WIB supaya pengguna tidak perlu menghitung
 * +7 jam sendiri. `formatToParts` dipakai agar hasil tidak bergantung pada tanda baca
 * bawaan ICU/browser, sedangkan label zona dipatok `WIB` agar konsisten di semua runtime.
 */
export function formatWibDateTime(value: string | number | Date | null | undefined): string | null {
  if (value == null || value === '') return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!byType.day || !byType.month || !byType.year || !byType.hour || !byType.minute) return null;

  return `${byType.day} ${byType.month} ${byType.year}, ${byType.hour}:${byType.minute} WIB`;
}

/**
 * Mengubah ISO timestamp yang tertanam di blok teks user-facing, tanpa menyentuh tanggal
 * polos seperti `2026-08-28` (tanggal perdagangan/as-of tetap punya arti sendiri).
 */
export function formatIsoTimestampsToWib(input: string): string {
  return input.replace(ISO_TIMESTAMP_PATTERN, (raw) => formatWibDateTime(raw) ?? raw);
}

export { WIB_TIME_ZONE };
