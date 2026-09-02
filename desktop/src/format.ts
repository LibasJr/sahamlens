const idNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const idCurrency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Rupiah is displayed in whole rupiah; feeds with fractional values are rounded once here. */
export function formatIdr(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : idCurrency.format(Math.round(value));
}

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 2): string {
  return value == null || !Number.isFinite(value)
    ? '—'
    : maximumFractionDigits === 2 ? idNumber.format(value) : new Intl.NumberFormat('id-ID', { maximumFractionDigits }).format(value);
}

export function formatPercent(value: number | null | undefined, fraction = false): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const shown = fraction ? value * 100 : value;
  return `${shown >= 0 ? '+' : ''}${formatNumber(shown)}%`;
}
