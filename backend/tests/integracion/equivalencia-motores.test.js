// La regla de oro entre los cuatro motores: el mismo flujo produce exactamente el mismo JSON.
// Usa la fábrica, igual que la aplicación: cada institución llega a su propio motor.
// Compara los motores que estén disponibles (al menos dos); los que no respondan se omiten y se
// avisan. Con EQUIVALENCIA_EXIGIR_TODOS=1 la prueba falla si falta alguno de los cuatro.
// Requiere los seeders: npm run seed (SQL) y npm run seed:nosql (MongoDB y Firebase).

require('../../src/config/env');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { obtenerRepositorio, cerrarConexiones } = require('../../src/factory/repositoryFactory');
const { flujoCompleto, horasDeEjecucion } = require('./apoyo/flujoEquivalencia');

const MOTORES = [
  { nombre: 'PostgreSQL', id_institucion: 1, usuario: 'medico.hospital' },
  { nombre: 'MySQL', id_institucion: 2, usuario: 'odontologo.clinica' },
  { nombre: 'MongoDB', id_institucion: 3, usuario: 'laboratorista.laboratorio' },
  { nombre: 'Firebase', id_institucion: 4, usuario: 'pediatra.pediatrico' },
];

describe('equivalencia entre los cuatro motores', () => {
  const disponibles = [];
  const omitidos = [];

  before(async () => {
    for (const motor of MOTORES) {
      try {
        const repos = obtenerRepositorio(motor.id_institucion);
        await repos.salud.verificar();
        const usuario = await repos.usuarios.buscarPorNombre(motor.usuario);
        if (!usuario) throw new Error(`falta el usuario ${motor.usuario}: ejecuta el seeder`);
        disponibles.push({
          ...motor,
          repos,
          actor: { id_usuario: usuario.id_usuario, id_institucion: motor.id_institucion, rol: usuario.rol },
        });
      } catch (error) {
        omitidos.push(`${motor.nombre}: ${error.message}`);
      }
    }
  });

  after(async () => {
    await cerrarConexiones();
  });

  it('todos los motores están disponibles cuando se exige', () => {
    if (process.env.EQUIVALENCIA_EXIGIR_TODOS !== '1') return;
    assert.deepEqual(omitidos, [], `Motores omitidos:\n${omitidos.join('\n')}`);
  });

  it('el mismo flujo produce el mismo JSON en cada motor disponible', async (t) => {
    if (omitidos.length) t.diagnostic(`Omitidos:\n${omitidos.join('\n')}`);
    if (disponibles.length < 2) {
      t.skip(`Se necesitan al menos dos motores disponibles.\n${omitidos.join('\n')}`);
      return;
    }
    t.diagnostic(`Comparando: ${disponibles.map((m) => m.nombre).join(', ')}`);

    const [referencia, ...otros] = disponibles;
    const horas = horasDeEjecucion();
    const esperado = await flujoCompleto(referencia.repos, referencia.actor, 'A', horas);
    assert.equal(esperado.atencion.advertencias.length, 1);
    assert.equal(esperado.atencion.consulta.signos_vitales.temperatura, 36.75);

    for (const motor of otros) {
      const obtenido = await flujoCompleto(motor.repos, motor.actor, 'A', horas);
      assert.deepEqual(obtenido, esperado, `${motor.nombre} responde distinto que ${referencia.nombre}`);
    }
  });
});
