const { randomUUID } = require('node:crypto');
const { NoEncontrado, DatosInvalidos } = require('../domain/errores');
const esquemas = require('../domain/esquemas');
const { validar } = require('../domain/validacion');
const { hoy } = require('../domain/fechas');
const reglas = require('../domain/reglas');

const LIMITE_MAXIMO = 100;
const ESTADOS_PACIENTE = ['Activo', 'Archivado', 'Inactivo'];

async function exigirPaciente(repos, idPaciente) {
  const paciente = await repos.pacientes.obtener(idPaciente);
  if (!paciente) throw new NoEncontrado('El paciente no existe.');
  return paciente;
}

function generarCodigoHistorial(idInstitucion) {
  return `HC-${idInstitucion}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

// Utilidad para generar nuevos historiales: el paciente nace con su historial.
async function registrarPaciente(repos, actor, datos) {
  const limpio = validar(datos, esquemas.paciente);
  reglas.exigirFechaNacimientoValida(limpio.fecha_nacimiento);
  reglas.exigirRepresentanteSiEsMenor(limpio.fecha_nacimiento, limpio.representantes);

  return repos.pacientes.crear({
    telefonos: [],
    correos: [],
    contactos_emergencia: [],
    representantes: [],
    ...limpio,
    id_institucion: actor.id_institucion,
    codigo_historial: generarCodigoHistorial(actor.id_institucion),
    fecha_registro: hoy(),
  }, actor);
}

async function buscarPacientes(repos, filtros = {}) {
  const limite = Number(filtros.limite ?? 20);
  const desplazamiento = Number(filtros.desplazamiento ?? 0);
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAXIMO) {
    throw new DatosInvalidos(`limite debe ser un entero entre 1 y ${LIMITE_MAXIMO}.`);
  }
  if (!Number.isInteger(desplazamiento) || desplazamiento < 0) {
    throw new DatosInvalidos('desplazamiento debe ser un entero mayor o igual que 0.');
  }
  if (filtros.estado && !ESTADOS_PACIENTE.includes(filtros.estado)) {
    throw new DatosInvalidos(`estado debe ser uno de: ${ESTADOS_PACIENTE.join(', ')}.`);
  }
  if (filtros.texto !== undefined && typeof filtros.texto !== 'string') {
    throw new DatosInvalidos('texto debe aparecer una sola vez.');
  }
  return repos.pacientes.buscar({
    texto: filtros.texto?.trim() || undefined,
    estado: filtros.estado,
    limite,
    desplazamiento,
  });
}

const obtenerPaciente = exigirPaciente;

async function actualizarPaciente(repos, actor, idPaciente, cambios) {
  const limpio = validar(cambios, esquemas.paciente, { parcial: true });
  const actual = await exigirPaciente(repos, idPaciente);

  const fechaNacimiento = limpio.fecha_nacimiento ?? actual.fecha_nacimiento;
  reglas.exigirFechaNacimientoValida(fechaNacimiento);
  reglas.exigirRepresentanteSiEsMenor(fechaNacimiento, limpio.representantes ?? actual.representantes);

  return repos.pacientes.actualizar(idPaciente, limpio, actor);
}

// Regla 21: baja del paciente por traslado, fallecimiento u otra causa administrativa.
async function archivarPaciente(repos, actor, idPaciente, datos) {
  const { estado, motivo } = validar(datos, esquemas.archivoPaciente);
  reglas.exigirPacienteArchivable(await exigirPaciente(repos, idPaciente));
  return repos.pacientes.archivar(idPaciente, { estado, motivo, fecha: hoy() }, actor);
}

async function obtenerHistorialCompleto(repos, idPaciente) {
  const historial = await repos.historiales.obtenerCompleto(idPaciente);
  if (!historial) throw new NoEncontrado('El paciente no existe.');
  return historial;
}

async function listarAlergias(repos, idPaciente) {
  await exigirPaciente(repos, idPaciente);
  return repos.historiales.listarAlergias(idPaciente);
}

async function agregarAlergia(repos, actor, idPaciente, datos) {
  const limpio = validar(datos, esquemas.alergia);
  reglas.exigirPacienteActivoParaAtencion(await exigirPaciente(repos, idPaciente));
  return repos.historiales.agregarAlergia(idPaciente, { ...limpio, fecha_registro: hoy() }, actor);
}

async function agregarAntecedente(repos, actor, idPaciente, datos) {
  const limpio = validar(datos, esquemas.antecedente);
  reglas.exigirPacienteActivoParaAtencion(await exigirPaciente(repos, idPaciente));
  return repos.historiales.agregarAntecedente(idPaciente, { ...limpio, fecha_registro: hoy() }, actor);
}

module.exports = {
  exigirPaciente,
  registrarPaciente,
  buscarPacientes,
  obtenerPaciente,
  actualizarPaciente,
  archivarPaciente,
  obtenerHistorialCompleto,
  listarAlergias,
  agregarAlergia,
  agregarAntecedente,
};
