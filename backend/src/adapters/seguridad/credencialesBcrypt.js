const bcrypt = require('bcrypt');

const COSTO = 10;

// Hash válido de una contraseña imposible: permite gastar el mismo tiempo en la
// comparación cuando el usuario no existe.
const hashFicticio = bcrypt.hashSync(require('node:crypto').randomUUID(), COSTO);

module.exports = {
  hashFicticio,
  hashear: (contrasena) => bcrypt.hash(contrasena, COSTO),
  comparar: (contrasena, hash) => bcrypt.compare(contrasena, hash),
};
