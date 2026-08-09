import React from 'react';
import { cn } from '../../lib/utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border border-tv-blue/80 bg-tv-blue text-white shadow-[0_10px_28px_rgba(79,140,255,0.18)] hover:bg-tv-blueHover hover:shadow-[0_14px_34px_rgba(79,140,255,0.24)]',
  secondary: 'border border-white/[0.08] bg-white/[0.045] text-tv-text hover:border-white/[0.14] hover:bg-white/[0.075]',
  ghost: 'border border-transparent bg-transparent text-tv-muted hover:bg-white/[0.05] hover:text-tv-text',
  danger: 'border border-tv-red/70 bg-tv-red text-white hover:bg-tv-redHover',
  success: 'border border-tv-green/70 bg-tv-green text-[#06130E] hover:bg-tv-greenHover',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-8 rounded-lg px-3 text-[11px]',
  md: 'min-h-10 rounded-xl px-4 text-xs',
  lg: 'min-h-11 rounded-xl px-5 text-sm',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, disabled, className, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 ease-snap active:scale-[0.985]',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
export default Button;
