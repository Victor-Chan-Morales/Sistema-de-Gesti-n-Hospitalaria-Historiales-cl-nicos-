// Panel: arma el encabezado con la sesión, la navegación según el rol y la
// institución, y enruta por hash a la vista pedida.

const sesion = requiereSesion();

function armarEncabezado(usuario) {
  document.getElementById('institucion').textContent = INSTITUCIONES[idDeInstitucion(usuario)] ?? '';
  document.getElementById('datos-usuario').innerHTML = `
    <p class="usuario-nombre">${esc(usuario.nombres)} ${esc(usuario.apellidos)}</p>
    <p class="usuario-rol">${esc(usuario.rol)}</p>`;
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
    <a href="#/${esc(id)}" data-vista="${esc(id)}" class="nav-boton">${esc(vista.titulo)}</a>`).join('');
}

function marcarNavegacion(idVista) {
  document.querySelectorAll('#navegacion [data-vista]').forEach((boton) => {
    if (boton.dataset.vista === idVista) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');
  });
}

async function navegar() {
  const contenedor = document.getElementById('vista');
  const [idVista, busqueda] = (window.location.hash.replace(/^#\/?/, '') || '').split('?');
  const params = new URLSearchParams(busqueda ?? '');
  const disponibles = vistasVisibles(sesion.usuario);

  marcarNavegacion(idVista);
  cerrarModal();
  contenedor.innerHTML = cargandoHtml();

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
    document.title = `${vista[1].titulo} - Red de hospitales`;
    await vista[1].alMontar(contenedor, params);
    window.scrollTo(0, 0);
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
