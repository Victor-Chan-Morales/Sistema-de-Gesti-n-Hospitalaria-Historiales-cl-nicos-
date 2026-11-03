const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const LARGO_MINIMO_SECRETO = 32;

// Falla al arrancar, no con la primera petición de un usuario.
function exigirConfiguracion() {
  const secreto = process.env.JWT_SECRET;
  if (!secreto || secreto.length < LARGO_MINIMO_SECRETO) {
    throw new Error(`JWT_SECRET es obligatorio y debe tener al menos ${LARGO_MINIMO_SECRETO} caracteres.`);
  }
}

module.exports = { exigirConfiguracion };
