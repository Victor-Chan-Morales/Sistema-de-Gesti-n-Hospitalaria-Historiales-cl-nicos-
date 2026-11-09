// Reglas del Laboratorio Clínico (reglas 16, 17 y 18 de la Entrega I).

const { ReglaNegocio } = require('./errores');

const PRIORIDADES = Object.freeze(['Normal', 'Urgente', 'Emergencia']);
const ESTADOS_ORDEN = Object.freeze(['Pendiente', 'En proceso', 'Finalizada', 'Entregada', 'Cancelada']);

// Cola de trabajo del laboratorio: primero lo que sigue abierto (pendiente o en proceso), por
// urgencia (Emergencia, Urgente, Normal) y, a igual urgencia, la orden que lleva más tiempo
// esperando. Después va lo ya cerrado, de la más reciente a la más antigua.
const RANGO_PRIORIDAD = Object.freeze({ Emergencia: 0, Urgente: 1, Normal: 2 });
const ESTADOS_ABIERTOS = Object.freeze(['Pendiente', 'En proceso']);

function ordenarPorUrgencia(ordenes) {
  const abierta = (o) => ESTADOS_ABIERTOS.includes(o.estado);
  const rango = (o) => RANGO_PRIORIDAD[o.prioridad] ?? RANGO_PRIORIDAD.Normal;
  const fecha = (o) => String(o.fecha_orden ?? '');
  return [...ordenes].sort((a, b) => {
    if (abierta(a) !== abierta(b)) return abierta(a) ? -1 : 1;
    if (abierta(a)) return rango(a) - rango(b) || fecha(a).localeCompare(fecha(b));
    return fecha(b).localeCompare(fecha(a));
  });
}

const TRANSICIONES_ORDEN = Object.freeze({
  Pendiente: ['En proceso', 'Cancelada'],
  'En proceso': ['Finalizada', 'Cancelada'],
  Finalizada: ['Entregada'],
  Entregada: [],
  Cancelada: [],
});

function exigirTransicionOrden(actual, nuevo) {
  if (!TRANSICIONES_ORDEN[actual]?.includes(nuevo)) {
    throw new ReglaNegocio(`Una orden no puede pasar de ${actual} a ${nuevo}.`);
  }
}

// Una orden finalizada ya no admite resultados: si se finalizara con exámenes sin resultado,
// quedaría cerrada sin poder completarse. Por eso solo se finaliza con todos sus resultados.
function exigirResultadosCompletos(orden) {
  if ((orden.resultados ?? []).length < (orden.examenes ?? []).length) {
    throw new ReglaNegocio('No se puede finalizar la orden: faltan resultados de algunos exámenes.');
  }
}

// Solo una orden pendiente o en proceso admite resultados.
function exigirOrdenAbierta(orden) {
  if (!['Pendiente', 'En proceso'].includes(orden.estado)) {
    throw new ReglaNegocio(`No se pueden registrar resultados en una orden ${orden.estado}.`);
  }
}

// Regla 17: una orden incluye uno o varios exámenes, sin repetir el mismo.
function exigirExamenesDeOrden(ids) {
  if (!ids?.length) throw new ReglaNegocio('Una orden debe incluir al menos un examen.');
  if (new Set(ids.map(String)).size !== ids.length) {
    throw new ReglaNegocio('Una orden no puede incluir el mismo examen más de una vez.');
  }
}

// Regla 16: el resultado pertenece a una orden y debe ser de uno de sus exámenes.
function exigirExamenDeLaOrden(orden, idTipoExamen) {
  if (!orden.examenes.some((e) => e.id_tipo_examen === String(idTipoExamen))) {
    throw new ReglaNegocio('El examen no forma parte de la orden.');
  }
}

function exigirFechasResultado({ fecha_toma_muestra: toma, fecha_resultado: resultado }) {
  if (toma && resultado && resultado < toma) {
    throw new ReglaNegocio('La fecha del resultado no puede ser anterior a la toma de la muestra.');
  }
}

module.exports = {
  PRIORIDADES,
  ESTADOS_ORDEN,
  ordenarPorUrgencia,
  exigirTransicionOrden,
  exigirResultadosCompletos,
  exigirOrdenAbierta,
  exigirExamenesDeOrden,
  exigirExamenDeLaOrden,
  exigirFechasResultado,
};
