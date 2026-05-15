/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#d2ab84',
          hover:   '#c49870',
          light:   '#fee7ef',
        },
        border: {
          DEFAULT: '#f0e6d8',
        },
        cabanas: {
          dark:    '#111111',
          text:    '#333333',
          soft:    '#888888',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
        btn:  '10px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease forwards',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
