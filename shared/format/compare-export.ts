export interface CompareExportRow {
  label: string;
  a: unknown;
  b: unknown;
  winner?: string | null;
  reason?: string | null;
}

export interface CompareExportInput {
  symbol1: string;
  symbol2: string;
  price1?: number | null;
  price2?: number | null;
  rows: CompareExportRow[];
  conclusion?: string | null;
  generatedAt?: Date;
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function displayTicker(symbol: string): string {
  return symbol.replace('.JK', '');
}

function formatPrice(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `Rp ${Math.round(value).toLocaleString('id-ID')}`
    : 'N/A';
}

export function buildCompareCsv(input: CompareExportInput): string {
  const generatedAt = input.generatedAt ?? new Date();
  const symbol1 = displayTicker(input.symbol1);
  const symbol2 = displayTicker(input.symbol2);
  const tableRows: unknown[][] = [
    ['Harga Terakhir', formatPrice(input.price1), formatPrice(input.price2), '', 'Harga per lembar tidak dipakai untuk menentukan pemenang antar emiten.'],
    ...input.rows.map((row) => [
      row.label,
      row.a,
      row.b,
      row.winner && row.winner !== '-' ? displayTicker(row.winner) : 'Seri / tidak dibandingkan',
      row.reason ?? '',
    ]),
  ];

  const lines: unknown[][] = [
    ['SahamLens Stock Compare', `${symbol1} vs ${symbol2}`],
    ['Dibuat', generatedAt.toLocaleString('id-ID')],
    [],
    ['Metrik', symbol1, symbol2, 'Unggul', 'Penjelasan'],
    ...tableRows,
  ];

  if (input.conclusion) {
    lines.push([], ['Kesimpulan', input.conclusion]);
  }

  // BOM membuat Excel Windows mengenali UTF-8 (termasuk simbol Rupiah/teks Indonesia).
  return `\uFEFF${lines.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}
