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
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans]
      },
      colors: {
        brand: {
          DEFAULT: '#6366f1',
          light:   '#a5b4fc',
          dark:    '#4f46e5'
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