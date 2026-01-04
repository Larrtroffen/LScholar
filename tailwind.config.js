/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-main': '#1A1B26',
        'bg-card': '#24283B',
        'text-main': '#A9B1D6',
        'accent': '#7AA2F7',
        'success': '#9ECE6A',
        'warning': '#E0AF68',
        'error': '#F7768E',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
