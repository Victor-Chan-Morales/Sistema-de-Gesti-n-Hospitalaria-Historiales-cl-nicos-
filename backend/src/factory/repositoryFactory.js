// Devuelve el repositorio del motor que corresponde a la institución del usuario.
// Pendiente: la relación id_institucion -> motor y los métodos del puerto de repositorio.

function crearStub(motor) {
  return new Proxy({}, {
    get(_, metodo) {
      return () => {
        throw new Error(`Repositorio ${motor}: ${String(metodo)} no implementado`);
      };
    },
  });
}

const repositorios = {
  postgres: crearStub('postgres'),
  mysql: crearStub('mysql'),
  mongo: crearStub('mongo'),
  firebase: crearStub('firebase'),
};

// Pendiente: definir cómo se relaciona cada id_institucion con su motor.
const motorPorInstitucion = {};

function obtenerRepositorio(idInstitucion) {
  const motor = motorPorInstitucion[idInstitucion];
  return repositorios[motor] ?? crearStub(`institución ${idInstitucion}`);
}

module.exports = { obtenerRepositorio, repositorios };
