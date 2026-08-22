import { logger } from '@/shared/logger/logger';

/**
 * Satu panel gagal tidak boleh menjatuhkan seluruh halaman.
 *
 * KENAPA ADA. Halaman admin memuat setiap panelnya dalam satu `Promise.all`. Satu promise
 * yang reject membuat seluruh `await` melempar, dan halamannya gugur ke `app/error.tsx` -
 * jadi tabel yang belum dimigrasi di panel paling pinggir bisa menghilangkan Payment Order,
 * Kesehatan Operasional, dan seluruh jalur diagnosa operasional sekaligus. Justru saat ada
 * yang salah di server, halaman inilah yang paling dibutuhkan.
 *
 * Terjadi 20 Agustus 2026: `product_journey_events` sampai ke produksi lewat deploy otomatis
 * sebelum migrasi 010 dijalankan, dan `/admin` seluruhnya ikut jatuh sampai migrasinya
 * dijalankan.
 */

export type PanelResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

/**
 * Muat data satu panel. Kegagalan menjadi nilai, bukan lemparan.
 *
 * `label` masuk ke pesan yang dilihat admin, jadi tulis sebagaimana panelnya dinamai di
 * layar - itulah yang membuat pesannya berguna: menyebut BAGIAN MANA yang tidak tersedia,
 * bukan sekadar "terjadi kesalahan".
 */
export async function loadPanel<T>(label: string, load: () => Promise<T>): Promise<PanelResult<T>> {
  try {
    return { ok: true, value: await load() };
  } catch (error) {
    // Detailnya ke log, bukan ke DOM. Galat basis data membawa nama host, port, dan kadang
    // kredensial di dalam pesannya; halaman ini memang hanya untuk admin, tapi tangkapan
    // layar admin beredar di tiket dukungan dan grup chat.
    logger.error('panel admin gagal dimuat', { panel: label, err: error });
    return {
      ok: false,
      message: `Panel "${label}" tidak dapat dimuat. Panel lain di halaman ini tidak terpengaruh; periksa log aplikasi untuk sebabnya.`,
    };
  }
}

/** Nilai panel, atau `fallback` kalau panelnya gagal. */
export function panelValueOr<T>(result: PanelResult<T>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
