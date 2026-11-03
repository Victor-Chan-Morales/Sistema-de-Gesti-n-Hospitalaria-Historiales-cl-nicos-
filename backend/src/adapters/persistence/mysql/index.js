const { crearConexion, configuracionDesdeEntorno } = require('./conexion');
const { crearRepositorios } = require('./repositorios');

function crearAdaptador(etiqueta = 'MySQL') {
  return crearRepositorios(crearConexion(configuracionDesdeEntorno(), etiqueta));
}

module.exports = { crearAdaptador };
