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
          bg: 'rgb(var(--lens-bg) / <alpha-value>)',
          surface: 'rgb(var(--lens-surface) / <alpha-value>)',
          card: 'rgb(var(--lens-card) / <alpha-value>)',
          cardAlt: 'rgb(var(--lens-card-alt) / <alpha-value>)',
          hover: 'rgb(var(--lens-hover) / <alpha-value>)',
          border: 'rgb(var(--lens-border) / <alpha-value>)',
          borderLight: 'rgb(var(--lens-border-light) / <alpha-value>)',
          text: 'rgb(var(--lens-text) / <alpha-value>)',
          muted: 'rgb(var(--lens-muted) / <alpha-value>)',
          // Aksen ikut variabel CSS supaya punya pasangan mode terang - lihat
          // app/globals.css. Hex mati di sini dulu membuat hijau/merah untung-rugi
          // gagal kontras di mode terang (2,26:1 dan 2,99:1).
          green: 'rgb(var(--lens-green) / <alpha-value>)',
          greenHover: 'rgb(var(--lens-green-hover) / <alpha-value>)',
          red: 'rgb(var(--lens-red) / <alpha-value>)',
          redHover: 'rgb(var(--lens-red-hover) / <alpha-value>)',
          yellow: 'rgb(var(--lens-yellow) / <alpha-value>)',
          warning: 'rgb(var(--lens-warning) / <alpha-value>)',
          gold: 'rgb(var(--lens-gold) / <alpha-value>)',
          blue: 'rgb(var(--lens-blue) / <alpha-value>)',
          blueHover: 'rgb(var(--lens-blue-hover) / <alpha-value>)',
          purple: 'rgb(var(--lens-purple) / <alpha-value>)',
          accent: 'rgb(var(--lens-blue) / <alpha-value>)'
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
        1: '0 1px 2px 0 rgba(0,0,0,0.26)',
        2: '0 10px 30px -14px rgba(0,0,0,0.55)',
        3: '0 22px 70px -22px rgba(0,0,0,0.72)',
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
        // Dulu dua hex mati (#4F8CFF -> #8B7CFF). Keduanya terlalu muda untuk menopang
        // teks putih: label "LensAI" pada tombol melayang terukur ~3,2:1 - gagal AA di
        // ukuran 12px. Sekarang memakai pasangan padat yang memberi putih 6,7:1 dan
        // 7,1:1, sekaligus ikut berubah bersama tema.
        'gradient-accent': 'linear-gradient(135deg, rgb(var(--lens-blue-solid)) 0%, rgb(var(--lens-purple-solid)) 100%)',
        'gradient-accent-soft': 'linear-gradient(135deg, rgba(79,140,255,0.13) 0%, rgba(139,124,255,0.13) 100%)',
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
