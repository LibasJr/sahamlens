import React from 'react';
import { cn } from '../../lib/utils/cn';

type BadgeVariant = 'neutral' | 'success' | 'danger' | 'warning' | 'gold' | 'info';
type BadgeSize = 'sm' | 'md';
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> { variant?: BadgeVariant; dot?: boolean; size?: BadgeSize; }
// Ukuran huruf DIHAPUS dari sini dengan sengaja: lantai keterbacaan di globals.css
// (`html .text-[10px]` dst.) menaikkan SEMUA cabangnya ke 13px, jadi kedua varian
// responsif di atas tidak pernah benar-benar berlaku. Yang tersisa cuma efek
// sampingnya - kotak lencana menggelembung karena padding masih disetel untuk 10px.
// `.lens-chip` adalah pengecualian yang memang sudah disiapkan untuk peran ini
// (12px + line-height 1); primitif lencana kanoniknya sekarang ikut memakainya.
const SIZES = { sm: 'px-2 py-0.5', md: 'px-2.5 py-1' };
const VARIANTS = {
  neutral: 'border-white/[0.07] bg-white/[0.045] text-tv-muted', success: 'border-tv-green/15 bg-tv-green/10 text-tv-green',
  danger: 'border-tv-red/15 bg-tv-red/10 text-tv-red', warning: 'border-tv-warning/15 bg-tv-warning/10 text-tv-warning',
  gold: 'border-tv-gold/15 bg-tv-gold/10 text-tv-gold', info: 'border-tv-blue/15 bg-tv-blue/10 text-tv-blue',
};
const DOT_COLOR = { neutral: 'bg-tv-muted', success: 'bg-tv-green', danger: 'bg-tv-red', warning: 'bg-tv-warning', gold: 'bg-tv-gold', info: 'bg-tv-blue' };
export function Badge({ variant = 'neutral', dot = false, size = 'sm', className, children, ...props }: BadgeProps) {
  return <span className={cn('lens-chip inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-[0.12em]', SIZES[size], VARIANTS[variant], className)} {...props}>
    {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOT_COLOR[variant])} />}{children}
  </span>;
}
export default Badge;
