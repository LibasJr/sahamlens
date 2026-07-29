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
          base: '#0A0E27',
          surface: '#0F1222',
          surfaceHover: '#1A1E35',
          border: '#2A2F4C',
          text: '#F3F4F6',
          muted: '#8B94B6',
          lime: '#D6FF00',
          limeHover: '#C2E600',
          purple: '#7A5CFF',
          purpleHover: '#6947FF',
          green: '#00F090', // Signal Green
          red: '#FF3366',   // Signal Red
        },
        tv: {
          bg: '#0A0E27', // Override existing to new base
          card: '#0F1222',
          hover: '#1A1E35',
          border: '#2A2F4C',
          borderLight: '#363a45',
          text: '#F3F4F6',
          muted: '#8B94B6',
          green: '#00F090',
          greenHover: '#00D680',
          red: '#FF3366',
          redHover: '#E62E5C',
          yellow: '#f0b90b',
          blue: '#7A5CFF', // Override with purple
          blueHover: '#6947FF',
          purple: '#ab47bc',
          accent: '#D6FF00' // Override with lime
        }
      },
      fontFamily: {
        heading: ['Sora', 'Space Grotesk', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'Monaco', 'monospace'],
      },
      boxShadow: {
        'neo': '4px 4px 0px 0px rgba(122, 92, 255, 1)',
        'neo-lime': '4px 4px 0px 0px rgba(214, 255, 0, 1)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      backgroundImage: {
        'glow-purple': 'radial-gradient(circle, rgba(122,92,255,0.2) 0%, rgba(10,14,39,0) 70%)',
        'glow-lime': 'radial-gradient(circle, rgba(214,255,0,0.15) 0%, rgba(10,14,39,0) 70%)',
      }
    },
  },
  plugins: [],
}
