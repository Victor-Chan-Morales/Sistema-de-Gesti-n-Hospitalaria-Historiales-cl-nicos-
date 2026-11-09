// Puertos de las funciones propias de cada institución. No forman parte del contrato común
// (repositorioClinico.js): un adaptador los expone como una propiedad adicional y solo existen
// en el motor de esa institución. Un cambio aquí no afecta a los demás motores.
//
// Mismas garantías que el puerto común: métodos asíncronos, IDs como string opacos, fechas
// 'YYYY-MM-DD' y 'YYYY-MM-DDTHH:MM:SS', errores de domain/errores.js, escritura atómica con
// su registro de auditoría. actor = { id_usuario, id_institucion, rol }.

// Laboratorio Clínico (MongoDB): órdenes de examen y resultados.
const CONTRATO_LABORATORIO = Object.freeze({
  examenes: {
    // ({ texto? }) => TipoExamen[] activos
    listarTipos: 1,
    // (datos, actor, { desde, hasta }) => Orden. datos: { id_paciente, id_usuario_solicitante?,
    // fecha_orden, prioridad, observaciones?, examenes: [id_tipo_examen] }. Estado inicial
    // 'Pendiente'. Lanza RegistroDuplicado si hay una orden idéntica en la ventana.
    crearOrden: 1,
    // (idOrden) => Orden con sus resultados | null
    obtenerOrden: 1,
    // ({ id_paciente?, estado? }) => Orden[] con sus resultados
    listarOrdenes: 1,
    // (idOrden, estado, actor) => Orden
    cambiarEstadoOrden: 1,
    // (idOrden, datos, actor) => Orden. Guarda el resultado y actualiza el estado de la orden
    // como una unidad. Lanza RegistroDuplicado si el examen ya tiene resultado.
    registrarResultado: 1,
  },
});

// Centro Médico Pediátrico (Firebase): crecimiento y vacunación.
const CONTRATO_PEDIATRICO = Object.freeze({
  seguimiento: {
    // () => Vacuna[] activas
    listarVacunas: 1,
    // (idPaciente, datos, actor) => ControlCrecimiento. Lanza NoEncontrado si no existe el paciente.
    agregarControl: 1,
    // (idPaciente) => ControlCrecimiento[], del más reciente al más antiguo
    listarControles: 1,
    // (idPaciente, datos, actor) => RegistroVacuna. Lanza DatosInvalidos si la vacuna no existe y
    // RegistroDuplicado si esa dosis de esa vacuna ya está registrada.
    registrarVacuna: 1,
    // (idPaciente) => RegistroVacuna[], de la más reciente a la más antigua
    listarRegistroVacunas: 1,
  },
});

function verificarContrato(contrato, adaptador, nombre) {
  const faltantes = [];
  for (const [repositorio, metodos] of Object.entries(contrato)) {
    for (const metodo of Object.keys(metodos)) {
      if (typeof adaptador?.[repositorio]?.[metodo] !== 'function') faltantes.push(`${repositorio}.${metodo}`);
    }
  }
  if (faltantes.length > 0) {
    throw new Error(`El ${nombre} no cumple el puerto; faltan: ${faltantes.join(', ')}`);
  }
  return adaptador;
}

module.exports = { CONTRATO_LABORATORIO, CONTRATO_PEDIATRICO, verificarContrato };
