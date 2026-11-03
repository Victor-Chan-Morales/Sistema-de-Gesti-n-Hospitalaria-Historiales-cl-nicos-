const { crearConexion, configuracionDesdeEntorno } = require('./conexion');
const { crearRepositorios } = require('./repositorios');

function crearAdaptador(etiqueta = 'PostgreSQL') {
  return crearRepositorios(crearConexion(configuracionDesdeEntorno(), etiqueta));
}

module.exports = { crearAdaptador };
