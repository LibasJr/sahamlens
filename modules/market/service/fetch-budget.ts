/**
 * Anggaran waktu untuk pemindaian massal (universe screener).
 *
 * KENAPA INI ADA. `fetchScreenerUniverse()` mengambil data Yahoo untuk ~50-200 emiten
 * dalam batch paralel tanpa batas waktu. Satu permintaan yang menggantung membuat seluruh
 * batch menggantung, sehingga job tidak pernah memanggil finishJobRun(): barisnya tetap
 * RUNNING, kunci konkurensi tetap dipegang (tik berikutnya DILEWATI), dan baris itu baru
 * ditutup sebagai FAILED oleh rekonsiliasi SLA - dengan pesan "melewati batas SLA" yang
 * menyembunyikan sebab sebenarnya. Terbukti di produksi: run 2026-09-24 07:15 berakhir
 * 07:45 tanpa hasil, dan tick 07:30 hilang sama sekali dari job_run_log.
 *
 * Modul ini murni (tanpa I/O) supaya bisa diuji; pemanggilnya yang menyediakan waktu.
 */

export interface AnggaranWaktu {
  mulaiMs: number;
  anggaranMs: number;
}

export function mulaiAnggaran(sekarangMs: number, anggaranMs: number): AnggaranWaktu {
  return { mulaiMs: sekarangMs, anggaranMs };
}

export function sisaAnggaran(state: AnggaranWaktu, sekarangMs: number): number {
  return state.mulaiMs + state.anggaranMs - sekarangMs;
}

export function anggaranHabis(state: AnggaranWaktu, sekarangMs: number): boolean {
  return sisaAnggaran(state, sekarangMs) <= 0;
}

/**
 * Batas waktu untuk satu batch: tidak pernah melebihi sisa anggaran, dan tidak pernah
 * melebihi batas per-batch supaya satu batch lambat tidak menghabiskan seluruh anggaran.
 */
export function batasBatchMs(state: AnggaranWaktu, sekarangMs: number, batasPerBatchMs: number): number {
  return Math.max(1, Math.min(sisaAnggaran(state, sekarangMs), batasPerBatchMs));
}

/**
 * Jalankan janji dengan batas waktu. Bila lewat batas, kembalikan nilai cadangan
 * (pemanggil memakai `null` per-ticker) dan jangan menggantung. Janji aslinya tidak
 * dibatalkan - hasilnya diabaikan, bukan ditunggu.
 */
export async function denganBatasWaktu<T>(janji: Promise<T>, ms: number, cadangan: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      janji,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(cadangan), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}