// Patrón Factory: devuelve el repositorio del motor que corresponde a la institución
// del usuario. Es el único punto, junto con server.js, que conoce los adaptadores.

const { MotorNoDisponible } = require('../domain/errores');
const { CONTRATO, verificarPuerto } = require('../ports/repositorioClinico');
const { motorDeInstitucion, nombreDeInstitucion, idsDeInstituciones } = require('../config/instituciones');

// Integrante B: reemplazar null por el require de su adaptador, igual que en postgres y mysql.
const FABRICAS = {
  postgres: (etiqueta) => require('../adapters/persistence/postgres').crearAdaptador(etiqueta),
  mysql: (etiqueta) => require('../adapters/persistence/mysql').crearAdaptador(etiqueta),
  mongo: null,
  firebase: null,
};

// Mientras un motor no exista, sus operaciones responden como un servicio no disponible
// (503) en lugar de un error interno, y el resto del sistema sigue funcionando.
function crearStub(etiqueta) {
  const stub = {};
  for (const [repositorio, metodos] of Object.entries(CONTRATO)) {
    stub[repositorio] = {};
    for (const metodo of Object.keys(metodos)) {
      stub[repositorio][metodo] = async () => {
        throw new MotorNoDisponible(etiqueta);
      };
    }
  }
  return stub;
}

const cache = new Map();

function obtenerPorMotor(motor, etiqueta) {
  if (!cache.has(motor)) {
    const fabrica = FABRICAS[motor];
    cache.set(motor, fabrica ? verificarPuerto(fabrica(etiqueta), `adaptador ${motor}`) : crearStub(etiqueta));
  }
  return cache.get(motor);
}

function obtenerRepositorio(idInstitucion) {
  const motor = motorDeInstitucion(idInstitucion);
  if (!motor) throw new MotorNoDisponible(`la institución ${idInstitucion}`);
  return obtenerPorMotor(motor, nombreDeInstitucion(idInstitucion));
}

function listarInstituciones() {
  return idsDeInstituciones().map((id) => {
    const motor = motorDeInstitucion(id);
    return {
      id_institucion: id,
      nombre: nombreDeInstitucion(id),
      motor,
      implementado: Boolean(FABRICAS[motor]),
      repos: obtenerRepositorio(id),
    };
  });
}

async function cerrarConexiones() {
  await Promise.allSettled([...cache.values()].map((repos) => repos.cerrar?.()));
  cache.clear();
}

module.exports = { obtenerRepositorio, listarInstituciones, cerrarConexiones };
