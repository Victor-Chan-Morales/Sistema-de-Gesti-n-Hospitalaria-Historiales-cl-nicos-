// Tema de la interfaz para Tailwind CDN. Remapea gray y blue a la paleta del
// expediente (tinta verdosa y verde quirúrgico), así cada clase utilitaria de
// las vistas hereda los mismos tokens que css/clinico.css.
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
      },
      colors: {
        gray: {
          50: '#F6F8F7', 100: '#EDF1EF', 200: '#DDE4E1', 300: '#C6D1CD', 400: '#97A6A1',
          500: '#66776F', 600: '#4F5F5A', 700: '#3B4A46', 800: '#263633', 900: '#17302C',
        },
        blue: {
          50: '#EDF7F4', 100: '#D3ECE5', 200: '#A8D8CB', 300: '#74BEAC', 400: '#3F9F8A',
          500: '#1E8370', 600: '#0E6A5A', 700: '#0B5649', 800: '#09453B', 900: '#073730',
        },
      },
    },
  },
};
