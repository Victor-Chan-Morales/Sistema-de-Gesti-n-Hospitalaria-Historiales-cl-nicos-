// Requiere: docker compose up -d mongo && npm run seed:nosql -- mongo
require('../../src/config/env');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ejecutarSuiteContrato } = require('../contrato/suiteRepositorio');
const { crearAdaptador } = require('../../src/adapters/persistence/mongo');
const errores = require('../../src/domain/errores');

const ID_INSTITUCION = 3;

ejecutarSuiteContrato('MongoDB', {
  crearRepos: () => crearAdaptador('Laboratorio Clínico'),
  idInstitucion: ID_INSTITUCION,
  usuarioAdministrador: 'admin.laboratorio',
  usuarioProfesional: 'laboratorista.laboratorio',
});

describe('MongoDB: órdenes y resultados de laboratorio', () => {
  let repos;
  let actor;
  let tipos;
  const ventana = { desde: '2999-01-01T00:00:00', hasta: '3001-01-01T00:00:00' };
  const unico = () => randomUUID().slice(0, 12);

  const nuevoPaciente = async () => repos.pacientes.crear({
    nombres: 'Laboratorio',
    apellidos: `Prueba ${unico()}`,
    dpi_o_documento: `LAB-${unico()}`,
    fecha_nacimiento: '1990-05-20',
    id_institucion: ID_INSTITUCION,
    codigo_historial: `HC-${unico()}`,
    fecha_registro: '2026-01-15',
  }, actor);

  const nuevaOrden = (idPaciente, examenes, extra = {}) => ({
    id_paciente: idPaciente,
    id_usuario_solicitante: actor.id_usuario,
    fecha_orden: '3000-06-15T10:00:00',
    prioridad: 'Normal',
    observaciones: `Orden ${unico()}`,
    examenes,
    ...extra,
  });

  before(async () => {
    repos = crearAdaptador('Laboratorio Clínico');
    const usuario = await repos.usuarios.buscarPorNombre('laboratorista.laboratorio');
    assert.ok(usuario, 'Faltan los usuarios del seeder: ejecuta npm run seed:nosql -- mongo');
    actor = { id_usuario: usuario.id_usuario, id_institucion: ID_INSTITUCION, rol: usuario.rol };
    tipos = await repos.examenes.listarTipos();
    assert.ok(tipos.length >= 2, 'Faltan los tipos de examen del seeder');
  });

  after(async () => {
    await repos?.cerrar();
  });

  it('lista tipos de examen con ID string y filtra por texto', async () => {
    assert.equal(typeof tipos[0].id_tipo_examen, 'string');
    const filtrados = await repos.examenes.listarTipos({ texto: tipos[0].nombre.slice(0, 4) });
    assert.ok(filtrados.some((t) => t.id_tipo_examen === tipos[0].id_tipo_examen));
  });

  it('crea la orden Pendiente con sus exámenes y la devuelve con resultados vacíos', async () => {
    const { id_paciente: id } = await nuevoPaciente();
    const orden = await repos.examenes.crearOrden(
      nuevaOrden(id, [tipos[0].id_tipo_examen, tipos[1].id_tipo_examen]), actor, ventana,
    );
    assert.equal(typeof orden.id_orden_laboratorio, 'string');
    assert.equal(orden.estado, 'Pendiente');
    assert.equal(orden.examenes.length, 2);
    assert.deepEqual(orden.resultados, []);
    assert.deepEqual(await repos.examenes.obtenerOrden(orden.id_orden_laboratorio), orden);
    assert.equal(await repos.examenes.obtenerOrden('abc'), null);
    assert.deepEqual((await repos.examenes.listarOrdenes({ id_paciente: id })).map((o) => o.id_orden_laboratorio), [orden.id_orden_laboratorio]);
    assert.deepEqual(await repos.examenes.listarOrdenes({ id_paciente: 'abc' }), []);
  });

  it('una referencia inexistente no deja la orden a medias', async () => {
    const { id_paciente: id } = await nuevoPaciente();
    await assert.rejects(
      repos.examenes.crearOrden(nuevaOrden(id, [tipos[0].id_tipo_examen, '999999999']), actor, ventana),
      errores.DatosInvalidos,
    );
    await assert.rejects(repos.examenes.crearOrden(nuevaOrden('abc', [tipos[0].id_tipo_examen]), actor, ventana), errores.NoEncontrado);
    assert.deepEqual(await repos.examenes.listarOrdenes({ id_paciente: id }), []);
  });

  it('dos órdenes idénticas simultáneas dejan una sola', async () => {
    const { id_paciente: id } = await nuevoPaciente();
    const datos = nuevaOrden(id, [tipos[0].id_tipo_examen]);
    const resultados = await Promise.allSettled([
      repos.examenes.crearOrden(datos, actor, ventana),
      repos.examenes.crearOrden(datos, actor, ventana),
    ]);
    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
    assert.ok(resultados.find((r) => r.status === 'rejected').reason instanceof errores.RegistroDuplicado);
    assert.equal((await repos.examenes.listarOrdenes({ id_paciente: id })).length, 1);
  });

  it('cada resultado actualiza el estado de su orden en la misma transacción', async () => {
    const { id_paciente: id } = await nuevoPaciente();
    const [a, b] = [tipos[0].id_tipo_examen, tipos[1].id_tipo_examen];
    const { id_orden_laboratorio: idOrden } = await repos.examenes.crearOrden(nuevaOrden(id, [a, b]), actor, ventana);

    const primera = await repos.examenes.registrarResultado(idOrden, {
      id_tipo_examen: a,
      fecha_toma_muestra: '2026-02-01',
      fecha_resultado: '2026-02-02',
      resultado_general: 'Normal',
      // La estructura de los valores cambia según el examen.
      valores_detallados: [{ parametro: 'Hemoglobina', valor: '13.5', unidad: 'g/dL', rango_referencia: '12-16' }],
    }, actor);
    assert.equal(primera.estado, 'En proceso');
    assert.equal(primera.resultados.length, 1);
    assert.equal(typeof primera.resultados[0].id_resultado, 'string');
    assert.equal(primera.resultados[0].valores_detallados[0].parametro, 'Hemoglobina');
    assert.equal(primera.resultados[0].id_usuario_laboratorista, actor.id_usuario);

    await assert.rejects(
      repos.examenes.registrarResultado(idOrden, { id_tipo_examen: a, fecha_resultado: '2026-02-03' }, actor),
      errores.RegistroDuplicado,
    );

    const completa = await repos.examenes.registrarResultado(idOrden, {
      id_tipo_examen: b, fecha_resultado: '2026-02-03', valores_detallados: [],
    }, actor);
    assert.equal(completa.estado, 'Finalizada');
    assert.equal(completa.resultados.length, 2);
  });

  it('rechaza resultados de un examen ajeno o de una orden cancelada, sin guardar nada', async () => {
    const { id_paciente: id } = await nuevoPaciente();
    const { id_orden_laboratorio: idOrden } = await repos.examenes.crearOrden(
      nuevaOrden(id, [tipos[0].id_tipo_examen]), actor, ventana,
    );
    await assert.rejects(
      repos.examenes.registrarResultado(idOrden, { id_tipo_examen: tipos[1].id_tipo_examen, fecha_resultado: '2026-02-03' }, actor),
      errores.ReglaNegocio,
    );
    const cancelada = await repos.examenes.cambiarEstadoOrden(idOrden, 'Cancelada', actor);
    assert.equal(cancelada.estado, 'Cancelada');
    await assert.rejects(
      repos.examenes.registrarResultado(idOrden, { id_tipo_examen: tipos[0].id_tipo_examen, fecha_resultado: '2026-02-03' }, actor),
      errores.ReglaNegocio,
    );
    assert.deepEqual((await repos.examenes.obtenerOrden(idOrden)).resultados, []);
    await assert.rejects(repos.examenes.registrarResultado('999999999', { id_tipo_examen: tipos[0].id_tipo_examen }, actor), errores.NoEncontrado);
    await assert.rejects(repos.examenes.cambiarEstadoOrden('999999999', 'Cancelada', actor), errores.NoEncontrado);
  });
});
