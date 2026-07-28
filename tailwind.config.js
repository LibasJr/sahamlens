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
          bg: '#131722',
          card: '#1e222d',
          hover: '#2a2e39',
          border: '#2a2e39',
          borderLight: '#363a45',
          text: '#d1d4dc',
          muted: '#787b86',
          green: '#089981',
          greenHover: '#00b894',
          red: '#f23645',
          redHover: '#ff4d4d',
          yellow: '#f0b90b',
          blue: '#2962ff',
          blueHover: '#1e53e5',
          purple: '#ab47bc',
          accent: '#00bcd4'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'Monaco', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    },
  },
  plugins: [],
}
