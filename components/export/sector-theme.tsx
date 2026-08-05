import {
  Landmark, Fuel, Mountain, ShoppingBag, ShoppingCart, HeartPulse, Cpu, Radio,
  Building2, Zap, Factory, type LucideIcon,
} from 'lucide-react';

export interface SectorTheme {
  Icon: LucideIcon;
  chipBg: string;
  chipText: string;
  chipBorder: string;
}

const DEFAULT_THEME: SectorTheme = {
  Icon: Building2,
  chipBg: 'bg-tv-accent/20',
  chipText: 'text-tv-accent',
  chipBorder: 'border-tv-accent/30',
};

// Tema visual per sector - HANYA warna/icon (dekoratif), TIDAK mengubah metrik yang
// ditampilkan (itu tetap logic bank-vs-non-bank yang sudah ada di FundamentalExportCard).
// Dicocokkan ke field `sector`/`industry` ASLI dari Yahoo assetProfile (field yang sama
// sudah dipakai app/fundamental/page.tsx) - sector kosong/tidak dikenali jatuh ke
// DEFAULT_THEME, bukan ditebak.
//
// Class Tailwind di tiap entri DITULIS LITERAL PENUH, bukan dirangkai dari variabel
// (`bg-tv-${x}`) - Tailwind JIT scan string statis di source file, string hasil
// concat/template tidak akan ke-generate ke CSS akhir.
const SECTOR_THEMES: { match: (s: string) => boolean; theme: SectorTheme }[] = [
  {
    match: (s) => s.includes('financial') || s.includes('bank'),
    theme: { Icon: Landmark, chipBg: 'bg-tv-blue/20', chipText: 'text-tv-blue', chipBorder: 'border-tv-blue/30' },
  },
  {
    match: (s) => s.includes('energy'),
    theme: { Icon: Fuel, chipBg: 'bg-tv-warning/20', chipText: 'text-tv-warning', chipBorder: 'border-tv-warning/30' },
  },
  {
    match: (s) => s.includes('material') || s.includes('mining'),
    theme: { Icon: Mountain, chipBg: 'bg-tv-yellow/20', chipText: 'text-tv-yellow', chipBorder: 'border-tv-yellow/30' },
  },
  {
    match: (s) => s.includes('consumer cyclical') || s.includes('consumer discretionary'),
    theme: { Icon: ShoppingBag, chipBg: 'bg-tv-purple/20', chipText: 'text-tv-purple', chipBorder: 'border-tv-purple/30' },
  },
  {
    match: (s) => s.includes('consumer defensive') || s.includes('consumer staples'),
    theme: { Icon: ShoppingCart, chipBg: 'bg-tv-green/20', chipText: 'text-tv-green', chipBorder: 'border-tv-green/30' },
  },
  {
    match: (s) => s.includes('health'),
    theme: { Icon: HeartPulse, chipBg: 'bg-tv-red/20', chipText: 'text-tv-red', chipBorder: 'border-tv-red/30' },
  },
  {
    match: (s) => s.includes('technology'),
    theme: { Icon: Cpu, chipBg: 'bg-tv-blue/20', chipText: 'text-tv-blue', chipBorder: 'border-tv-blue/30' },
  },
  {
    match: (s) => s.includes('communication'),
    theme: { Icon: Radio, chipBg: 'bg-tv-purple/20', chipText: 'text-tv-purple', chipBorder: 'border-tv-purple/30' },
  },
  {
    match: (s) => s.includes('real estate') || s.includes('property'),
    theme: { Icon: Building2, chipBg: 'bg-tv-gold/20', chipText: 'text-tv-gold', chipBorder: 'border-tv-gold/30' },
  },
  {
    match: (s) => s.includes('utilities') || s.includes('infrastructure'),
    theme: { Icon: Zap, chipBg: 'bg-tv-warning/20', chipText: 'text-tv-warning', chipBorder: 'border-tv-warning/30' },
  },
  {
    match: (s) => s.includes('industrial'),
    theme: { Icon: Factory, chipBg: 'bg-tv-blueHover/20', chipText: 'text-tv-blueHover', chipBorder: 'border-tv-blueHover/30' },
  },
];

export function getSectorTheme(sector?: string, industry?: string): SectorTheme {
  const haystack = `${sector || ''} ${industry || ''}`.toLowerCase();
  if (!haystack.trim()) return DEFAULT_THEME;
  const found = SECTOR_THEMES.find((entry) => entry.match(haystack));
  return found ? found.theme : DEFAULT_THEME;
}
