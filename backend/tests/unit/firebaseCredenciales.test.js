// Si el archivo de credenciales de Firebase falta, el motor responde como no disponible (503)
// y no deja promesas sin atender que tumben el servidor.

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { MotorNoDisponible } = require('../../src/domain/errores');
const { crearAdaptador } = require('../../src/adapters/persistence/firebase');

describe('Firebase sin credenciales válidas', () => {
  const guardado = {};
  const CLAVES = ['GOOGLE_APPLICATION_CREDENTIALS', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_PROJECT_ID'];

  beforeEach(() => {
    for (const clave of CLAVES) guardado[clave] = process.env[clave];
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/ruta/que/no/existe/credenciales.json';
    process.env.FIREBASE_PROJECT_ID = 'proyecto-de-prueba';
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  afterEach(() => {
    for (const clave of CLAVES) {
      if (guardado[clave] === undefined) delete process.env[clave];
      else process.env[clave] = guardado[clave];
    }
  });

  async function comprobarQueFallaSinRuido() {
    const sinAtender = [];
    const registrar = (error) => sinAtender.push(error);
    process.on('unhandledRejection', registrar);
    const repos = crearAdaptador('Centro Médico Pediátrico');
    try {
      await assert.rejects(repos.salud.verificar(), MotorNoDisponible);
      await assert.rejects(repos.usuarios.buscarPorNombre('x'), MotorNoDisponible);
      await new Promise((resolver) => setTimeout(resolver, 200)); // da tiempo a que aparezca un rechazo suelto
    } finally {
      process.off('unhandledRejection', registrar);
      await repos.cerrar();
    }
    assert.deepEqual(sinAtender, []);
  }

  it('con un archivo inexistente, cada operación falla de inmediato con MotorNoDisponible', comprobarQueFallaSinRuido);

  it('sin ninguna credencial indicada, también falla de inmediato', async () => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    await comprobarQueFallaSinRuido();
  });
});
