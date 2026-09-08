/**
 * Status validasi model LensScore.
 *
 * Skor dapat tetap ditampilkan sebagai ringkasan indikator yang dihitung dari data
 * pasar nyata, tetapi tidak boleh berubah menjadi ajakan BUY/HOLD/SELL sebelum
 * dibuktikan pada data point-in-time melalui backtest yang sudah ditetapkan sebelumnya.
 * Mengubah status ini ke `true` mensyaratkan artefak validasi yang dapat diaudit;
 * bukan sekadar hasil satu kali dari data yang sama dipakai menyetel parameter.
 */
export interface LensScoreValidationStatus {
  validated: boolean;
  reasonCode: 'MODEL_UNVALIDATED';
  message: string;
}

const STATUS: LensScoreValidationStatus = {
  validated: false,
  reasonCode: 'MODEL_UNVALIDATED',
  message:
    'LensScore belum memiliki validasi backtest point-in-time yang dapat diaudit, sehingga LensAI tidak boleh menyajikannya sebagai model yang terbukti meramal hasil. LensScore tetap boleh dipakai sebagai dasar derivasi arah riset (CENDERUNG BELI/JUAL/TAHAN) yang berasal dari data nyata terverifikasi, dengan penjelasan alasan, transparansi status validasi, dan penutup DYOR.',
};

export function getLensScoreValidationStatus(): LensScoreValidationStatus {
  return STATUS;
}

export function isLensScoreValidated(): boolean {
  return STATUS.validated;
}
