// Estimasi volume "penuh sehari" dari volume yang baru terkumpul SEBAGIAN sesi bursa
// (audit integritas data 2026-08-03, temuan M-02; diperketat 2026-08-05 untuk P2-20).
//
// SEBELUMNYA volume hari berjalan (`volToday`/`currentVol`, yang selama jam bursa masih
// PARSIAL - baru sebagian sesi yang lewat) dibandingkan langsung dengan rata-rata volume
// 10-20 HARI PENUH tanpa penyesuaian. Pukul 10:00 WIB misalnya baru ~15-20% sesi
// berlalu, jadi saham yang menuju volume 2x normal baru mencatat rasio ~0.3-0.4x -
// ambang volume (`>= 1.5` valid, `>= 2.0` sangat tinggi, deteksi breakout/akumulasi) bias
// ke bawah secara sistematis SEPANJANG HARI, lalu tiba-tiba "benar" setelah bursa tutup.
//
// PENTING: fungsi-fungsi di sini HANYA boleh dipakai di route/service yang mengambil
// data LIVE saat request masuk (harga & volume hari berjalan) - TIDAK PERNAH dipakai di
// modules/technical/service/analyzers/ (analyzer murni yang dipakai ulang oleh
// backtest/precompute atas bar HISTORIS yang sudah closed) atau di
// modules/backtest/service/precompute.service.ts, karena bar historis sudah final/
// lengkap dan tidak boleh "diperbesar" seolah masih separuh sesi.
const IDX_TIMEZONE = 'Asia/Jakarta';
const SESSION_OPEN_MINUTES = 9 * 60; // 09:00 WIB
// 15:00 WIB - pendekatan sesi kontinu IDX pada hari biasa (mengabaikan jeda istirahat
// siang & perbedaan jam tutup hari Jumat, didokumentasikan sebagai aproksimasi, bukan
// jadwal resmi bursa per hari).
const SESSION_CLOSE_MINUTES = 15 * 60;
const MIN_ELAPSED_FRACTION = 0.05; // lantai 5% - cegah pembagian nyaris nol di menit awal buka

// Profil kumulatif volume harian berbentuk U: porsi besar terjadi di pembukaan dan
// menjelang penutupan, bukan merata per menit. Angka ini adalah prior konservatif untuk
// IDX ketika data intraday per emiten belum tersedia. Ia sengaja diekspor untuk diuji,
// tetapi pemanggil produksi tetap lewat estimateFullDayVolume().
//
// [HIPOTESIS TERBATAS] Belum dikalibrasi per sektor/emiten/jam Jumat. Ini tetap lebih
// aman daripada model linear karena tidak mengasumsikan 09:30 baru 8,3% volume harian;
// di pasar nyata pembukaan biasanya jauh lebih tebal.
const U_SHAPE_CUMULATIVE_PROFILE = [
  { minute: 0, fraction: 0.00 },
  { minute: 30, fraction: 0.18 },
  { minute: 60, fraction: 0.28 },
  { minute: 120, fraction: 0.42 },
  { minute: 180, fraction: 0.50 },
  { minute: 240, fraction: 0.62 },
  { minute: 300, fraction: 0.78 },
  { minute: 360, fraction: 1.00 },
] as const;

function nowPartsWIB(): { weekday: number; minutesSinceMidnight: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IDX_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[map.weekday] ?? -1,
    minutesSinceMidnight: parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10),
    dateKey: `${map.year}-${map.month}-${map.day}`,
  };
}

/** Senin-Jumat, dalam jendela 09:00-15:00 WIB (aproksimasi, lihat catatan di atas). */
export function isIdxMarketHoursNow(): boolean {
  const { weekday, minutesSinceMidnight } = nowPartsWIB();
  if (weekday < 1 || weekday > 5) return false;
  return minutesSinceMidnight >= SESSION_OPEN_MINUTES && minutesSinceMidnight < SESSION_CLOSE_MINUTES;
}

/** Tanggal kalender WIB hari ini, format YYYY-MM-DD - dipakai pemanggil untuk memastikan
 * bar TERAKHIR dari histori yang di-fetch benar-benar bar HARI INI (bukan bar historis
 * biasa yang kebetulan diproses saat jam bursa berjalan), sebelum estimasi diterapkan. */
export function todayDateKeyWIB(): string {
  return nowPartsWIB().dateKey;
}

export function sessionVolumeProgressFraction(minutesSinceOpen: number): number {
  if (!Number.isFinite(minutesSinceOpen) || minutesSinceOpen <= 0) return MIN_ELAPSED_FRACTION;

  const totalSessionMinutes = SESSION_CLOSE_MINUTES - SESSION_OPEN_MINUTES;
  const minutes = Math.min(totalSessionMinutes, Math.max(0, minutesSinceOpen));

  for (let i = 1; i < U_SHAPE_CUMULATIVE_PROFILE.length; i++) {
    const prev = U_SHAPE_CUMULATIVE_PROFILE[i - 1];
    const next = U_SHAPE_CUMULATIVE_PROFILE[i];
    if (minutes <= next.minute) {
      const span = next.minute - prev.minute;
      const pos = span > 0 ? (minutes - prev.minute) / span : 0;
      const fraction = prev.fraction + (next.fraction - prev.fraction) * pos;
      return Math.max(MIN_ELAPSED_FRACTION, Math.min(1, fraction));
    }
  }
  return 1;
}

/** Estimasi volume penuh sehari dari volume yang baru terkumpul sebagian sesi. HANYA
 * valid dipanggil kalau pemanggil sudah memverifikasi isIdxMarketHoursNow() DAN bar yang
 * sedang diproses adalah bar hari ini (todayDateKeyWIB()) - lihat catatan di atas. */
export function estimateFullDayVolume(partialVolume: number): number {
  const { minutesSinceMidnight } = nowPartsWIB();
  const elapsedMinutes = Math.min(SESSION_CLOSE_MINUTES, Math.max(SESSION_OPEN_MINUTES, minutesSinceMidnight)) - SESSION_OPEN_MINUTES;
  const fraction = sessionVolumeProgressFraction(elapsedMinutes);
  return partialVolume / fraction;
}
