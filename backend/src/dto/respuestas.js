// Contrato JSON único hacia el frontend. Se eligen los campos de forma explícita:
// así, los campos internos de un motor o un dato restringido como contrasena_hash
// no pueden llegar a la respuesta por accidente.

const elegir = (origen, campos) =>
  Object.fromEntries(campos.map((campo) => [campo, origen?.[campo] ?? null]));

const lista = (coleccion, dto) => (coleccion ?? []).map(dto);

const CAMPOS_TELEFONO = ['numero', 'tipo'];
const telefonoDto = (t) => elegir(t, CAMPOS_TELEFONO);
const correoDto = (c) => elegir(c, ['correo']);

const usuarioDto = (u) => ({
  ...elegir(u, ['id_usuario', 'id_institucion', 'nombres', 'apellidos', 'usuario', 'rol', 'estado']),
});

const profesionalDto = (u) => elegir(u, ['id_usuario', 'nombres', 'apellidos', 'rol']);

const contactoDto = (c) => ({
  ...elegir(c, ['id_contacto', 'nombres', 'apellidos', 'parentesco', 'direccion']),
  telefonos: lista(c.telefonos, telefonoDto),
});

const representanteDto = (r) => ({
  ...elegir(r, ['id_representante', 'nombres', 'apellidos', 'dpi', 'parentesco', 'direccion']),
  telefonos: lista(r.telefonos, telefonoDto),
  correos: lista(r.correos, correoDto),
});

const CAMPOS_PACIENTE = [
  'id_paciente', 'id_historial', 'codigo_historial', 'nombres', 'apellidos', 'dpi_o_documento',
  'fecha_nacimiento', 'sexo', 'direccion', 'estado_civil', 'ocupacion', 'tipo_sangre',
  'fecha_registro', 'estado', 'motivo_baja',
];

const pacienteResumenDto = (p) => elegir(p, CAMPOS_PACIENTE);

const pacienteDto = (p) => ({
  ...elegir(p, CAMPOS_PACIENTE),
  telefonos: lista(p.telefonos, telefonoDto),
  correos: lista(p.correos, correoDto),
  contactos_emergencia: lista(p.contactos_emergencia, contactoDto),
  representantes: lista(p.representantes, representanteDto),
});

const paginaDto = ({ elementos, total }, dto) => ({ elementos: lista(elementos, dto), total });

const citaDto = (c) => elegir(c, [
  'id_cita', 'id_paciente', 'id_institucion', 'id_usuario_profesional', 'fecha_hora',
  'motivo_consulta', 'estado', 'observaciones', 'fecha_creacion',
]);

const diagnosticoDto = (d) => elegir(d, [
  'id_catalogo_diag', 'codigo_clinico', 'nombre_diagnostico', 'tipo', 'fecha_registro', 'observaciones',
]);

const tratamientoDto = (t) => elegir(t, [
  'id_tratamiento', 'descripcion', 'fecha_inicio', 'fecha_fin', 'indicaciones', 'estado',
]);

const detalleRecetaDto = (d) => elegir(d, [
  'id_detalle_receta', 'id_medicamento', 'nombre_medicamento', 'dosis', 'frecuencia',
  'via_administracion', 'duracion', 'indicaciones_especificas',
]);

const recetaDto = (r) => ({
  ...elegir(r, ['id_receta', 'fecha_receta', 'indicaciones_generales']),
  detalles: lista(r.detalles, detalleRecetaDto),
});

const signosDto = (s) => (s
  ? elegir(s, [
    'presion_arterial', 'temperatura', 'frecuencia_cardiaca', 'frecuencia_respiratoria',
    'peso', 'talla', 'saturacion_oxigeno', 'fecha_registro',
  ])
  : null);

const consultaDto = (c) => ({
  ...elegir(c, [
    'id_consulta', 'id_historial', 'id_paciente', 'id_cita', 'id_usuario_profesional',
    'fecha_hora', 'motivo_consulta', 'sintomas', 'examen_fisico', 'notas_clinicas', 'estado',
  ]),
  signos_vitales: signosDto(c.signos_vitales),
  diagnosticos: lista(c.diagnosticos, diagnosticoDto),
  tratamientos: lista(c.tratamientos, tratamientoDto),
  recetas: lista(c.recetas, recetaDto),
});

