// Esquemas de entrada, alineados con los límites y dominios de los scripts SQL.

const t = (max, requerido = false) => ({ tipo: 'texto', max, requerido });
const texto = { tipo: 'texto' };
const textoRequerido = { tipo: 'texto', requerido: true };
const e = (...valores) => ({ tipo: 'enum', valores });
const lista = (esquema) => ({ tipo: 'lista', esquema });

const telefono = (...tipos) => ({ numero: t(20, true), tipo: e(...tipos) });

const contactoEmergencia = {
  nombres: t(100, true),
  apellidos: t(100, true),
  parentesco: t(50),
  direccion: t(200),
  telefonos: lista(telefono('Celular', 'Casa')),
};

const representante = {
  nombres: t(100, true),
  apellidos: t(100, true),
  dpi: t(50),
  parentesco: t(50),
  direccion: t(200),
  telefonos: lista(telefono('Celular', 'Casa')),
  correos: lista({ correo: t(100, true) }),
};

const paciente = {
  nombres: t(100, true),
  apellidos: t(100, true),
  dpi_o_documento: t(50),
  fecha_nacimiento: { tipo: 'fecha', requerido: true },
  sexo: e('M', 'F', 'O'),
  direccion: t(200),
  estado_civil: t(50),
  ocupacion: t(100),
  tipo_sangre: e('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
  telefonos: lista(telefono('Celular', 'Casa', 'Trabajo')),
  correos: lista({ correo: t(100, true) }),
  contactos_emergencia: lista(contactoEmergencia),
  representantes: lista(representante),
};

const archivoPaciente = {
  estado: { ...e('Archivado', 'Inactivo'), requerido: true },
  motivo: t(255, true),
};

const alergia = {
  id_catalogo_alergia: { tipo: 'id', requerido: true },
  reaccion: t(255),
  nivel_gravedad: e('Leve', 'Moderada', 'Grave'),
  observaciones: texto,
};

const antecedente = {
  tipo_antecedente: { ...e('Personal', 'Familiar', 'Quirúrgico', 'Patológico', 'Hereditario'), requerido: true },
  descripcion: textoRequerido,
  estado: t(20),
  observaciones: texto,
};

const nuevaCita = {
  id_paciente: { tipo: 'id', requerido: true },
  id_usuario_profesional: { tipo: 'id', requerido: true },
  fecha_hora: { tipo: 'fechaHora', requerido: true },
  motivo_consulta: t(255),
  observaciones: texto,
};

const cambiosCita = {
  id_usuario_profesional: { tipo: 'id' },
  fecha_hora: { tipo: 'fechaHora' },
  motivo_consulta: t(255),
  observaciones: texto,
  estado: e('Programada', 'Atendida', 'Cancelada', 'No Asistió'),
};

const diagnostico = {
  id_catalogo_diag: { tipo: 'id', requerido: true },
  tipo: e('Presuntivo', 'Definitivo', 'Seguimiento'),
  observaciones: texto,
};

const tratamiento = {
  descripcion: textoRequerido,
  fecha_inicio: { tipo: 'fecha' },
  fecha_fin: { tipo: 'fecha' },
  indicaciones: texto,
  estado: e('Activo', 'Finalizado', 'Suspendido'),
};

const detalleReceta = {
  id_medicamento: { tipo: 'id', requerido: true },
  dosis: t(100, true),
  frecuencia: t(100, true),
  via_administracion: t(50),
  duracion: t(50),
  indicaciones_especificas: texto,
};

const receta = {
  fecha_receta: { tipo: 'fecha' },
  indicaciones_generales: texto,
  detalles: { ...lista(detalleReceta), requerido: true },
};

const signosVitales = {
  presion_arterial: t(20),
  temperatura: { tipo: 'decimal', min: 0, max: 99.99 },
  frecuencia_cardiaca: { tipo: 'entero', min: 0 },
  frecuencia_respiratoria: { tipo: 'entero', min: 0 },
  peso: { tipo: 'decimal', min: 0, max: 999.99 },
  talla: { tipo: 'decimal', min: 0, max: 99.99 },
  saturacion_oxigeno: { tipo: 'entero', min: 0, max: 100 },
};

const nuevaConsulta = {
  id_paciente: { tipo: 'id', requerido: true },
  id_cita: { tipo: 'id' },
  fecha_hora: { tipo: 'fechaHora' },
  motivo_consulta: t(255),
  sintomas: texto,
  examen_fisico: texto,
  notas_clinicas: texto,
  estado: e('Abierta', 'Finalizada'),
  signos_vitales: { tipo: 'objeto', esquema: signosVitales },
  diagnosticos: lista(diagnostico),
  tratamientos: lista(tratamiento),
  receta: { tipo: 'objeto', esquema: receta },
};

const estadoConsulta = {
  estado: { ...e('Abierta', 'Finalizada', 'Anulada'), requerido: true },
};

const login = {
  usuario: t(50, true),
  contrasena: t(200, true),
};

module.exports = {
  paciente,
  archivoPaciente,
  alergia,
  antecedente,
  nuevaCita,
  cambiosCita,
  diagnostico,
  tratamiento,
  receta,
  nuevaConsulta,
  estadoConsulta,
  login,
};
