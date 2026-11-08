// Colecciones e índices del Laboratorio Clínico. Se crean al primer uso, de forma idempotente.
// Los índices únicos son la defensa real contra duplicados: MongoDB no tiene claves foráneas
// ni restricciones declarativas, así que la unicidad se delega al motor y no a la aplicación.

const INDICES = {
  usuarios: [[{ usuario: 1 }, { unique: true }]],
  pacientes: [
    // Parcial: varios pacientes sin documento (null) no se consideran duplicados.
    [{ dpi_o_documento: 1 }, { unique: true, partialFilterExpression: { dpi_o_documento: { $type: 'string' } } }],
    [{ apellidos: 1, nombres: 1 }, {}],
  ],
  historiales: [
    [{ id_paciente: 1 }, { unique: true }],
    [{ codigo_historial: 1 }, { unique: true }],
  ],
  citas: [
    // Una sola cita Programada idéntica por paciente, profesional y hora, sin carreras.
    [{ id_paciente: 1, id_usuario_profesional: 1, fecha_hora: 1 },
      { unique: true, partialFilterExpression: { estado: 'Programada' } }],
    [{ fecha_hora: 1 }, {}],
  ],
  consultas: [[{ id_historial: 1, fecha_hora: -1 }, {}]],
  ordenes_laboratorio: [[{ id_historial: 1, fecha_orden: -1 }, {}]],
  // Un resultado por examen de la orden. Los resultados viven aparte de la orden y del paciente
  // porque su estructura varía y su número crece sin límite.
  resultados_laboratorio: [
    [{ id_orden_laboratorio: 1, id_tipo_examen: 1 }, { unique: true }],
    [{ id_historial: 1, fecha_resultado: -1 }, {}],
  ],
  tipos_examen: [[{ nombre: 1 }, { unique: true }]],
  catalogo_diagnostico: [[{ codigo_clinico: 1 }, { unique: true }]],
  medicamentos: [[{ nombre: 1, concentracion: 1 }, { unique: true }]],
  catalogo_alergia: [[{ sustancia: 1 }, { unique: true }]],
  auditoria: [[{ entidad: 1, id_entidad: 1 }, {}]],
};

async function asegurarIndices(db) {
  for (const [coleccion, indices] of Object.entries(INDICES)) {
    for (const [campos, opciones] of indices) {
      await db.collection(coleccion).createIndex(campos, opciones);
    }
  }
}

module.exports = { INDICES, asegurarIndices };
