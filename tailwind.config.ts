import type { Config } from 'tailwindcss';

// Monochrome palette: white, greys, black.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111111',
        sea: { DEFAULT: '#111111', dark: '#000000', light: '#f0f0f0' },
        sand: '#f7f7f7',
      },
    },
  },
  plugins: [],
} satisfies Config;