const alergiaDto = (a) => elegir(a, [
  'id_catalogo_alergia', 'sustancia', 'tipo_alergia', 'reaccion', 'nivel_gravedad',
  'fecha_registro', 'observaciones',
]);

const antecedenteDto = (a) => elegir(a, [
  'id_antecedente', 'tipo_antecedente', 'descripcion', 'fecha_registro', 'estado', 'observaciones',
]);

const historialCompletoDto = ({ historial, antecedentes, alergias, consultas }) => ({
  historial: elegir(historial, [
    'id_historial', 'id_paciente', 'id_institucion', 'codigo_historial', 'fecha_apertura',
    'estado', 'fecha_cierre', 'motivo_cierre', 'observaciones',
  ]),
  antecedentes: lista(antecedentes, antecedenteDto),
  alergias: lista(alergias, alergiaDto),
  consultas: lista(consultas, consultaDto),
});

const catalogoDiagnosticoDto = (d) => elegir(d, ['id_catalogo_diag', 'codigo_clinico', 'nombre_diagnostico', 'descripcion']);
const medicamentoDto = (m) => elegir(m, ['id_medicamento', 'nombre', 'principio_activo', 'presentacion', 'concentracion']);
const catalogoAlergiaDto = (a) => elegir(a, ['id_catalogo_alergia', 'sustancia', 'tipo_alergia']);

// --- Laboratorio Clínico ---

const tipoExamenDto = (t) => elegir(t, ['id_tipo_examen', 'nombre', 'descripcion', 'tipo_muestra', 'estado']);

const valorDetalladoDto = (v) => elegir(v, ['parametro', 'valor', 'unidad', 'rango_referencia']);

const resultadoLaboratorioDto = (r) => ({
  ...elegir(r, [
    'id_resultado', 'id_orden_laboratorio', 'id_tipo_examen', 'fecha_toma_muestra', 'fecha_resultado',
    'resultado_general', 'observaciones', 'id_usuario_laboratorista',
  ]),
  valores_detallados: lista(r.valores_detallados, valorDetalladoDto),
});

const ordenLaboratorioDto = (o) => ({
  ...elegir(o, [
    'id_orden_laboratorio', 'id_historial', 'id_paciente', 'id_usuario_solicitante', 'fecha_orden',
    'prioridad', 'estado', 'observaciones',
  ]),
  examenes: lista(o.examenes, (e) => elegir(e, ['id_tipo_examen', 'nombre', 'tipo_muestra'])),
  resultados: lista(o.resultados, resultadoLaboratorioDto),
});

// --- Centro Médico Pediátrico ---

const vacunaDto = (v) => elegir(v, [
  'id_vacuna', 'nombre', 'enfermedad_prevenida', 'numero_dosis_requeridas', 'descripcion', 'estado',
]);

const controlCrecimientoDto = (c) => elegir(c, [
  'id_control_crecimiento', 'id_historial', 'id_consulta', 'fecha_control', 'peso', 'talla',
  'perimetro_cefalico', 'indice_masa_corporal', 'observaciones',
]);

const registroVacunaDto = (r) => elegir(r, [
  'id_registro_vacuna', 'id_historial', 'id_vacuna', 'nombre_vacuna', 'numero_dosis', 'fecha_aplicacion',
  'lote', 'centro_aplicacion', 'proxima_dosis', 'observaciones',
]);

module.exports = {
  tipoExamenDto,
  ordenLaboratorioDto,
  resultadoLaboratorioDto,
  vacunaDto,
  controlCrecimientoDto,
  registroVacunaDto,
  usuarioDto,
  profesionalDto,
  pacienteDto,
  pacienteResumenDto,
  paginaDto,
  citaDto,
  consultaDto,
  alergiaDto,
  antecedenteDto,
  historialCompletoDto,
  catalogoDiagnosticoDto,
  medicamentoDto,
  catalogoAlergiaDto,
};
