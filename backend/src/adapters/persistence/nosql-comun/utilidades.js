// Lógica común a los dos motores documentales (MongoDB y Firebase). Ninguno tiene claves
// foráneas ni restricciones declarativas, así que reglas que SQL resuelve con el esquema
// (referencias válidas, campos conocidos, texto sin comodines) se aplican aquí, igual en ambos.

const { ahora } = require('../../../domain/fechas');
const { ROLES_PROFESIONALES } = require('../../../domain/roles');

const COLUMNAS_PACIENTE = [
  'nombres', 'apellidos', 'dpi_o_documento', 'fecha_nacimiento', 'sexo', 'direccion',
  'estado_civil', 'ocupacion', 'tipo_sangre',
];

// Solo los campos indicados y definidos: así un PATCH no borra lo que no se envió.
function elegir(origen, campos) {
  const destino = {};
  for (const campo of campos) if (origen?.[campo] !== undefined) destino[campo] = origen[campo];
  return destino;
}

// Un filtro que llega como objeto ({ $ne: null }) no debe interpretarse como operador:
// los valores que se comparan por igualdad se fuerzan a texto.
const comoTexto = (valor) => (valor === undefined || valor === null ? valor : String(valor));

// El ID de institución es un entero del catálogo (1-4). Se guarda como número, igual que en el
// token y en la fábrica. Hacia el cliente sale como texto, como el resto de IDs del contrato.
const comoIdInstitucion = (valor) => (valor === undefined || valor === null ? valor : Number(valor));
const aTextoInstitucion = (entidad) => (entidad && entidad.id_institucion != null
  ? { ...entidad, id_institucion: String(entidad.id_institucion) }
  : entidad);

const escaparRegex = (texto) => String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const contiene = (valor, texto) => String(valor ?? '').toLowerCase().includes(String(texto).toLowerCase());

// Registro de auditoría de la regla 22. Cada adaptador lo guarda dentro de la misma
// transacción que la escritura que describe.
function registroAuditoria(actor, accion, entidad, idEntidad) {
  return {
    id_usuario: actor.id_usuario,
    accion,
    entidad,
    id_entidad: String(idEntidad),
    fecha_hora: ahora(),
  };
}

const esProfesionalActivo = (usuario) => usuario.estado === 'Activo' && ROLES_PROFESIONALES.includes(usuario.rol);

const porCampo = (...campos) => (a, b) => {
  for (const campo of campos) {
    const x = a[campo] ?? '';
    const y = b[campo] ?? '';
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
};

const porCampoDesc = (...campos) => {
  const asc = porCampo(...campos);
  return (a, b) => asc(b, a);
};

// IMC calculado: peso en kg y talla en cm. null si falta alguno.
function calcularImc(peso, tallaCm) {
  if (typeof peso !== 'number' || typeof tallaCm !== 'number' || tallaCm <= 0) return null;
  const metros = tallaCm / 100;
  return Math.round((peso / (metros * metros)) * 100) / 100;
}

module.exports = {
  COLUMNAS_PACIENTE,
  elegir,
  comoTexto,
  comoIdInstitucion,
  aTextoInstitucion,
  escaparRegex,
  contiene,
  registroAuditoria,
  esProfesionalActivo,
  porCampo,
  porCampoDesc,
  calcularImc,
};
