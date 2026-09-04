/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pro: {
          bg: '#080C0E',
          surface: '#0E1418',
          card: '#131A1F',
          cardHover: '#182229',
          border: '#202B32',
          borderStrong: '#2E3D47',
          accent: '#D5FF45',
          accentMuted: '#24330E',
          text: '#F3F4F6',
          textMuted: '#94A3B8',
          textSubtle: '#64748B',
          profit: '#22C55E',
          profitBg: '#11291B',
          loss: '#EF4444',
          lossBg: '#2E1517',
          cyan: '#38BDF8',
          purple: '#A855F7',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
        sans: ['Inter', 'Segoe UI', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
