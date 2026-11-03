const { ErrorDominio } = require('../../domain/errores');

const ESTADOS = {
  DATOS_INVALIDOS: 400,
  NO_AUTORIZADO: 401,
  PROHIBIDO: 403,
  NO_ENCONTRADO: 404,
  REGISTRO_DUPLICADO: 409,
  CONSULTA_DUPLICADA: 409,
  REGLA_NEGOCIO: 422,
  MOTOR_NO_DISPONIBLE: 503,
};

function rutaNoEncontrada(req, res) {
  res.status(404).json({ codigo: 'NO_ENCONTRADO', mensaje: 'La ruta solicitada no existe.' });
}

// eslint-disable-next-line no-unused-vars -- Express identifica este middleware por sus 4 parámetros.
function manejarErrores(error, req, res, next) {
  if (error instanceof ErrorDominio) {
    return res.status(ESTADOS[error.codigo] ?? 500).json({ codigo: error.codigo, mensaje: error.message });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ codigo: 'DATOS_INVALIDOS', mensaje: 'El cuerpo no es JSON válido.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ codigo: 'DATOS_INVALIDOS', mensaje: 'El cuerpo es demasiado grande.' });
  }
  console.error(error);
  return res.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.' });
}

module.exports = { rutaNoEncontrada, manejarErrores };
