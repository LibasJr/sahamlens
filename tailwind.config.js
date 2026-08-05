/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Palet "Lens" (2026-08-06). Nilai token DIGANTI di tempat - nama token
        // tv-* dipertahankan supaya 33 halaman ikut berubah lewat satu diff ini,
        // bukan lewat pencarian-ganti class di tiap file.
        tv: {
          bg: '#0B0F19',
          surface: '#0F1526',
          card: '#12182B',
          cardAlt: '#151C32',
          hover: '#1B2440',
          border: '#1E293B',
          borderLight: '#2B3A55',
          text: '#F1F5F9',
          muted: '#94A3B8',
          green: '#22C55E',
          greenHover: '#16A34A',
          red: '#EF4444',
          redHover: '#DC2626',
          yellow: '#D4AF37',
          warning: '#F59E0B',
          gold: '#EAB308',
          blue: '#3B82F6',
          blueHover: '#2563EB',
          purple: '#8B5CF6',
          accent: '#3B82F6'
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        heading: ['var(--font-inter)', 'sans-serif'],
        display: ['var(--font-inter)', 'sans-serif'],
        // Angka/harga pakai JetBrains Mono: lebar digit benar-benar seragam, jadi
        // kolom harga di tabel tidak bergoyang saat nilainya berubah.
        number: ['var(--font-jetbrains-mono)', 'Consolas', 'monospace'],
        mono: ['var(--font-jetbrains-mono)', 'Consolas', 'Monaco', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      boxShadow: {
        1: '0 1px 2px 0 rgba(0,0,0,0.3)',
        2: '0 4px 12px 0 rgba(0,0,0,0.35)',
        3: '0 12px 32px 0 rgba(0,0,0,0.45)',
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.25)',
      },
      backgroundImage: {
        'glow-blue': 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(11,15,25,0) 70%)',
        'glow-gold': 'radial-gradient(circle, rgba(212,175,55,0.15) 0%, rgba(11,15,25,0) 70%)',
        'glow-purple': 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(11,15,25,0) 70%)',
        // Redesign UI/UX Fase 1 - aksen signature baru: gradient biru->ungu, dua warna
        // yang sudah ada di tv.* (blue #3A86FF, purple #8B5CF6) tapi belum pernah
        // dikombinasikan. Dipakai untuk CTA utama/indikator aktif/badge "AI", bukan
        // warna baru yang menambah kerumitan palet.
        'gradient-accent': 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
        'gradient-accent-soft': 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(139,92,246,0.12) 100%)',
      },
      transitionTimingFunction: {
        settle: 'cubic-bezier(0.16,1,0.3,1)',
        snap: 'cubic-bezier(0.4,0,0.2,1)',
      },
      transitionDuration: {
        250: '250ms',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        fadeIn: 'fadeIn 0.4s cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [],
}
