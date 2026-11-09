// Reglas de negocio de citas, consultas, laboratorio y pediatría. Dominio puro y casos de uso
// contra el repositorio en memoria (mismo comportamiento que los cuatro adaptadores).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ReglaNegocio, ConflictoHorario } = require('../../src/domain/errores');
const reglas = require('../../src/domain/reglas');
const laboratorio = require('../../src/domain/laboratorio');
const pediatria = require('../../src/domain/pediatria');
const citas = require('../../src/application/citas');
const consultas = require('../../src/application/consultas');
const pacientes = require('../../src/application/pacientes');
const { manejarErrores } = require('../../src/adapters/http/errores');
const { crearRepoMemoria } = require('./apoyo/repoMemoria');

const MEDICO = { id_usuario: '3', id_institucion: 1, rol: 'Médico' };
const ADMIN = { id_usuario: '1', id_institucion: 1, rol: 'Administrador' };

const nuevoPaciente = (repos) => pacientes.registrarPaciente(repos, ADMIN, {
  nombres: 'Regla', apellidos: 'Prueba', fecha_nacimiento: '1990-05-20', sexo: 'F', tipo_sangre: 'A+',
  telefonos: [], correos: [], contactos_emergencia: [], representantes: [],
});

describe('reglas de citas y consultas (dominio)', () => {
  it('una cita no pasa a Atendida a mano; las demás estados sí', () => {
    assert.throws(() => reglas.exigirEstadoCitaManual('Atendida'), ReglaNegocio);
    assert.doesNotThrow(() => reglas.exigirEstadoCitaManual('Cancelada'));
    assert.doesNotThrow(() => reglas.exigirEstadoCitaManual(undefined));
  });

  it('una consulta no puede ser futura ni anterior al nacimiento', () => {
    assert.throws(() => reglas.exigirFechaAtencionValida('2099-01-01T10:00:00', '1990-01-01', '2026-11-09T10:00:00'), ReglaNegocio);
    assert.throws(() => reglas.exigirFechaAtencionValida('1980-01-01T10:00:00', '1990-01-01', '2026-11-09T10:00:00'), ReglaNegocio);
    assert.doesNotThrow(() => reglas.exigirFechaAtencionValida('2026-11-09T09:00:00', '1990-01-01', '2026-11-09T10:00:00'));
  });

  it('una consulta ligada a una cita solo la registra su profesional', () => {
    assert.throws(() => reglas.exigirCitaDelProfesional({ id_usuario_profesional: '1' }, '3'), ReglaNegocio);
    assert.doesNotThrow(() => reglas.exigirCitaDelProfesional({ id_usuario_profesional: '3' }, 3));
  });
});

describe('reglas de laboratorio (dominio)', () => {
  const orden = '2026-11-09T08:00:00';
  const hoyStr = '2026-11-09';

  it('un resultado debe traer algún contenido', () => {
    assert.throws(() => laboratorio.exigirResultadoConContenido({}), ReglaNegocio);
    assert.doesNotThrow(() => laboratorio.exigirResultadoConContenido({ resultado_general: 'Normal' }));
    assert.doesNotThrow(() => laboratorio.exigirResultadoConContenido({ valores_detallados: [{ parametro: 'Hb' }] }));
  });

  it('las fechas del resultado son coherentes con la orden y no son futuras', () => {
    const revisar = (resultado) => () => laboratorio.exigirFechasResultado(resultado, orden, hoyStr);
    assert.throws(revisar({ fecha_toma_muestra: '2026-11-10' }), ReglaNegocio);
    assert.throws(revisar({ fecha_resultado: '2026-11-10' }), ReglaNegocio);
    assert.throws(revisar({ fecha_toma_muestra: '2000-01-01' }), ReglaNegocio);
    assert.throws(revisar({ fecha_toma_muestra: '2026-11-09', fecha_resultado: '2026-11-08' }), ReglaNegocio);
    assert.doesNotThrow(revisar({ fecha_toma_muestra: '2026-11-09', fecha_resultado: '2026-11-09' }));
  });

  it('una orden con resultados ya registrados no se cancela', () => {
    assert.throws(() => laboratorio.exigirSinResultadosParaCancelar({ resultados: [{}] }), ReglaNegocio);
    assert.doesNotThrow(() => laboratorio.exigirSinResultadosParaCancelar({ resultados: [] }));
  });
});

describe('reglas de pediatría (dominio)', () => {
  it('un control o una vacuna no puede ser anterior al nacimiento', () => {
    assert.throws(() => pediatria.exigirNoAnteriorAlNacimiento('2010-01-01', '2024-03-15', 'La fecha del control'), ReglaNegocio);
    assert.doesNotThrow(() => pediatria.exigirNoAnteriorAlNacimiento('2024-03-15', '2024-03-15', 'La fecha del control'));
  });
});

describe('reglas de citas y consultas (casos de uso)', () => {
  it('no se puede marcar una cita como Atendida desde la edición', async () => {
    const repos = crearRepoMemoria();
    const paciente = await nuevoPaciente(repos);
    const cita = await citas.crearCita(repos, MEDICO, {
      id_paciente: paciente.id_paciente, id_usuario_profesional: MEDICO.id_usuario, fecha_hora: '2099-03-10T10:00:00',
    });
    await assert.rejects(citas.actualizarCita(repos, MEDICO, cita.id_cita, { estado: 'Atendida' }), ReglaNegocio);
    assert.equal((await repos.citas.obtener(cita.id_cita)).estado, 'Programada');
  });

  it('una consulta futura o anterior al nacimiento se rechaza sin guardar nada', async () => {
    const repos = crearRepoMemoria();
    const paciente = await nuevoPaciente(repos);
    const base = { id_paciente: paciente.id_paciente, motivo_consulta: 'Revisión' };
    await assert.rejects(consultas.registrarAtencion(repos, MEDICO, { ...base, fecha_hora: '2099-01-01T10:00:00' }), ReglaNegocio);
    await assert.rejects(consultas.registrarAtencion(repos, MEDICO, { ...base, fecha_hora: '1980-01-01T10:00:00' }), ReglaNegocio);
    assert.deepEqual((await repos.historiales.obtenerCompleto(paciente.id_paciente)).consultas, []);
  });

  it('una consulta ligada a la cita de otro profesional se rechaza', async () => {
    const repos = crearRepoMemoria();
    const paciente = await nuevoPaciente(repos);
    const citaAjena = await repos.citas.crear({
      id_paciente: paciente.id_paciente, id_institucion: '1', id_usuario_profesional: ADMIN.id_usuario, fecha_hora: '2099-04-01T09:00:00',
    }, ADMIN);
    await assert.rejects(consultas.registrarAtencion(repos, MEDICO, {
      id_paciente: paciente.id_paciente, id_cita: citaAjena.id_cita, motivo_consulta: 'Ajena', fecha_hora: '2026-01-05T09:00:00',
    }), ReglaNegocio);
  });

  it('un conflicto de horario responde 409 con su código', () => {
    const respuesta = {
      estado: 0,
      cuerpo: null,
      status(codigo) { this.estado = codigo; return this; },
      json(cuerpo) { this.cuerpo = cuerpo; return this; },
    };
    manejarErrores(new ConflictoHorario('ocupado'), {}, respuesta, () => {});
    assert.equal(respuesta.estado, 409);
    assert.equal(respuesta.cuerpo.codigo, 'CONFLICTO_HORARIO');
  });
});
