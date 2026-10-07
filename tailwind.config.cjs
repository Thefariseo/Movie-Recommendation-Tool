/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');
const forms        = require('@tailwindcss/forms');
const typography   = require('@tailwindcss/typography');
const lineClamp    = require('@tailwindcss/line-clamp');
const aspectRatio  = require('@tailwindcss/aspect-ratio');


module.exports = {
  darkMode: 'class',

    content: [
    './index.html',
   './src/**/*.jsx',
    './src/**/*.js'
  ],

  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { xl: '1280px' }
    },
    extend: {
      // A wide, even grotesque for everything, set in capitals for display, and
      // an editorial serif for long reads.
      fontFamily: {
        sans: ['"Albert Sans"', ...defaultTheme.fontFamily.sans],
        serif: ['Newsreader', 'Georgia', ...defaultTheme.fontFamily.serif]
      },
      // Sharp, editorial corners: cards and buttons are nearly square.
      borderRadius: {
        sm: '1px',
        DEFAULT: '2px',
        md: '2px',
        lg: '3px',
        xl: '3px',
        '2xl': '4px',
        '3xl': '6px'
      },
      colors: {
        brand: {
          DEFAULT: '#001489',
          light:   '#8292dc',
          dark:    '#00106d'
        },
        // The accent is PANTONE 19-1650 TCX Biking Red (#77212E); the existing
        // indigo classes take it on.
        indigo: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
          // Variables (src/index.css), so a film's sheet can lay its own colour
          // on the same scale (src/utils/filmColor.js).
          .map((step) => [step, `rgb(var(--accent-${step}) / <alpha-value>)`])),
        // Pure neutral greys, without the blue cast of slate.
        slate: {
          50: '#f7f7f7',
          100: '#efefef',
          200: '#e6e6e6',
          300: '#c8c8c8',
          400: '#9b9b9b',
          500: '#7d7d7d',
          600: '#5f5f5f',
          700: '#3f3f3f',
          800: '#2a2a2a',
          900: '#181818',
          950: '#0a0a0a'
        }
      },
      boxShadow: {
        card:    '0 2px 6px -1px rgba(0,0,0,0.1)',
        'card-lg':'0 4px 14px -3px rgba(0,0,0,0.15)'
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: {
          '0%':  { transform: 'translateY(8px)', opacity: '0' },
          '100%':{ transform: 'translateY(0)',  opacity: '1' }
        }
      },
      animation: {
        fade:      'fadeIn 0.35s ease-in-out both',
        'slide-up':'slideUp 0.45s ease-out both'
      }
    }
  },

  plugins: [
    forms,
    typography,
    lineClamp,
    aspectRatio
  
  ]
};