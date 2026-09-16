export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e6f5f1',
          100: '#c2e6dc',
          500: '#2a8f76',
          600: '#1a6b5a',
          700: '#0f4a3d',
          800: '#0a3229',
        }
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Syne', 'sans-serif'],
      }
    }
  },
  plugins: []
}
