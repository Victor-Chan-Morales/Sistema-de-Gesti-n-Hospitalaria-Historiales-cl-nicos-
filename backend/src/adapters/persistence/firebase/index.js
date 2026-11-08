const { crearConexion, configuracionDesdeEntorno } = require('./conexion');
const { crearRepositorios } = require('./repositorios');
const { crearPediatria } = require('./pediatria');
const { verificarPuerto } = require('../../../ports/repositorioClinico');
const { CONTRATO_PEDIATRICO, verificarContrato } = require('../../../ports/repositoriosEspecializados');

// Cada método comprueba antes que Firestore responda (para fallar rápido con un 503) y traduce
// los errores del SDK a los del dominio.
function envolver(repositorios, cn) {
  const envueltos = {};
  for (const [nombre, metodos] of Object.entries(repositorios)) {
    envueltos[nombre] = {};
    for (const [metodo, funcion] of Object.entries(metodos)) {
      envueltos[nombre][metodo] = async (...argumentos) => {
        try {
          await cn.asegurarDisponible();
          return await funcion(...argumentos);
        } catch (error) {
          throw cn.traducirError(error);
        }
      };
    }
  }
  return envueltos;
}

function crearAdaptador(etiqueta = 'Centro Médico Pediátrico') {
  const cn = crearConexion(configuracionDesdeEntorno(), etiqueta);
  const { repositorios, herramientas } = crearRepositorios(cn);
  const { seguimiento } = crearPediatria(cn, herramientas);

  const adaptador = { ...envolver({ ...repositorios, seguimiento }, cn), cerrar: cn.cerrar };
  verificarContrato(CONTRATO_PEDIATRICO, adaptador, 'adaptador Firebase (pediatría)');
  return verificarPuerto(adaptador, 'adaptador Firebase');
}

module.exports = { crearAdaptador };
