// La regla de oro: el mismo flujo produce exactamente el mismo JSON en los dos motores.
// También comprueba, directamente en SQL, lo que el puerto no expone: la auditoría.
// Requiere: docker compose up -d postgres mysql && npm run seed

require('../../src/config/env');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const postgres = require('../../src/adapters/persistence/postgres/conexion');
const mysql = require('../../src/adapters/persistence/mysql/conexion');
const { crearRepositorios: reposPostgres } = require('../../src/adapters/persistence/postgres/repositorios');
const { crearRepositorios: reposMysql } = require('../../src/adapters/persistence/mysql/repositorios');
const pacientes = require('../../src/application/pacientes');
const { flujoCompleto, horasDeEjecucion } = require('./apoyo/flujoEquivalencia');

describe('equivalencia entre PostgreSQL y MySQL', () => {
  let pg;
  let my;
  let actorPg;
  let actorMy;

  before(async () => {
    pg = { cn: postgres.crearConexion(postgres.configuracionDesdeEntorno(), 'PostgreSQL') };
    my = { cn: mysql.crearConexion(mysql.configuracionDesdeEntorno(), 'MySQL') };
    pg.repos = reposPostgres(pg.cn);
    my.repos = reposMysql(my.cn);
    const usuarioPg = await pg.repos.usuarios.buscarPorNombre('medico.hospital');
    const usuarioMy = await my.repos.usuarios.buscarPorNombre('odontologo.clinica');
    assert.ok(usuarioPg && usuarioMy, 'Faltan los usuarios del seeder: ejecuta npm run seed');
    actorPg = { id_usuario: usuarioPg.id_usuario, id_institucion: 1, rol: usuarioPg.rol };
    actorMy = { id_usuario: usuarioMy.id_usuario, id_institucion: 2, rol: usuarioMy.rol };
  });

  after(async () => {
    await pg.cn.cerrar();
    await my.cn.cerrar();
  });

  it('el mismo flujo produce el mismo JSON', async () => {
    const horas = horasDeEjecucion();
    const enPostgres = await flujoCompleto(pg.repos, actorPg, 'A', horas);
    const enMysql = await flujoCompleto(my.repos, actorMy, 'A', horas);
    assert.deepEqual(enMysql, enPostgres);
    assert.equal(enPostgres.atencion.advertencias.length, 1);
    assert.equal(enPostgres.atencion.consulta.signos_vitales.temperatura, 36.75);
  });

  const AUDITORIAS = [
    ['PostgreSQL', () => pg, () => actorPg, '$1'],
    ['MySQL', () => my, () => actorMy, '?'],
  ];

  for (const [motor, motorDe, actorDe, marcador] of AUDITORIAS) {
    it(`${motor}: la auditoría registra autor y fecha de cada escritura`, async () => {
      const { repos, cn } = motorDe();
      const actor = actorDe();
      const { id_paciente: id } = await pacientes.registrarPaciente(repos, actor, {
        nombres: 'Auditoria', apellidos: 'Prueba', fecha_nacimiento: '1980-01-01',
      });
      await pacientes.archivarPaciente(repos, actor, id, { estado: 'Archivado', motivo: 'Baja' });

      const filas = await cn.q(
        `SELECT accion, id_usuario, fecha_hora FROM Auditoria
         WHERE entidad = 'Paciente' AND id_entidad = ${marcador} ORDER BY id_auditoria`,
        [id],
      );
      assert.deepEqual(filas.map((f) => f.accion), ['CREAR', 'ARCHIVAR']);
      assert.ok(filas.every((f) => f.id_usuario === actor.id_usuario));
      assert.match(filas[0].fecha_hora, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    });

    it(`${motor}: una transacción revertida no deja auditoría`, async () => {
      const { repos, cn } = motorDe();
      const actor = actorDe();
      const { id_paciente: id } = await pacientes.registrarPaciente(repos, actor, {
        nombres: 'Rollback', apellidos: 'Prueba', fecha_nacimiento: '1980-01-01',
      });
      const contar = async () => (await cn.unica('SELECT COUNT(*) AS n FROM Auditoria')).n;
      const contarConsultas = async () => (await cn.unica('SELECT COUNT(*) AS n FROM Consulta')).n;
      const [auditoriaAntes, consultasAntes] = [Number(await contar()), Number(await contarConsultas())];

      await assert.rejects(repos.consultas.registrarAtencion({
        id_paciente: id,
        id_usuario_profesional: actor.id_usuario,
        fecha_hora: '2030-01-01T00:00:00',
        estado: 'Abierta',
        receta: { fecha_receta: '2030-01-01', detalles: [{ id_medicamento: '999999999', dosis: '1', frecuencia: '1' }] },
      }, actor, { desde: '2030-01-01T00:00:00', hasta: '2030-01-01T00:00:00' }));

      assert.equal(Number(await contar()), auditoriaAntes);
      assert.equal(Number(await contarConsultas()), consultasAntes);
    });
  }
});
