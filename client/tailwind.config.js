/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0710',
        night: '#140c1c',
        hexviolet: '#8b2cff',
        toxic: '#7dff3a',
        blood: '#ff2e55',
        paper: '#f5ecd7',
      },
      fontFamily: {
        comic: ['Bangers', 'Impact', 'system-ui', 'sans-serif'],
        pixel: ['"Press Start 2P"', 'monospace'],
      },
      boxShadow: {
        hard: '6px 6px 0 0 #000',
        'hard-sm': '3px 3px 0 0 #000',
        toxic: '0 0 18px 4px rgba(125,255,58,.65)',
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(.2) rotate(-12deg)', opacity: '0' }, '60%': { transform: 'scale(1.15) rotate(4deg)', opacity: '1' }, '100%': { transform: 'scale(1) rotate(-3deg)', opacity: '1' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        aura: { '0%,100%': { boxShadow: '0 0 10px 2px rgba(125,255,58,.5)' }, '50%': { boxShadow: '0 0 22px 7px rgba(125,255,58,.9)' } },
        shake: { '0%,100%': { transform: 'translate(0,0)' }, '25%': { transform: 'translate(-4px,2px)' }, '75%': { transform: 'translate(4px,-2px)' } },
      },
      animation: { pop: 'pop .35s cubic-bezier(.2,1.6,.4,1) both', float: 'float 3s ease-in-out infinite', aura: 'aura 1.6s ease-in-out infinite', shake: 'shake .25s linear 3' },
    },
  },
  plugins: [],
};
