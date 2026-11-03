const { createHash } = require('node:crypto');
const { NoAutorizado, Prohibido, RegistroDuplicado } = require('../../domain/errores');
const { tienePermiso } = require('../../domain/roles');

// La institución sale siempre del token, nunca de la URL ni del cuerpo: un usuario no
// puede dirigir una petición al motor de otra institución.
function crearAutenticar({ tokens, obtenerRepositorio }) {
  return (req, res, next) => {
    const [esquema, token] = (req.headers.authorization ?? '').split(' ');
    if (esquema !== 'Bearer' || !token) throw new NoAutorizado('Debes iniciar sesión.');
    req.actor = tokens.verificar(token);
    req.repos = obtenerRepositorio(req.actor.id_institucion);
    next();
  };
}

const autorizar = (permiso) => (req, res, next) => {
  if (!tienePermiso(req.actor.rol, permiso)) throw new Prohibido();
  next();
};

const VENTANA_ENVIO_DOBLE_MS = 5000;

// Primera línea contra el doble clic: rechaza un POST idéntico del mismo usuario mientras
// el anterior sigue en curso o acaba de terminar con éxito. Un envío fallido se puede
// reintentar de inmediato. Es memoria de un solo proceso; la garantía fuerte de las
// consultas y las citas está dentro de la transacción de cada adaptador.
function crearEvitarEnvioDoble({ ventanaMs = VENTANA_ENVIO_DOBLE_MS } = {}) {
  const recientes = new Map();

  return (req, res, next) => {
    if (req.method !== 'POST') return next();

    const instante = Date.now();
    for (const [clave, vence] of recientes) if (vence <= instante) recientes.delete(clave);

    const huella = createHash('sha256')
      .update(`${req.actor.id_institucion}|${req.actor.id_usuario}|${req.originalUrl}|${JSON.stringify(req.body ?? null)}`)
      .digest('hex');

    if (recientes.has(huella)) {
      throw new RegistroDuplicado('Esta solicitud ya se envió hace un momento.');
    }
    recientes.set(huella, instante + ventanaMs);
    res.on('close', () => {
      if (res.statusCode >= 400) recientes.delete(huella);
    });
    return next();
  };
}

module.exports = { crearAutenticar, autorizar, crearEvitarEnvioDoble };
