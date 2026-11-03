// Reglas de negocio puras: no consultan ninguna base de datos.
// Los números de regla corresponden a la Entrega I.

const { ReglaNegocio } = require('./errores');
const { edadEnAnios, hoy } = require('./fechas');
const { ROLES_PROFESIONALES } = require('./roles');

const MAYORIA_DE_EDAD = 18;
const VENTANA_DUPLICADO_SEGUNDOS = 30;

const esMenorDeEdad = (fechaNacimiento, referencia) =>
  edadEnAnios(fechaNacimiento, referencia) < MAYORIA_DE_EDAD;

function exigirFechaNacimientoValida(fechaNacimiento, referencia = hoy()) {
  if (fechaNacimiento > referencia) {
    throw new ReglaNegocio('La fecha de nacimiento no puede estar en el futuro.');
  }
}

// Regla 12
function exigirRepresentanteSiEsMenor(fechaNacimiento, representantes, referencia) {
  if (esMenorDeEdad(fechaNacimiento, referencia) && !representantes?.length) {
    throw new ReglaNegocio('Un paciente menor de edad debe tener al menos un representante o encargado.');
  }
}

function exigirPacienteActivoParaCita(paciente) {
  if (paciente.estado !== 'Activo') {
    throw new ReglaNegocio(`No se pueden crear citas para un paciente en estado ${paciente.estado}.`);
  }
}

function exigirPacienteActivoParaAtencion(paciente) {
  if (paciente.estado !== 'Activo') {
    throw new ReglaNegocio(`No se pueden registrar datos clínicos de un paciente en estado ${paciente.estado}.`);
  }
}

// Regla 21: el historial se archiva, nunca se elimina.
function exigirPacienteArchivable(paciente) {
  if (paciente.estado !== 'Activo') {
    throw new ReglaNegocio(`El paciente ya se encuentra en estado ${paciente.estado}.`);
  }
}

function exigirProfesionalActivo(usuario) {
  if (!usuario || usuario.estado !== 'Activo' || !ROLES_PROFESIONALES.includes(usuario.rol)) {
    throw new ReglaNegocio('La cita debe asignarse a un profesional de salud activo de la institución.');
  }
}

function exigirFechaFutura(fechaHora, referencia) {
  if (fechaHora < referencia) {
    throw new ReglaNegocio('La fecha y hora de la cita no puede estar en el pasado.');
  }
}

const ESTADOS_FINALES_CITA = ['Atendida', 'Cancelada', 'No Asistió'];

function exigirCitaModificable(cita) {
  if (ESTADOS_FINALES_CITA.includes(cita.estado)) {
    throw new ReglaNegocio(`Una cita en estado ${cita.estado} ya no se puede modificar.`);
  }
}

function exigirConsultaEditable(consulta) {
  if (consulta.estado === 'Anulada') {
    throw new ReglaNegocio('Una consulta anulada no se puede modificar.');
  }
}

function exigirTransicionConsulta(actual, nuevo) {
  const permitidas = { Abierta: ['Finalizada', 'Anulada'], Finalizada: ['Anulada'], Anulada: [] };
  if (!permitidas[actual]?.includes(nuevo)) {
    throw new ReglaNegocio(`Una consulta no puede pasar de ${actual} a ${nuevo}.`);
  }
}

function exigirRecetaConMedicamentos(receta) {
  if (receta && receta.detalles.length === 0) {
    throw new ReglaNegocio('Una receta debe incluir al menos un medicamento.');
  }
}

function exigirFechasTratamiento(tratamiento) {
  if (tratamiento.fecha_fin && tratamiento.fecha_fin < tratamiento.fecha_inicio) {
    throw new ReglaNegocio('La fecha de fin del tratamiento no puede ser anterior a la de inicio.');
  }
}

// Regla 10: avisa, no bloquea. La decisión clínica es del profesional.
function detectarAlergiasRelacionadas(medicamentosRecetados, alergiasPaciente) {
  const normalizar = (s) => (s ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

  const advertencias = [];
  for (const medicamento of medicamentosRecetados) {
    const nombres = [medicamento.nombre, medicamento.principio_activo].map(normalizar).filter(Boolean);
    for (const alergia of alergiasPaciente) {
      const sustancia = normalizar(alergia.sustancia);
      if (sustancia && nombres.some((n) => n.includes(sustancia) || sustancia.includes(n))) {
        const gravedad = alergia.nivel_gravedad ? ` (${alergia.nivel_gravedad})` : '';
        advertencias.push(`El paciente tiene alergia registrada a ${alergia.sustancia}${gravedad}: revisar ${medicamento.nombre}.`);
      }
    }
  }
  return advertencias;
}

module.exports = {
  VENTANA_DUPLICADO_SEGUNDOS,
  esMenorDeEdad,
  exigirFechaNacimientoValida,
  exigirRepresentanteSiEsMenor,
  exigirPacienteActivoParaCita,
  exigirPacienteActivoParaAtencion,
  exigirPacienteArchivable,
  exigirProfesionalActivo,
  exigirFechaFutura,
  exigirCitaModificable,
  exigirConsultaEditable,
  exigirTransicionConsulta,
  exigirRecetaConMedicamentos,
  exigirFechasTratamiento,
  detectarAlergiasRelacionadas,
};
