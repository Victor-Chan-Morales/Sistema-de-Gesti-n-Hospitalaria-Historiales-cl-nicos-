// Casos de uso del Centro Médico Pediátrico: controles de crecimiento y vacunación.

const { ReglaNegocio } = require('../domain/errores');
const esquemas = require('../domain/esquemasInstitucionales');
const { validar } = require('../domain/validacion');
const { hoy } = require('../domain/fechas');
const reglas = require('../domain/reglas');
const pediatria = require('../domain/pediatria');
const { exigirPaciente } = require('./pacientes');

// El seguimiento existe solo en el motor del centro pediátrico.
function exigirServicio(repos) {
  if (!repos.seguimiento) throw new ReglaNegocio('Tu institución no ofrece el seguimiento pediátrico.');
  return repos.seguimiento;
}

// Registrar exige un paciente activo y menor de edad; consultar no exige nada más que existir.
async function exigirPacienteParaRegistro(repos, idPaciente) {
  const paciente = await exigirPaciente(repos, idPaciente);
  reglas.exigirPacienteActivoParaAtencion(paciente);
  pediatria.exigirPacientePediatrico(paciente);
  return paciente;
}

async function listarVacunas(repos) {
  return exigirServicio(repos).listarVacunas();
}

async function agregarControl(repos, actor, idPaciente, datos) {
  const seguimiento = exigirServicio(repos);
  const limpio = validar(datos, esquemas.nuevoControlCrecimiento);
  const paciente = await exigirPacienteParaRegistro(repos, idPaciente);

  const control = { fecha_control: hoy(), ...limpio };
  pediatria.exigirFechaNoFutura(control.fecha_control, hoy(), 'La fecha del control');
  pediatria.exigirNoAnteriorAlNacimiento(control.fecha_control, paciente.fecha_nacimiento, 'La fecha del control');
  pediatria.exigirAlgunaMedida(control);
  return seguimiento.agregarControl(idPaciente, control, actor);
}

async function listarControles(repos, idPaciente) {
  return exigirServicio(repos).listarControles(idPaciente);
}

async function registrarVacuna(repos, actor, idPaciente, datos) {
  const seguimiento = exigirServicio(repos);
  const limpio = validar(datos, esquemas.nuevoRegistroVacuna);
  const paciente = await exigirPacienteParaRegistro(repos, idPaciente);

  const registro = { fecha_aplicacion: hoy(), ...limpio };
  pediatria.exigirFechaNoFutura(registro.fecha_aplicacion, hoy(), 'La fecha de aplicación');
  pediatria.exigirNoAnteriorAlNacimiento(registro.fecha_aplicacion, paciente.fecha_nacimiento, 'La fecha de aplicación');
  pediatria.exigirProximaDosisPosterior(registro.fecha_aplicacion, registro.proxima_dosis);
  return seguimiento.registrarVacuna(idPaciente, registro, actor);
}

async function listarRegistroVacunas(repos, idPaciente) {
  return exigirServicio(repos).listarRegistroVacunas(idPaciente);
}

module.exports = { listarVacunas, agregarControl, listarControles, registrarVacuna, listarRegistroVacunas };
