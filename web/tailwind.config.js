/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        poe: {
          gold: '#c6a15b',
          'gold-dark': '#9f7840',
          ember: '#7f3326',
          dark: '#120f0d',
          darker: '#0b0908',
          card: '#1c1714',
          border: '#3a2f27',
          mist: '#9b8b76',
          stone: '#2a221d',
        },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'sans-serif'],
        display: ['var(--font-display)', 'serif'],
      },
    },
  },
  plugins: [],
};
