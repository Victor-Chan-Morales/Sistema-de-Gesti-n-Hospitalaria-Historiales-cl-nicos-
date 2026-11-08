const { crearConexion, configuracionDesdeEntorno } = require('./conexion');
const { crearRepositorios } = require('./repositorios');
const { crearLaboratorio } = require('./laboratorio');
const { asegurarIndices } = require('./indices');
const { verificarPuerto } = require('../../../ports/repositorioClinico');
const { CONTRATO_LABORATORIO, verificarContrato } = require('../../../ports/repositoriosEspecializados');

// Cada método traduce los errores del driver a los del dominio y, antes de la primera operación,
// crea las colecciones e índices (una sola vez; si falla, se reintenta en la siguiente).
function envolver(repositorios, cn, preparar) {
  const envueltos = {};
  for (const [nombre, metodos] of Object.entries(repositorios)) {
    if (typeof metodos === 'function') {
      envueltos[nombre] = metodos;
      continue;
    }
    envueltos[nombre] = {};
    for (const [metodo, funcion] of Object.entries(metodos)) {
      envueltos[nombre][metodo] = async (...argumentos) => {
        try {
          await preparar();
          return await funcion(...argumentos);
        } catch (error) {
          throw cn.traducirError(error);
        }
      };
    }
  }
  return envueltos;
}

function crearAdaptador(etiqueta = 'Laboratorio Clínico') {
  const cn = crearConexion(configuracionDesdeEntorno(), etiqueta);

  let listo = null;
  const preparar = () => {
    listo ??= asegurarIndices(cn.db()).catch((error) => {
      listo = null;
      throw error;
    });
    return listo;
  };

  const comun = crearRepositorios(cn);
  const { examenes } = crearLaboratorio(cn);

  const adaptador = envolver({ ...comun, examenes }, cn, preparar);
  verificarContrato(CONTRATO_LABORATORIO, adaptador, 'adaptador MongoDB (laboratorio)');
  return verificarPuerto(adaptador, 'adaptador MongoDB');
}

module.exports = { crearAdaptador };
