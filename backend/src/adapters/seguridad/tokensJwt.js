const jwt = require('jsonwebtoken');
const { NoAutorizado } = require('../../domain/errores');

const ALGORITMO = 'HS256';
const DURACION = '8h';

function crearServicioTokens(secreto) {
  return {
    emitir({ id_usuario, id_institucion, rol }) {
      return jwt.sign({ id_institucion, rol }, secreto, {
        subject: String(id_usuario),
        algorithm: ALGORITMO,
        expiresIn: DURACION,
      });
    },
    verificar(token) {
      try {
        const { sub, id_institucion, rol } = jwt.verify(token, secreto, { algorithms: [ALGORITMO] });
        return { id_usuario: sub, id_institucion, rol };
      } catch {
        throw new NoAutorizado('La sesión no es válida o ha expirado.');
      }
    },
  };
}

module.exports = { crearServicioTokens };
