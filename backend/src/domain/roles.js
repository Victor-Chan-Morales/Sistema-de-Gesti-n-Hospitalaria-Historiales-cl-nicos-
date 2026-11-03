// Matriz de control de acceso (reglas 13, 14 y 15 de la Entrega I).
// Un pediatra es un usuario con rol 'Médico' en el Centro Pediátrico.

const ROLES = Object.freeze({
  ADMINISTRADOR: 'Administrador',
  MEDICO: 'Médico',
  ODONTOLOGO: 'Odontólogo',
  SECRETARIA: 'Secretaria',
  LABORATORISTA: 'Laboratorista',
});

const ROLES_PROFESIONALES = Object.freeze([ROLES.MEDICO, ROLES.ODONTOLOGO, ROLES.LABORATORISTA]);

const PERMISOS = Object.freeze({
  GESTIONAR_PACIENTES_Y_CITAS: 'gestionar_pacientes_y_citas',
  ARCHIVAR_PACIENTES: 'archivar_pacientes',
  VER_HISTORIAL_CLINICO: 'ver_historial_clinico',
  REGISTRAR_DATOS_CLINICOS: 'registrar_datos_clinicos',
});

const TODOS_LOS_PERMISOS = Object.values(PERMISOS);

const PERMISOS_POR_ROL = Object.freeze({
  [ROLES.ADMINISTRADOR]: [PERMISOS.GESTIONAR_PACIENTES_Y_CITAS, PERMISOS.ARCHIVAR_PACIENTES],
  [ROLES.SECRETARIA]: [PERMISOS.GESTIONAR_PACIENTES_Y_CITAS],
  [ROLES.MEDICO]: TODOS_LOS_PERMISOS,
  [ROLES.ODONTOLOGO]: TODOS_LOS_PERMISOS,
  [ROLES.LABORATORISTA]: TODOS_LOS_PERMISOS,
});

const tienePermiso = (rol, permiso) => (PERMISOS_POR_ROL[rol] ?? []).includes(permiso);

module.exports = { ROLES, ROLES_PROFESIONALES, PERMISOS, tienePermiso };
