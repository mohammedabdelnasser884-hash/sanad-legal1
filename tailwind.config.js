/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        premium: {
          bg:   '#070d1a',
          card: '#0d1a2e',
          gold: '#D4AF37',
        },
      },
      fontFamily: {
        sans: ['Cairo', 'sans-serif'],
      },
      boxShadow: {
        'neon-gold':       '0 0 25px rgba(212,175,55,0.15)',
        'neon-blue':       '0 0 25px rgba(59,130,246,0.15)',
        'premium-shadow':  '0 15px 35px -10px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
}
