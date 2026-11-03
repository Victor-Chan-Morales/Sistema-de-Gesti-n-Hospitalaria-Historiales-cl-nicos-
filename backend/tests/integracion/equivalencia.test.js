// La regla de oro: el mismo flujo produce exactamente el mismo JSON en los dos motores.
// También comprueba, directamente en SQL, lo que el puerto no expone: la auditoría.
// Requiere: docker compose up -d postgres mysql && npm run seed

require('../../src/config/env');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const postgres = require('../../src/adapters/persistence/postgres/conexion');
const mysql = require('../../src/adapters/persistence/mysql/conexion');
const { crearRepositorios: reposPostgres } = require('../../src/adapters/persistence/postgres/repositorios');
const { crearRepositorios: reposMysql } = require('../../src/adapters/persistence/mysql/repositorios');
const pacientes = require('../../src/application/pacientes');
const citas = require('../../src/application/citas');
const consultas = require('../../src/application/consultas');
const dto = require('../../src/dto/respuestas');

// IDs y valores generados cambian entre motores: se reemplazan, conservando su tipo.
function normalizar(valor, clave) {
  if (Array.isArray(valor)) return valor.map((v) => normalizar(v));
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, normalizar(v, k)]));
  }
  if (clave?.startsWith('id_') && valor !== null) return `<${typeof valor}>`;
  if (['codigo_historial', 'dpi_o_documento', 'fecha_hora', 'id_institucion'].includes(clave)) return `<${typeof valor}>`;
  return valor;
}

async function flujoCompleto(repos, actor, marca) {
  const paciente = await pacientes.registrarPaciente(repos, actor, {
    nombres: 'Equivalencia',
    apellidos: `Motor ${marca}`,
    dpi_o_documento: `EQ-${marca}-${randomUUID().slice(0, 8)}`,
    fecha_nacimiento: '1985-12-31',
    sexo: 'M',
    tipo_sangre: 'AB-',
    telefonos: [{ numero: '5555-0000', tipo: 'Casa' }],
    contactos_emergencia: [{ nombres: 'Uno', apellidos: 'Dos', telefonos: [{ numero: '1', tipo: 'Celular' }] }],
  });
  const profesional = (await repos.usuarios.listarProfesionales())[0];
  const cita = await citas.crearCita(repos, actor, {
    id_paciente: paciente.id_paciente,
    id_usuario_profesional: profesional.id_usuario,
    fecha_hora: '3000-01-31T23:59:59',
    motivo_consulta: 'Control',
  });

  const diagnosticos = await repos.catalogos.diagnosticos({ texto: 'caries' });
  const medicamentos = await repos.catalogos.medicamentos();
  const alergias = await repos.catalogos.alergias();
  const penicilina = alergias.find((a) => a.sustancia === 'Penicilina');
  const amoxicilina = medicamentos.find((m) => m.nombre === 'Amoxicilina');

  const alergia = await pacientes.agregarAlergia(repos, actor, paciente.id_paciente, {
    id_catalogo_alergia: penicilina.id_catalogo_alergia, nivel_gravedad: 'Leve',
  });
  const atencion = await consultas.registrarAtencion(repos, actor, {
    id_paciente: paciente.id_paciente,
    id_cita: cita.id_cita,
    fecha_hora: '3000-01-31T23:59:59',
    motivo_consulta: 'Dolor con acentuación: ñandú',
    sintomas: 'Síntomas',
    signos_vitales: { presion_arterial: '110/70', temperatura: 36.75, peso: 70.5, talla: 1.75, saturacion_oxigeno: 98 },
    diagnosticos: [{ id_catalogo_diag: diagnosticos[0].id_catalogo_diag, tipo: 'Definitivo' }],
    tratamientos: [{ descripcion: 'Tratamiento', fecha_inicio: '2030-01-01', fecha_fin: '2030-01-10' }],
    receta: { indicaciones_generales: 'Con comida', detalles: [{ id_medicamento: amoxicilina.id_medicamento, dosis: '1', frecuencia: '8h' }] },
  });
  const archivado = await pacientes.archivarPaciente(repos, actor, paciente.id_paciente, { estado: 'Inactivo', motivo: 'Traslado' });
  const historial = await pacientes.obtenerHistorialCompleto(repos, paciente.id_paciente);

  return normalizar({
    paciente: dto.pacienteDto(paciente),
    alergia: dto.alergiaDto(alergia),
    cita: dto.citaDto(await repos.citas.obtener(cita.id_cita)),
    atencion: { consulta: dto.consultaDto(atencion.consulta), advertencias: atencion.advertencias },
    archivado: dto.pacienteDto(archivado),
    historial: dto.historialCompletoDto(historial),
  });
}

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
    const enPostgres = await flujoCompleto(pg.repos, actorPg, 'A');
    const enMysql = await flujoCompleto(my.repos, actorMy, 'A');
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
