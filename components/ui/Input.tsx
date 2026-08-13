import React from 'react';
import { cn } from '../../lib/utils/cn';

type InputSize = 'sm' | 'md' | 'lg';
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: InputSize;
}
const SIZES: Record<InputSize, string> = { sm: 'h-11 px-3 text-base sm:h-9 sm:text-xs', md: 'h-11 px-3.5 text-base sm:h-10 sm:text-sm', lg: 'h-12 px-4 text-base sm:h-11 sm:text-sm' };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, rightIcon, size = 'md', className, id, ...props }, ref) => {
    // `id || props.name` saja TIDAK cukup. Formulir login tidak mengoper keduanya, jadi
    // inputId menjadi undefined - hasilnya <label htmlFor={undefined}> dan <input
    // id={undefined}>: labelnya tampil di layar tapi TIDAK tersambung secara program.
    // Terukur di DOM produksi: input email dan password sama-sama tanpa label, tanpa
    // aria-label, tanpa aria-labelledby. Pembaca layar hanya dapat placeholder, dan
    // placeholder bukan label (WCAG 3.3.2 & 4.1.2).
    //
    // useId() memberi cadangan yang stabil antara server dan klien, jadi setiap pemakai
    // Input - login, daftar, lupa/reset password, portfolio - langsung ikut sembuh tanpa
    // harus menambah id satu per satu.
    const generatedId = React.useId();
    const inputId = id || props.name || generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    return (
      <div className="w-full">
        {label && <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-tv-muted sm:text-xs">{label}</label>}
        <div className="relative">
          {leftIcon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tv-muted">{leftIcon}</span>}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className={cn(
              'w-full rounded-xl border border-white/[0.08] bg-black/15 text-tv-text shadow-inner placeholder:text-tv-muted/60',
              'transition-all duration-150 focus:border-tv-blue/65 focus:bg-black/20 focus:outline-none focus:ring-2 focus:ring-tv-blue/10',
              SIZES[size], leftIcon && 'pl-9', rightIcon && 'pr-9',
              error && 'border-tv-red/60 focus:border-tv-red focus:ring-tv-red/10', className,
            )}
            {...props}
          />
          {rightIcon && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-tv-muted">{rightIcon}</span>}
        </div>
        {error && <p id={errorId} className="mt-1 text-sm font-medium text-tv-red sm:text-[11px]">{error}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';
export default Input;
