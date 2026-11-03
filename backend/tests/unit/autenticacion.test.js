const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { iniciarSesion } = require('../../src/application/autenticacion');
const { NoAutorizado, MotorNoDisponible } = require('../../src/domain/errores');

const USUARIO = { id_usuario: '7', usuario: 'medico', contrasena_hash: 'hash-real', rol: 'Médico', estado: 'Activo' };

const institucion = (id, buscarPorNombre) => ({
  id_institucion: id,
  nombre: `Institución ${id}`,
  repos: { usuarios: { buscarPorNombre, registrarAcceso: mock.fn(async () => {}) } },
});

const encuentra = (usuario = USUARIO) => async () => usuario;
const noEncuentra = async () => null;
const falla = async () => {
  throw new MotorNoDisponible('X');
};
const nuncaResponde = () => new Promise(() => {});

function dependencias(instituciones, extra = {}) {
  return {
    instituciones,
    credenciales: {
      hashFicticio: 'hash-ficticio',
      comparar: mock.fn(async (contrasena, hash) => contrasena === 'correcta' && hash === 'hash-real'),
    },
    tokens: { emitir: mock.fn((actor) => `token-${actor.id_usuario}-${actor.id_institucion}`) },
    timeoutMs: 50,
    ...extra,
  };
}

const credencialesOk = { usuario: 'medico', contrasena: 'correcta' };

describe('iniciarSesion', () => {
  it('encuentra al usuario en cualquier motor y usa esa institución en el token', async () => {
    const deps = dependencias([institucion(1, noEncuentra), institucion(2, encuentra()), institucion(3, noEncuentra)]);
    const { token, usuario } = await iniciarSesion(deps, credencialesOk);
    assert.equal(token, 'token-7-2');
    assert.equal(usuario.id_usuario, '7');
  });

  it('registra el último acceso solo en el motor del usuario', async () => {
    const hospital = institucion(1, noEncuentra);
    const clinica = institucion(2, encuentra());
    await iniciarSesion(dependencias([hospital, clinica]), credencialesOk);
    assert.equal(clinica.repos.usuarios.registrarAcceso.mock.callCount(), 1);
    assert.equal(hospital.repos.usuarios.registrarAcceso.mock.callCount(), 0);
  });

  it('responde sin esperar a un motor que no contesta', async () => {
    const deps = dependencias([institucion(1, nuncaResponde), institucion(2, encuentra())], { timeoutMs: 1500 });
    const inicio = Date.now();
    await iniciarSesion(deps, credencialesOk);
    assert.ok(Date.now() - inicio < 1000);
  });

  it('funciona aunque otro motor esté caído', async () => {
    const { token } = await iniciarSesion(dependencias([institucion(1, falla), institucion(2, encuentra())]), credencialesOk);
    assert.equal(token, 'token-7-2');
  });

  it('contraseña incorrecta: 401, sin token', async () => {
    const deps = dependencias([institucion(1, encuentra())]);
    await assert.rejects(iniciarSesion(deps, { ...credencialesOk, contrasena: 'mala' }), NoAutorizado);
    assert.equal(deps.tokens.emitir.mock.callCount(), 0);
  });

  it('usuario inexistente con todos los motores respondiendo: 401, tras comparar con el hash ficticio', async () => {
    const deps = dependencias([institucion(1, noEncuentra), institucion(2, noEncuentra)]);
    await assert.rejects(iniciarSesion(deps, credencialesOk), NoAutorizado);
    assert.equal(deps.credenciales.comparar.mock.calls[0].arguments[1], 'hash-ficticio');
  });

  it('usuario inactivo: 401 aunque la contraseña sea correcta', async () => {
    const deps = dependencias([institucion(1, encuentra({ ...USUARIO, estado: 'Inactivo' }))]);
    await assert.rejects(iniciarSesion(deps, credencialesOk), NoAutorizado);
  });

  it('sin coincidencia y con un motor caído: 503, no "credenciales inválidas"', async () => {
    const deps = dependencias([institucion(1, noEncuentra), institucion(2, falla)]);
    await assert.rejects(iniciarSesion(deps, credencialesOk), MotorNoDisponible);
  });

  it('sin coincidencia y con un motor que supera el timeout: 503', async () => {
    const deps = dependencias([institucion(1, noEncuentra), institucion(2, nuncaResponde)]);
    await assert.rejects(iniciarSesion(deps, credencialesOk), MotorNoDisponible);
  });

  it('un fallo al registrar el acceso no impide iniciar sesión', async () => {
    const hospital = institucion(1, encuentra());
    hospital.repos.usuarios.registrarAcceso = async () => {
      throw new Error('fallo');
    };
    const { token } = await iniciarSesion(dependencias([hospital]), credencialesOk);
    assert.ok(token);
  });
});
