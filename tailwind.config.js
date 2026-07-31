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
        tv: {
          bg: '#0F141D',
          surface: '#0D1F3C',
          card: '#152238',
          hover: '#1E2C4A',
          border: '#2C3A5A',
          borderLight: '#3A4B75',
          text: '#F3F4F6',
          muted: '#8B94B6',
          green: '#10B981',
          greenHover: '#059669',
          red: '#EF4444',
          redHover: '#DC2626',
          yellow: '#D4AF37',
          warning: '#F59E0B',
          gold: '#EAB308',
          blue: '#3A86FF',
          blueHover: '#2563EB',
          purple: '#8B5CF6',
          accent: '#3A86FF'
        }
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        heading: ['var(--font-sora)', 'Inter', 'sans-serif'],
        display: ['var(--font-sora)', 'Inter', 'sans-serif'],
        number: ['var(--font-space-grotesk)', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'Monaco', 'monospace'],
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
        'glow-blue': 'radial-gradient(circle, rgba(58,134,255,0.15) 0%, rgba(10,25,49,0) 70%)',
        'glow-gold': 'radial-gradient(circle, rgba(212,175,55,0.15) 0%, rgba(10,25,49,0) 70%)',
        'glow-purple': 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(10,25,49,0) 70%)',
      },
      transitionTimingFunction: {
        settle: 'cubic-bezier(0.16,1,0.3,1)',
        snap: 'cubic-bezier(0.4,0,0.2,1)',
      },
      transitionDuration: {
        250: '250ms',
      },
    },
  },
  plugins: [],
}
