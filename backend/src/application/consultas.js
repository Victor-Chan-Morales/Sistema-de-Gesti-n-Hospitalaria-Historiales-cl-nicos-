const { NoEncontrado } = require('../domain/errores');
const esquemas = require('../domain/esquemas');
const { validar } = require('../domain/validacion');
const { ahora, hoy, desplazarSegundos } = require('../domain/fechas');
const reglas = require('../domain/reglas');
const { exigirPaciente } = require('./pacientes');

async function exigirConsulta(repos, idConsulta) {
  const consulta = await repos.consultas.obtener(idConsulta);
  if (!consulta) throw new NoEncontrado('La consulta no existe.');
  return consulta;
}

async function exigirConsultaEditable(repos, idConsulta) {
  const consulta = await exigirConsulta(repos, idConsulta);
  reglas.exigirConsultaEditable(consulta);
  reglas.exigirPacienteActivoParaAtencion(await exigirPaciente(repos, consulta.id_paciente));
  return consulta;
}

const completarTratamiento = (tratamiento) => {
  const completo = { estado: 'Activo', fecha_inicio: hoy(), ...tratamiento };
  reglas.exigirFechasTratamiento(completo);
  return completo;
};

const completarDiagnostico = (diagnostico) => ({ fecha_registro: hoy(), ...diagnostico });

const completarReceta = (receta) => {
  reglas.exigirRecetaConMedicamentos(receta);
  return { fecha_receta: hoy(), ...receta };
};

// Regla 10: antes de recetar se revisan las alergias del paciente.
async function revisarAlergias(repos, idPaciente, receta) {
  if (!receta) return [];
  const ids = receta.detalles.map((d) => d.id_medicamento);
  const [medicamentos, alergias] = await Promise.all([
    repos.catalogos.medicamentos({ ids }),
    repos.historiales.listarAlergias(idPaciente),
  ]);
  return reglas.detectarAlergiasRelacionadas(medicamentos, alergias);
}

// Registra consulta, signos, diagnósticos, tratamientos y receta como una unidad.
async function registrarAtencion(repos, actor, datos) {
  const limpio = validar(datos, esquemas.nuevaConsulta);
  reglas.exigirPacienteActivoParaAtencion(await exigirPaciente(repos, limpio.id_paciente));

  const fechaHora = limpio.fecha_hora ?? ahora();
  const atencion = {
    ...limpio,
    fecha_hora: fechaHora,
    estado: limpio.estado ?? 'Abierta',
    id_usuario_profesional: actor.id_usuario, // Regla 22: el autor sale del token.
    signos_vitales: limpio.signos_vitales
      ? { ...limpio.signos_vitales, fecha_registro: fechaHora }
      : undefined,
    diagnosticos: (limpio.diagnosticos ?? []).map(completarDiagnostico),
    tratamientos: (limpio.tratamientos ?? []).map(completarTratamiento),
    receta: limpio.receta ? completarReceta(limpio.receta) : undefined,
  };

  const advertencias = await revisarAlergias(repos, limpio.id_paciente, atencion.receta);
  const ventana = {
    desde: desplazarSegundos(fechaHora, -reglas.VENTANA_DUPLICADO_SEGUNDOS),
    hasta: desplazarSegundos(fechaHora, reglas.VENTANA_DUPLICADO_SEGUNDOS),
  };
  const consulta = await repos.consultas.registrarAtencion(atencion, actor, ventana);
  return { consulta, advertencias };
}

const obtenerConsulta = exigirConsulta;

async function cambiarEstadoConsulta(repos, actor, idConsulta, datos) {
  const { estado } = validar(datos, esquemas.estadoConsulta);
  const consulta = await exigirConsulta(repos, idConsulta);
  reglas.exigirTransicionConsulta(consulta.estado, estado);
  return repos.consultas.cambiarEstado(idConsulta, estado, actor);
}

async function agregarDiagnostico(repos, actor, idConsulta, datos) {
  const limpio = validar(datos, esquemas.diagnostico);
  await exigirConsultaEditable(repos, idConsulta);
  return repos.consultas.agregarDiagnostico(idConsulta, completarDiagnostico(limpio), actor);
}

async function agregarTratamiento(repos, actor, idConsulta, datos) {
  const limpio = validar(datos, esquemas.tratamiento);
  await exigirConsultaEditable(repos, idConsulta);
  return repos.consultas.agregarTratamiento(idConsulta, completarTratamiento(limpio), actor);
}

async function agregarReceta(repos, actor, idConsulta, datos) {
  const limpio = completarReceta(validar(datos, esquemas.receta));
  const { id_paciente: idPaciente } = await exigirConsultaEditable(repos, idConsulta);
  const advertencias = await revisarAlergias(repos, idPaciente, limpio);
  const consulta = await repos.consultas.agregarReceta(idConsulta, limpio, actor);
  return { consulta, advertencias };
}

module.exports = {
  registrarAtencion,
  obtenerConsulta,
  cambiarEstadoConsulta,
  agregarDiagnostico,
  agregarTratamiento,
  agregarReceta,
};
