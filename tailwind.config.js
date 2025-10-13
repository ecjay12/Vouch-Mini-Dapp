<<<<<<< HEAD
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: { colors: { teal: { 100: '#e6f3f7', 500: '#0d9488', 600: '#0891b2', 800: '#115e59' } } } },
=======
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: {
          100: '#e6f3f7',
          500: '#0d9488',
          600: '#0891b2',
          800: '#115e59'
        }
      }
    }
  },
>>>>>>> 07726ff (Initial commit for Ohana Vouch MiniApp)
  plugins: [],
};