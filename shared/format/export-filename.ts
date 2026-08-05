// Nama file konsisten untuk semua tombol export gambar (fundamental & teknikal) -
// format: SahamLens_{Prefix}_{TICKER-tanpa-.JK}_{YYYY-MM-DD}.png
export function buildExportFileName(
  prefix: 'Fundamental' | 'Technical',
  ticker: string,
  date: Date = new Date()
): string {
  const cleanTicker = ticker.replace('.JK', '').toUpperCase();
  const isoDate = date.toISOString().split('T')[0];
  return `SahamLens_${prefix}_${cleanTicker}_${isoDate}.png`;
}
