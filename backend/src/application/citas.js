const { NoEncontrado, DatosInvalidos } = require('../domain/errores');
const esquemas = require('../domain/esquemas');
const { validar } = require('../domain/validacion');
const { ahora, normalizarFechaHora } = require('../domain/fechas');
const reglas = require('../domain/reglas');
const { exigirPaciente } = require('./pacientes');

async function exigirCita(repos, idCita) {
  const cita = await repos.citas.obtener(idCita);
  if (!cita) throw new NoEncontrado('La cita no existe.');
  return cita;
}

async function exigirProfesional(repos, idUsuario) {
  reglas.exigirProfesionalActivo(await repos.usuarios.obtener(idUsuario));
}

async function crearCita(repos, actor, datos) {
  const limpio = validar(datos, esquemas.nuevaCita);
  reglas.exigirFechaFutura(limpio.fecha_hora, ahora());
  reglas.exigirPacienteActivoParaCita(await exigirPaciente(repos, limpio.id_paciente));
  await exigirProfesional(repos, limpio.id_usuario_profesional);
  return repos.citas.crear({ ...limpio, id_institucion: actor.id_institucion }, actor);
}

const obtenerCita = exigirCita;

async function listarCitas(repos, filtros = {}) {
  const limpios = {};
  for (const campo of ['id_paciente', 'id_usuario_profesional', 'estado']) {
    if (filtros[campo]) limpios[campo] = String(filtros[campo]);
  }
  for (const campo of ['desde', 'hasta']) {
    if (filtros[campo]) {
      limpios[campo] = normalizarFechaHora(filtros[campo]);
      if (!limpios[campo]) throw new DatosInvalidos(`${campo} debe tener formato YYYY-MM-DDTHH:MM:SS.`);
    }
  }
  return repos.citas.listar(limpios);
}

async function actualizarCita(repos, actor, idCita, cambios) {
  const limpio = validar(cambios, esquemas.cambiosCita, { parcial: true });
  reglas.exigirCitaModificable(await exigirCita(repos, idCita));
  if (limpio.fecha_hora) reglas.exigirFechaFutura(limpio.fecha_hora, ahora());
  if (limpio.id_usuario_profesional) await exigirProfesional(repos, limpio.id_usuario_profesional);
  return repos.citas.actualizar(idCita, limpio, actor);
}

module.exports = { crearCita, obtenerCita, listarCitas, actualizarCita };
