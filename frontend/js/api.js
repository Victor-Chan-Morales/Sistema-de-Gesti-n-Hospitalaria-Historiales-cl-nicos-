// Cliente HTTP de la API. Express sirve la aplicación y la API en el mismo origen,
// así que las rutas son relativas y no hay CORS que configurar.
//
// Toda respuesta de error trae { codigo, mensaje } y `mensaje` está listo para
// mostrarse. ApiError conserva además el estado HTTP para distinguir sesiones
// expiradas (401) de un motor caído (503) o un doble envío (409).

class ApiError extends Error {
  constructor(mensaje, estado, codigo) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

async function apiFetch(ruta, opciones = {}) {
  const { sinSesion = false, ...configuracion } = opciones;
  const sesion = sinSesion ? null : obtenerSesion();

  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      ...configuracion,
      headers: {
        'Content-Type': 'application/json',
        ...(sesion?.token ? { Authorization: `Bearer ${sesion.token}` } : {}),
        ...(configuracion.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Verifica que esté en marcha.', 0, 'SIN_CONEXION');
  }

  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    // Sesión expirada o inválida: se limpia y se vuelve al login.
    if (!sinSesion && respuesta.status === 401) {
      limpiarSesion();
      window.location.href = 'index.html?expirada=1';
    }
    throw new ApiError(datos?.mensaje || `Error ${respuesta.status}`, respuesta.status, datos?.codigo);
  }

  return datos;
}

const api = {
  login: (usuario, contrasena) => apiFetch('/api/auth/login', {
    method: 'POST', sinSesion: true, body: JSON.stringify({ usuario, contrasena }),
  }),
  obtener: (ruta) => apiFetch(ruta),
  crear: (ruta, cuerpo) => apiFetch(ruta, { method: 'POST', body: JSON.stringify(cuerpo) }),
  actualizar: (ruta, cuerpo) => apiFetch(ruta, { method: 'PATCH', body: JSON.stringify(cuerpo) }),
};

// Parámetros de consulta: solo los definidos (los vacíos se omiten).
const construirConsulta = (parametros = {}) => {
  const consulta = new URLSearchParams();
  Object.entries(parametros).forEach(([nombre, valor]) => {
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
      consulta.set(nombre, String(valor));
    }
  });
  return consulta.toString();
};
