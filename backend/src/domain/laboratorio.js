// Reglas del Laboratorio Clínico (reglas 16, 17 y 18 de la Entrega I).

const { ReglaNegocio } = require('./errores');

const PRIORIDADES = Object.freeze(['Normal', 'Urgente', 'Emergencia']);
const ESTADOS_ORDEN = Object.freeze(['Pendiente', 'En proceso', 'Finalizada', 'Entregada', 'Cancelada']);

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
  exigirTransicionOrden,
  exigirOrdenAbierta,
  exigirExamenesDeOrden,
  exigirExamenDeLaOrden,
  exigirFechasResultado,
};
