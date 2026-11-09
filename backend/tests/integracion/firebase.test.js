// Requiere el emulador de Firestore y el seeder:
//   docker compose up -d firestore && npm run seed:nosql -- firebase
// (con FIRESTORE_EMULATOR_HOST y FIREBASE_PROJECT_ID definidos en .env)
require('../../src/config/env');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ejecutarSuiteContrato } = require('../contrato/suiteRepositorio');
const { crearAdaptador } = require('../../src/adapters/persistence/firebase');
const errores = require('../../src/domain/errores');

const ID_INSTITUCION = 4;

ejecutarSuiteContrato('Firebase', {
  crearRepos: () => crearAdaptador('Centro Médico Pediátrico'),
  idInstitucion: ID_INSTITUCION,
  usuarioAdministrador: 'admin.pediatrico',
  usuarioProfesional: 'pediatra.pediatrico',
});

describe('Firebase: crecimiento y vacunación', () => {
  let repos;
  let actor;
  let vacunas;
  const unico = () => randomUUID().slice(0, 12);

  const nuevoPaciente = () => repos.pacientes.crear({
    nombres: 'Pediatría',
    apellidos: `Prueba ${unico()}`,
    dpi_o_documento: `PED-${unico()}`,
    fecha_nacimiento: '2022-05-20',
    id_institucion: ID_INSTITUCION,
    codigo_historial: `HC-${unico()}`,
    fecha_registro: '2026-01-15',
    representantes: [{ nombres: 'Rosa', apellidos: 'Encargada', parentesco: 'Madre' }],
  }, actor);

  before(async () => {
    repos = crearAdaptador('Centro Médico Pediátrico');
    const usuario = await repos.usuarios.buscarPorNombre('pediatra.pediatrico');
    assert.ok(usuario, 'Faltan los usuarios del seeder: ejecuta npm run seed:nosql -- firebase');
    actor = { id_usuario: usuario.id_usuario, id_institucion: ID_INSTITUCION, rol: usuario.rol };
    vacunas = await repos.seguimiento.listarVacunas();
    assert.ok(vacunas.length > 0, 'Faltan las vacunas del seeder');
  });

  after(async () => {
    await repos?.cerrar();
  });

  it('lista las vacunas activas con ID string', () => {
    assert.equal(typeof vacunas[0].id_vacuna, 'string');
    assert.ok(vacunas.every((v) => v.estado === 'Activa'));
  });

  it('guarda controles como subcolección del paciente y calcula el IMC', async () => {
    const { id_paciente: id, id_historial: idHistorial } = await nuevoPaciente();
    const antiguo = await repos.seguimiento.agregarControl(id, { fecha_control: '2026-01-10', peso: 12, talla: 90 }, actor);
    const reciente = await repos.seguimiento.agregarControl(id, {
      fecha_control: '2026-03-10', peso: 14.2, talla: 95, perimetro_cefalico: 49.5, observaciones: 'Buen desarrollo',
    }, actor);

    assert.equal(typeof reciente.id_control_crecimiento, 'string');
    assert.equal(reciente.id_historial, idHistorial);
    assert.equal(reciente.indice_masa_corporal, 15.73);
    assert.equal(antiguo.indice_masa_corporal, 14.81);

    const lista = await repos.seguimiento.listarControles(id);
    assert.deepEqual(lista.map((c) => c.id_control_crecimiento), [reciente.id_control_crecimiento, antiguo.id_control_crecimiento]);
    assert.equal(lista[0]._creada_en, undefined);
  });

  it('un paciente inexistente no recibe controles ni vacunas', async () => {
    for (const id of ['abc', '999999999', 'a'.repeat(20)]) {
      await assert.rejects(repos.seguimiento.agregarControl(id, { fecha_control: '2026-01-10' }, actor), errores.NoEncontrado);
      await assert.rejects(repos.seguimiento.listarControles(id), errores.NoEncontrado);
      await assert.rejects(repos.seguimiento.registrarVacuna(id, { id_vacuna: vacunas[0].id_vacuna, numero_dosis: 'Primera', fecha_aplicacion: '2026-01-10' }, actor), errores.NoEncontrado);
      await assert.rejects(repos.seguimiento.listarRegistroVacunas(id), errores.NoEncontrado);
    }
  });

  it('un control de una consulta ajena es una referencia inválida y no se guarda', async () => {
    const { id_paciente: id } = await nuevoPaciente();
    await assert.rejects(
      repos.seguimiento.agregarControl(id, { fecha_control: '2026-01-10', id_consulta: '999999999' }, actor),
      errores.DatosInvalidos,
    );
    assert.deepEqual(await repos.seguimiento.listarControles(id), []);
  });

  it('registra vacunas sin repetir el mismo registro', async () => {
    const { id_paciente: id, id_historial: idHistorial } = await nuevoPaciente();
    const datos = {
      id_vacuna: vacunas[0].id_vacuna, numero_dosis: 'Primera', fecha_aplicacion: '2026-02-01',
      lote: 'L-123', centro_aplicacion: 'Centro pediátrico', proxima_dosis: '2026-04-01',
    };
    const registro = await repos.seguimiento.registrarVacuna(id, datos, actor);
    assert.equal(registro.id_historial, idHistorial);
    assert.equal(registro.nombre_vacuna, vacunas[0].nombre);
    assert.equal(registro.lote, 'L-123');

    await assert.rejects(repos.seguimiento.registrarVacuna(id, datos, actor), errores.RegistroDuplicado);
    await repos.seguimiento.registrarVacuna(id, { ...datos, numero_dosis: 'Segunda', fecha_aplicacion: '2026-04-01' }, actor);
    await assert.rejects(
      repos.seguimiento.registrarVacuna(id, { ...datos, id_vacuna: '999999999' }, actor),
      errores.DatosInvalidos,
    );

    const lista = await repos.seguimiento.listarRegistroVacunas(id);
    assert.deepEqual(lista.map((r) => r.numero_dosis), ['Segunda', 'Primera']);
  });

  it('admite un refuerzo repetido en otra fecha, pero no dos veces en la misma', async () => {
    const { id_paciente: id } = await nuevoPaciente();
    const refuerzo = { id_vacuna: vacunas[0].id_vacuna, numero_dosis: 'Refuerzo', fecha_aplicacion: '2026-02-01' };
    await repos.seguimiento.registrarVacuna(id, refuerzo, actor);
    await repos.seguimiento.registrarVacuna(id, { ...refuerzo, fecha_aplicacion: '2026-08-01' }, actor);
    await assert.rejects(repos.seguimiento.registrarVacuna(id, refuerzo, actor), errores.RegistroDuplicado);
    assert.equal((await repos.seguimiento.listarRegistroVacunas(id)).length, 2);
  });

  it('dos registros idénticos simultáneos dejan uno solo', async () => {
    const { id_paciente: id } = await nuevoPaciente();
    const datos = { id_vacuna: vacunas[0].id_vacuna, numero_dosis: 'Refuerzo', fecha_aplicacion: '2026-02-01' };
    const resultados = await Promise.allSettled([
      repos.seguimiento.registrarVacuna(id, datos, actor),
      repos.seguimiento.registrarVacuna(id, datos, actor),
    ]);
    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
    assert.ok(resultados.find((r) => r.status === 'rejected').reason instanceof errores.RegistroDuplicado);
    assert.equal((await repos.seguimiento.listarRegistroVacunas(id)).length, 1);
  });
});
