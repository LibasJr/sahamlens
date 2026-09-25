/**
 * Helper murni rute /api/cron/research-refresh - penyegaran bukti validasi.
 *
 * Sebelum ini, "Uji Target & Cut Loss" (TP/CL Lab) dan "Uji Intraday" hanya bisa
 * dijalankan dengan menekan tombol di panel admin: runnya masuk antrean, worker
 * memprosesnya, dan TIDAK ADA apa pun yang menjadwalkannya. Akibatnya bukti validasi
 * membeku tanpa alarm (TP/CL terakhir 2026-08-30, uji intraday terakhir 2026-09-13).
 * Rute ini hanya MEMICU ULANG mesin yang sudah ada dengan protokol beku yang sama:
 * tidak mengubah ambang, bobot, kriteria, atau protokol OOS.
 */

export const SEMINGGU_JAM = 24 * 7;

export type KeputusanSegarkan = {
  action: 'CATAT' | 'LEWATI' | 'TERKENDALA';
  reason: string;
  umurJam: number | null;
};

export interface MasukanKeputusan {
  aktif: number;
  terakhirSelesaiIso: string | null;
  sekarang: Date;
  maxUmurJam: number;
}

export function hitungUmurJam(terakhirIso: string | null, sekarang: Date): number | null {
  if (!terakhirIso) return null;
  const waktu = new Date(terakhirIso).getTime();
  if (!Number.isFinite(waktu)) return null;
  return (sekarang.getTime() - waktu) / 3_600_000;
}

export function putuskanSegarkan(input: MasukanKeputusan): KeputusanSegarkan {
  const umurJam = hitungUmurJam(input.terakhirSelesaiIso, input.sekarang);

  if (input.aktif > 0) {
    return { action: 'LEWATI', reason: 'SEDANG_DIPROSES', umurJam };
  }
  if (!input.terakhirSelesaiIso) {
    return { action: 'CATAT', reason: 'BELUM_PERNAH_ADA_RUN', umurJam: null };
  }
  if (umurJam == null) {
    return { action: 'CATAT', reason: 'TANGGAL_TERAKHIR_TIDAK_TERBACA', umurJam: null };
  }
  if (umurJam < 0) {
    return { action: 'LEWATI', reason: 'TANGGAL_TERAKHIR_DI_MASA_DEPAN', umurJam };
  }
  if (umurJam < input.maxUmurJam) {
    return { action: 'LEWATI', reason: 'MASIH_SEGAR', umurJam };
  }
  return { action: 'CATAT', reason: 'SUDAH_KEDALUWARSA', umurJam };
}

/** Ambil stempel penyelesaian terbaru dari daftar run (status apa pun yang sudah selesai). */
export function stempelTerbaru(
  runs: ReadonlyArray<{ selesaiIso: string | null; status: string }>,
  statusSelesai: readonly string[]
): string | null {
  const stempel = runs
    .filter((r) => statusSelesai.includes(r.status))
    .map((r) => r.selesaiIso)
    .filter((s): s is string => Boolean(s))
    .sort();
  return stempel.at(-1) ?? null;
}