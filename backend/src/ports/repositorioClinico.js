// Puerto de salida: lo que el núcleo necesita de cualquier motor de base de datos.
// JavaScript no tiene interfaces, así que el contrato se comprueba de dos formas:
//   - verificarPuerto(): al crear el adaptador, valida que estén todos los métodos.
//   - tests/contrato/suiteRepositorio.js: valida el comportamiento en cada motor.
//
// Garantías que todo adaptador debe cumplir:
//   1. Todo método es asíncrono.
//   2. Los IDs son strings opacos, en la entrada y en la salida. Un ID con formato
//      inválido para el motor equivale a "no existe", nunca a un error del driver.
//   3. Tipos iguales en todos los motores: fecha 'YYYY-MM-DD', fecha y hora
//      'YYYY-MM-DDTHH:MM:SS', decimales como number, campos sin valor como null.
//   4. Errores traducidos a los de domain/errores.js:
//      - motor inalcanzable: MotorNoDisponible
//      - clave única violada: RegistroDuplicado
//      - referencia a un registro inexistente: DatosInvalidos
//      - modificar un registro inexistente: NoEncontrado
//   5. Cada escritura es atómica e incluye su registro de auditoría (regla 22):
//      { id_usuario: actor.id_usuario, accion, entidad, id_entidad, fecha_hora }.
//   6. No hay borrado físico de datos clínicos (regla 21).
//
// actor = { id_usuario, id_institucion, rol }

const CONTRATO = Object.freeze({
  usuarios: {
    // (usuario: string) => Usuario con contrasena_hash | null
    buscarPorNombre: 1,
    // (idUsuario) => Usuario sin contrasena_hash | null
    obtener: 1,
    // (idUsuario, fechaHora) => void
    registrarAcceso: 1,
    // () => Usuario[] activos con rol profesional
    listarProfesionales: 1,
  },
  pacientes: {
    // (datos, actor) => Paciente. Crea, como una unidad, paciente, teléfonos, correos,
    // contactos, representantes e historial clínico. datos incluye id_institucion,
    // codigo_historial y fecha_registro. Paciente nuevo: estado 'Activo'.
    crear: 1,
    // (idPaciente) => Paciente con id_historial y colecciones anidadas | null
    obtener: 1,
    // ({ texto?, estado?, limite, desplazamiento }) => { elementos: Paciente[], total }
    buscar: 1,
    // (idPaciente, cambios, actor) => Paciente. Las colecciones presentes se reemplazan.
    actualizar: 1,
    // (idPaciente, { estado, motivo, fecha }, actor) => Paciente.
    // Actualiza paciente e historial como una unidad, y cancela sus citas programadas.
    archivar: 1,
  },
  historiales: {
    // (idPaciente) => { historial, antecedentes, alergias, consultas } | null
    obtenerCompleto: 1,
    // (idPaciente) => Alergia[] con sustancia y tipo_alergia
    listarAlergias: 1,
    // (idPaciente, datos, actor) => Alergia
    agregarAlergia: 1,
    // (idPaciente, datos, actor) => Antecedente
    agregarAntecedente: 1,
  },
  citas: {
    // (datos, actor) => Cita. Estado inicial 'Programada'. Lanza RegistroDuplicado si ya hay
    // una cita programada idéntica, y ConflictoHorario si el profesional o el paciente ya tienen
    // otra cita programada a esa misma hora. Ambas comprobaciones deben ser seguras ante concurrencia.
    crear: 1,
    // (idCita) => Cita | null
    obtener: 1,
    // ({ id_paciente?, id_usuario_profesional?, estado?, desde?, hasta? }) => Cita[]
    listar: 1,
    // (idCita, cambios, actor) => Cita. Si cambian la fecha o el profesional de una cita
    // programada, lanza ConflictoHorario en los mismos casos que crear (sin contarse a sí misma).
    actualizar: 1,
  },
  consultas: {
    // (datos, actor, { desde, hasta }) => Consulta. Guarda como una unidad la consulta, sus
    // signos, diagnósticos, tratamientos y receta. Si trae id_cita, marca la cita como
    // 'Atendida'. Lanza ConsultaDuplicada si dentro de la transacción encuentra una consulta
    // idéntica (historial, profesional, motivo, síntomas y notas) en el rango [desde, hasta].
    // Lanza ConflictoHorario si el profesional o el paciente ya tienen otra consulta no anulada
    // a esa misma hora.
    registrarAtencion: 1,
    // (idConsulta) => Consulta con id_paciente y detalle anidado | null
    obtener: 1,
    // (idConsulta, estado, actor) => Consulta. Si pasa a 'Anulada', cancela la cita que la originó
    // cuando figuraba como 'Atendida'.
    cambiarEstado: 1,
    // (idConsulta, datos, actor) => Consulta
    agregarDiagnostico: 1,
    agregarTratamiento: 1,
    agregarReceta: 1,
  },
  catalogos: {
    // ({ texto? }) => elementos del catálogo
    diagnosticos: 1,
    // ({ ids? }) => medicamentos activos, o los indicados por ids
    medicamentos: 1,
    // () => alergias del catálogo
    alergias: 1,
  },
  salud: {
    // () => void. Lanza MotorNoDisponible si el motor no responde.
    verificar: 1,
  },
});

function verificarPuerto(adaptador, nombre = 'adaptador') {
  const faltantes = [];
  for (const [repositorio, metodos] of Object.entries(CONTRATO)) {
    for (const metodo of Object.keys(metodos)) {
      if (typeof adaptador?.[repositorio]?.[metodo] !== 'function') {
        faltantes.push(`${repositorio}.${metodo}`);
      }
    }
  }
  if (faltantes.length > 0) {
    throw new Error(`El ${nombre} no cumple el puerto; faltan: ${faltantes.join(', ')}`);
  }
  return adaptador;
}

module.exports = { CONTRATO, verificarPuerto };
