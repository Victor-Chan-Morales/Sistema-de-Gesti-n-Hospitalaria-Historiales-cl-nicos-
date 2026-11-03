const { NoAutorizado, MotorNoDisponible, NoEncontrado } = require('../domain/errores');
const { login: esquemaLogin } = require('../domain/esquemas');
const { validar } = require('../domain/validacion');
const { ahora } = require('../domain/fechas');

const TIMEOUT_POR_MOTOR_MS = 2000;

function conTimeout(promesa, ms) {
  let temporizador;
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error('timeout')), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

// Consulta todos los motores en paralelo y resuelve con la primera coincidencia,
// sin esperar a los demás. Si nadie coincide, informa si algún motor no respondió:
// en ese caso no se puede afirmar que el usuario no exista.
function localizarUsuario(instituciones, usuario, timeoutMs) {
  return new Promise((resolver) => {
    let pendientes = instituciones.length;
    let huboFallo = false;
    if (pendientes === 0) resolver({ huboFallo });

    for (const { id_institucion, repos, nombre } of instituciones) {
      conTimeout(repos.usuarios.buscarPorNombre(usuario), timeoutMs)
        .then((encontrado) => {
          if (encontrado) resolver({ encontrado, id_institucion, repos });
        })
        .catch((error) => {
          huboFallo = true;
          console.warn(`[login] ${nombre} no respondió: ${error.message}`);
        })
        .finally(() => {
          pendientes -= 1;
          if (pendientes === 0) resolver({ huboFallo });
        });
    }
  });
}

async function iniciarSesion(
  { instituciones, credenciales, tokens, timeoutMs = TIMEOUT_POR_MOTOR_MS },
  datos,
) {
  const { usuario, contrasena } = validar(datos, esquemaLogin);
  const { encontrado, id_institucion, repos, huboFallo } =
    await localizarUsuario(instituciones, usuario, timeoutMs);

  if (!encontrado && huboFallo) throw new MotorNoDisponible('autenticación');

  // Se compara siempre, incluso sin usuario, para que el tiempo de respuesta
  // no revele qué nombres de usuario existen.
  const coincide = await credenciales.comparar(
    contrasena,
    encontrado?.contrasena_hash ?? credenciales.hashFicticio,
  );
  if (!encontrado || !coincide || encontrado.estado !== 'Activo') throw new NoAutorizado();

  // La institución sale de la configuración del motor que respondió.
  const actor = { id_usuario: encontrado.id_usuario, id_institucion, rol: encontrado.rol };
  repos.usuarios.registrarAcceso(encontrado.id_usuario, ahora()).catch((error) => {
    console.warn(`[login] no se pudo registrar el último acceso: ${error.message}`);
  });

  return { token: tokens.emitir(actor), usuario: encontrado };
}

async function obtenerPerfil(repos, actor) {
  const usuario = await repos.usuarios.obtener(actor.id_usuario);
  if (!usuario) throw new NoEncontrado('El usuario ya no existe.');
  return usuario;
}

module.exports = { iniciarSesion, obtenerPerfil };
