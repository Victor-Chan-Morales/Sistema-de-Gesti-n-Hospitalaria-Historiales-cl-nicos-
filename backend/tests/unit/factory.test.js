const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { obtenerRepositorio, listarInstituciones, cerrarConexiones } = require('../../src/factory/repositoryFactory');
const { motorDeInstitucion } = require('../../src/config/instituciones');
const { verificarPuerto, CONTRATO } = require('../../src/ports/repositorioClinico');
const { MotorNoDisponible } = require('../../src/domain/errores');

describe('factory de repositorios', () => {
  afterEach(async () => {
    delete process.env.MOTOR_INSTITUCION_1;
    await cerrarConexiones();
  });

  it('asigna un motor distinto a cada institución', () => {
    const motores = listarInstituciones().map((i) => i.motor);
    assert.deepEqual(motores, ['postgres', 'mysql', 'mongo', 'firebase']);
  });

  it('cambiar de motor es una decisión de configuración', () => {
    process.env.MOTOR_INSTITUCION_1 = 'mysql';
    assert.equal(motorDeInstitucion(1), 'mysql');
    process.env.MOTOR_INSTITUCION_1 = 'sqlite';
    assert.throws(() => motorDeInstitucion(1), /Motor desconocido/);
  });

  it('crea una sola instancia por motor, sin conectarse todavía', () => {
    assert.equal(obtenerRepositorio(1), obtenerRepositorio(1));
    assert.notEqual(obtenerRepositorio(1), obtenerRepositorio(2));
  });

  it('los adaptadores de PostgreSQL y MySQL cumplen el puerto', () => {
    assert.doesNotThrow(() => verificarPuerto(obtenerRepositorio(1)));
    assert.doesNotThrow(() => verificarPuerto(obtenerRepositorio(2)));
  });

  it('un motor pendiente responde como servicio no disponible y cumple el puerto', async () => {
    const stub = verificarPuerto(obtenerRepositorio(3));
    await assert.rejects(stub.pacientes.obtener('1'), MotorNoDisponible);
    assert.equal(listarInstituciones().find((i) => i.id_institucion === 3).implementado, false);
  });

  it('una institución desconocida no se enruta a ningún motor', () => {
    assert.throws(() => obtenerRepositorio(99), MotorNoDisponible);
  });

  it('verificarPuerto señala los métodos que faltan', () => {
    assert.throws(() => verificarPuerto({ usuarios: {} }, 'adaptador x'), /adaptador x.*usuarios\.buscarPorNombre/);
    assert.ok(Object.keys(CONTRATO).includes('consultas'));
  });
});
