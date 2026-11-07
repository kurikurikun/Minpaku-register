import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: '#1f2a2e', sea: { DEFAULT: '#2f6f73', dark: '#245659', light: '#e6f0f0' }, sand: '#f7f4ee' },
    },
  },
  plugins: [],
} satisfies Config;
