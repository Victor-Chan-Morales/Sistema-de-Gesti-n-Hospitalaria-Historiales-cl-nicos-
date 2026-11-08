// Sesión del navegador: token y usuario en localStorage, más el espejo de la
// matriz de permisos de backend/src/domain/roles.js para armar la navegación.

const CLAVE_SESION = 'red-hospitales.sesion';

const ROLES = Object.freeze({
  ADMINISTRADOR: 'Administrador',
  MEDICO: 'Médico',
  ODONTOLOGO: 'Odontólogo',
  SECRETARIA: 'Secretaria',
  LABORATORISTA: 'Laboratorista',
});

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

// Nombres de las instituciones, espejo de backend/src/config/instituciones.js.
const INSTITUCIONES = Object.freeze({
  1: 'Hospital General',
  2: 'Clínica Odontológica',
  3: 'Laboratorio Clínico',
  4: 'Centro Médico Pediátrico',
});

const idDeInstitucion = (usuario) => String(usuario?.id_institucion ?? '');
const esLaboratorio = (usuario) => idDeInstitucion(usuario) === '3';
const esPediatrico = (usuario) => idDeInstitucion(usuario) === '4';

function guardarSesion(token, usuario) {
  localStorage.setItem(CLAVE_SESION, JSON.stringify({ token, usuario }));
}

function obtenerSesion() {
  try {
    const sesion = JSON.parse(localStorage.getItem(CLAVE_SESION));
    return sesion?.token ? sesion : null;
  } catch {
    return null;
  }
}

function limpiarSesion() {
  localStorage.removeItem(CLAVE_SESION);
}

// En el panel, sin sesión se vuelve al login sin esperar un 401 por petición.
function requiereSesion() {
  const sesion = obtenerSesion();
  if (!sesion) window.location.replace('index.html');
  return sesion;
}
