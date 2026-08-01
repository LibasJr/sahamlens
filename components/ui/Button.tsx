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
  // Gradient biru->ungu (gradient-accent) DIRESERVASI untuk fitur AI saja
  // (AIChat, badge Council) - CTA umum pakai biru solid supaya kesannya
  // tenang/terpercaya, bukan "AI startup generik" di semua tombol.
  primary: 'bg-tv-blue text-white hover:bg-tv-blueHover shadow-1',
  secondary: 'bg-tv-hover text-tv-text border border-tv-border hover:bg-tv-card hover:border-tv-borderLight',
  ghost: 'bg-transparent text-tv-muted hover:text-tv-text hover:bg-white/5',
  danger: 'bg-tv-red text-white hover:bg-tv-redHover shadow-1',
  success: 'bg-tv-green text-white hover:bg-tv-greenHover shadow-1',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5 rounded-sm',
  md: 'text-sm px-4 py-2 rounded-md',
  lg: 'text-base px-5 py-2.5 rounded-md',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, disabled, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 ease-snap',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
          'active:scale-[0.98]',
          VARIANTS[variant],
          SIZES[size],
          className
        )}
        {...props}
      >
        {loading && (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
