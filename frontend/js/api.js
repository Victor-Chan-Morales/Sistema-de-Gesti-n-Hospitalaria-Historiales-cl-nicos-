const API_URL = 'http://localhost:3000';

async function apiFetch(ruta, opciones = {}) {
  const respuesta = await fetch(`${API_URL}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      ...opciones.headers,
    },
  });

  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    throw new Error(datos?.mensaje || `Error ${respuesta.status}`);
  }

  return datos;
}
