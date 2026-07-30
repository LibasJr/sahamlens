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
        genz: {
          base: '#0A1931',
          surface: '#152238',
          surfaceHover: '#1E2C4A',
          border: '#2C3A5A',
          text: '#F3F4F6',
          muted: '#8B94B6',
          lime: '#3A86FF', // Changed to Accent Blue
          limeHover: '#2563EB',
          purple: '#D4AF37', // Changed to Accent Gold
          purpleHover: '#B8860B',
          green: '#10B981', // Professional Green
          red: '#EF4444',   // Professional Red
        },
        tv: {
          bg: '#0A1931', 
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
          blue: '#3A86FF', 
          blueHover: '#2563EB',
          purple: '#8B5CF6',
          accent: '#3A86FF'
        }
      },
      fontFamily: {
        heading: ['Inter', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'Monaco', 'monospace'],
      },
      boxShadow: {
        'neo': '4px 4px 0px 0px rgba(58, 134, 255, 1)',
        'neo-lime': '4px 4px 0px 0px rgba(58, 134, 255, 1)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.25)',
      },
      backgroundImage: {
        'glow-purple': 'radial-gradient(circle, rgba(212,175,55,0.15) 0%, rgba(10,25,49,0) 70%)',
        'glow-lime': 'radial-gradient(circle, rgba(58,134,255,0.15) 0%, rgba(10,25,49,0) 70%)',
      }
    },
  },
  plugins: [],
}
