// Panel: arma el encabezado con la sesión, la navegación según el rol y la
// institución, y enruta por hash a la vista pedida.

const sesion = requiereSesion();

function armarEncabezado(usuario) {
  document.getElementById('institucion').textContent = INSTITUCIONES[idDeInstitucion(usuario)] ?? '';
  document.getElementById('datos-usuario').innerHTML = `
    <p class="text-sm font-medium text-gray-800">${esc(usuario.nombres)} ${esc(usuario.apellidos)}</p>
    <p class="text-xs text-gray-500"><span class="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">${esc(usuario.rol)}</span></p>`;
  document.getElementById('salir').addEventListener('click', () => {
    limpiarSesion();
    window.location.replace('index.html');
  });
}

// Una vista se anuncia en REGISTRO_VISTAS con:
//   titulo, alMontar(contenedor, params) y opcionalmente permiso y soloInstitucion.
function vistasVisibles(usuario) {
  return Object.entries(REGISTRO_VISTAS).filter(([, vista]) => {
    if (vista.permiso && !tienePermiso(usuario.rol, vista.permiso)) return false;
    if (vista.soloInstitucion && !vista.soloInstitucion(usuario)) return false;
    return true;
  });
}

function armarNavegacion(usuario) {
  const navegacion = document.getElementById('navegacion');
  navegacion.innerHTML = vistasVisibles(usuario).map(([id, vista]) => `
    <button type="button" data-vista="${esc(id)}"
            class="nav-boton whitespace-nowrap px-4 py-2 mb-1 rounded-t text-sm font-medium hover:bg-gray-100 text-gray-600">
      ${esc(vista.titulo)}
    </button>`).join('');
  navegacion.querySelectorAll('[data-vista]').forEach((boton) => {
    boton.addEventListener('click', () => { window.location.hash = `#/${boton.dataset.vista}`; });
  });
}

function marcarNavegacion(idVista) {
  document.querySelectorAll('#navegacion [data-vista]').forEach((boton) => {
    const activo = boton.dataset.vista === idVista;
    boton.classList.toggle('bg-blue-600', activo);
    boton.classList.toggle('text-white', activo);
    boton.classList.toggle('hover:bg-gray-100', !activo);
    boton.classList.toggle('text-gray-600', !activo);
  });
}

async function navegar() {
  const contenedor = document.getElementById('vista');
  const [idVista, busqueda] = (window.location.hash.replace(/^#\/?/, '') || '').split('?');
  const params = new URLSearchParams(busqueda ?? '');
  const disponibles = vistasVisibles(sesion.usuario);

  marcarNavegacion(idVista);
  cerrarModal();
  contenedor.innerHTML = `<p class="text-sm text-gray-500 py-8 text-center">Cargando...</p>`;

  const vista = disponibles.find(([id]) => id === idVista);
  if (!vista) {
    const [idPorDefecto] = disponibles[0] ?? [];
    if (idVista && idPorDefecto) {
      window.location.hash = `#/${idPorDefecto}`;
      return;
    }
    contenedor.innerHTML = bannerHtml('No tienes acceso a esta sección con tu rol.', 'advertencia');
    return;
  }

  try {
    await vista[1].alMontar(contenedor, params);
  } catch (error) {
    contenedor.innerHTML = bannerErrorHtml(error);
  }
}

armarEncabezado(sesion.usuario);
armarNavegacion(sesion.usuario);
window.addEventListener('hashchange', navegar);

if (!window.location.hash) {
  const [idPorDefecto] = vistasVisibles(sesion.usuario)[0] ?? [];
  window.location.hash = idPorDefecto ? `#/${idPorDefecto}` : '#/sin-acceso';
} else {
  navegar();
}
