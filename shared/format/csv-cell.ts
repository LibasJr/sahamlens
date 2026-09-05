const FORMULA_PREFIX = /^[=+@\t\r]|^-(?!\d+(?:[.,]\d+)?$)/;

export function csvCell(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const safe = typeof value === 'string' && FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
