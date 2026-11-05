import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f5f3ef',
        ink: '#262522',
        muted: '#787571',
        line: '#d9d5cf',
        signal: '#c92c35',
        signalDark: '#8f1d25',
        fog: '#e9e6e1',
      },
      fontFamily: {
        display: ['DM Serif Display', 'Georgia', 'serif'],
        sans: ['DM Sans', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 16px 45px rgba(41, 34, 29, 0.08)',
        soft: '0 8px 24px rgba(41, 34, 29, 0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config
