/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto Mono', 'Courier New', 'monospace'],
        mono: ['Roboto Mono', 'Courier New', 'monospace'],
      },
      colors: {
        accent: '#8100D1',
        'accent-hover': '#6a00ad',
      },
    },
  },
  plugins: [],
};
