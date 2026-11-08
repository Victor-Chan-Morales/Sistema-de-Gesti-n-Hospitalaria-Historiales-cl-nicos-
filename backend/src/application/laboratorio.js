// Casos de uso del Laboratorio Clínico: órdenes de examen y resultados.

const { NoEncontrado, ReglaNegocio } = require('../domain/errores');
const esquemas = require('../domain/esquemasInstitucionales');
const { validar } = require('../domain/validacion');
const { ahora, hoy, desplazarSegundos } = require('../domain/fechas');
const reglas = require('../domain/reglas');
const laboratorio = require('../domain/laboratorio');
const { exigirPaciente } = require('./pacientes');

// Las órdenes y resultados existen solo en el motor del laboratorio: otra institución no los tiene.
function exigirServicio(repos) {
  if (!repos.examenes) throw new ReglaNegocio('Tu institución no ofrece el servicio de laboratorio.');
  return repos.examenes;
}

async function exigirOrden(examenes, idOrden) {
  const orden = await examenes.obtenerOrden(idOrden);
  if (!orden) throw new NoEncontrado('La orden no existe.');
  return orden;
}

async function listarTipos(repos, filtros = {}) {
  const texto = typeof filtros.texto === 'string' ? filtros.texto.trim() || undefined : undefined;
  return exigirServicio(repos).listarTipos({ texto });
}

async function crearOrden(repos, actor, datos) {
  const examenes = exigirServicio(repos);
  const limpio = validar(datos, esquemas.nuevaOrdenLaboratorio);
  reglas.exigirPacienteActivoParaAtencion(await exigirPaciente(repos, limpio.id_paciente));
  const ids = limpio.examenes.map((e) => e.id_tipo_examen);
  laboratorio.exigirExamenesDeOrden(ids);

  const fechaOrden = ahora();
  const ventana = {
    desde: desplazarSegundos(fechaOrden, -reglas.VENTANA_DUPLICADO_SEGUNDOS),
    hasta: desplazarSegundos(fechaOrden, reglas.VENTANA_DUPLICADO_SEGUNDOS),
  };
  return examenes.crearOrden({
    ...limpio,
    examenes: ids,
    prioridad: limpio.prioridad ?? 'Normal',
    fecha_orden: fechaOrden,
    // Regla 22: quien registra queda como solicitante si no se indica otro profesional.
    id_usuario_solicitante: limpio.id_usuario_solicitante ?? actor.id_usuario,
  }, actor, ventana);
}

async function obtenerOrden(repos, idOrden) {
  return exigirOrden(exigirServicio(repos), idOrden);
}

async function listarOrdenes(repos, filtros = {}) {
  const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return exigirServicio(repos).listarOrdenes({
    id_paciente: texto(filtros.id_paciente),
    estado: texto(filtros.estado),
  });
}

async function cambiarEstadoOrden(repos, actor, idOrden, datos) {
  const examenes = exigirServicio(repos);
  const { estado } = validar(datos, esquemas.estadoOrden);
  const orden = await exigirOrden(examenes, idOrden);
  laboratorio.exigirTransicionOrden(orden.estado, estado);
  return examenes.cambiarEstadoOrden(idOrden, estado, actor);
}

async function registrarResultado(repos, actor, idOrden, datos) {
  const examenes = exigirServicio(repos);
  const limpio = validar(datos, esquemas.nuevoResultado);
  const orden = await exigirOrden(examenes, idOrden);
  laboratorio.exigirOrdenAbierta(orden);
  laboratorio.exigirExamenDeLaOrden(orden, limpio.id_tipo_examen);

  const resultado = { fecha_resultado: hoy(), ...limpio };
  laboratorio.exigirFechasResultado(resultado);
  return examenes.registrarResultado(idOrden, resultado, actor);
}

module.exports = { listarTipos, crearOrden, obtenerOrden, listarOrdenes, cambiarEstadoOrden, registrarResultado };
