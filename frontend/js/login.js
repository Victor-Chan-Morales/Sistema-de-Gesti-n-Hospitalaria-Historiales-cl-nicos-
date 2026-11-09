// Formulario de entrada: pide el token a la API, guarda la sesión y pasa al panel.

const parametros = new URLSearchParams(window.location.search);
if (obtenerSesion()) {
  window.location.replace('dashboard.html');
}

document.addEventListener('DOMContentLoaded', () => {
  const mensaje = document.getElementById('mensaje');

  const mostrarMensaje = (texto, tipo) => {
    mensaje.innerHTML = bannerHtml(esc(texto), tipo);
    mensaje.classList.remove('hidden');
  };

  if (parametros.get('expirada') === '1') {
    mostrarMensaje('Tu sesión ha expirado. Inicia sesión de nuevo.', 'info');
  }

  document.getElementById('form-login').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mensaje.classList.add('hidden');

    const formulario = evento.currentTarget;
    const boton = formulario.querySelector('button[type="submit"]');
    const usuario = formulario.usuario.value.trim();
    const contrasena = formulario.contrasena.value;

    if (!usuario || !contrasena) {
      mostrarMensaje('Escribe tu usuario y contraseña.', 'error');
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Entrando...';
    try {
      const { token, usuario: perfil } = await api.login(usuario, contrasena);
      guardarSesion(token, perfil);
      window.location.href = 'dashboard.html';
    } catch (error) {
      mostrarMensaje(error.message, 'error');
      boton.disabled = false;
      boton.textContent = 'Entrar';
    }
  });
});
