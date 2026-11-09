// Utilidades compartidas de la interfaz: formato de fechas, insignias, avisos,
// botones en carga, modales y componentes reutilizables.

// Registro donde cada vista (js/vistas/*) se anuncia al panel.
window.REGISTRO_VISTAS = window.REGISTRO_VISTAS || {};

const esc = (texto) => String(texto ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Valor mostrable; vacío o null se presenta como guion.
const o = (texto) => {
  const valor = texto ?? '';
  return String(valor).trim() === '' ? '—' : esc(valor);
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// '1988-04-12' → '12 abr 1988'. Las fechas llegan como texto y no se reinterpretan.
const fechaLarga = (iso) => {
  if (!iso) return '—';
  const [anio, mes, dia] = String(iso).slice(0, 10).split('-');
  return `${dia} ${MESES[Number(mes) - 1]} ${anio}`;
};

// '2026-12-01T09:30:00' → '01 dic 2026, 09:30'.
const fechaHoraLarga = (iso) => {
  if (!iso) return '—';
  const [fecha, hora] = String(iso).split('T');
  const [anio, mes, dia] = fecha.split('-');
  const horaCorta = hora ? `, ${hora.slice(0, 5)}` : '';
  return `${dia} ${MESES[Number(mes) - 1]} ${anio}${horaCorta}`;
};

// '2026-12-01' → 'martes, 1 de diciembre de 2026' (encabezado de agenda).
const fechaDia = (iso) => {
  const [anio, mes, dia] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

// Fecha y hora local en el formato del contrato, sin pasar por UTC.
const ahora = () => {
  const fecha = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}T${p(fecha.getHours())}:${p(fecha.getMinutes())}:00`;
};

const hoy = () => ahora().slice(0, 10);

// El valor de un <input type="datetime-local"> es 'YYYY-MM-DDTHH:MM'.
const aFechaHora = (valor) => (valor.length === 16 ? `${valor}:00` : valor);

// Valor para <input type="datetime-local"> a partir de una fecha, en hora local.
const aValorDateTimeLocal = (fecha) => {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const p = (n) => String(n).padStart(2, '0');
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const calcularEdad = (fechaNacimiento) => {
  if (!fechaNacimiento) return null;
  const [anio, mes, dia] = String(fechaNacimiento).slice(0, 10).split('-').map(Number);
  const fecha = new Date();
  let anos = fecha.getFullYear() - anio;
  const mesActual = fecha.getMonth() + 1;
  if (mesActual < mes || (mesActual === mes && fecha.getDate() < dia)) anos -= 1;
  return anos;
};

const esMenorDeEdad = (fechaNacimiento) => (calcularEdad(fechaNacimiento) ?? 99) < 18;

const edadComoTexto = (fechaNacimiento) => {
  const anos = calcularEdad(fechaNacimiento);
  return anos === null ? '—' : `${anos} años`;
};

// Insignias de estado: mismos colores en las cuatro instituciones.
const CLASES_ESTADO = {
  Activo: 'bg-green-100 text-green-800',
  Inactivo: 'bg-amber-100 text-amber-800',
  Archivado: 'bg-gray-200 text-gray-600',
  Programada: 'bg-blue-100 text-blue-800',
  Atendida: 'bg-green-100 text-green-800',
  Cancelada: 'bg-red-100 text-red-700',
  'No Asistió': 'bg-amber-100 text-amber-800',
  Abierta: 'bg-blue-100 text-blue-800',
  Finalizada: 'bg-green-100 text-green-800',
  Anulada: 'bg-red-100 text-red-700',
  Pendiente: 'bg-amber-100 text-amber-800',
  'En proceso': 'bg-blue-100 text-blue-800',
  Entregada: 'bg-gray-200 text-gray-600',
  Activa: 'bg-green-100 text-green-800',
  Normal: 'bg-gray-100 text-gray-600',
  Urgente: 'bg-orange-100 text-orange-800',
  Emergencia: 'bg-red-100 text-red-700',
  Leve: 'bg-yellow-100 text-yellow-800',
  Moderada: 'bg-orange-100 text-orange-800',
  Grave: 'bg-red-100 text-red-700',
};

const insignia = (texto, extra = '') =>
  `<span class="inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-bold ${CLASES_ESTADO[texto] ?? 'bg-gray-100 text-gray-600'} ${extra}">${esc(texto ?? '—')}</span>`;

const CAMPO_TEXTO = 'w-full min-h-[2.6rem] border border-gray-300 rounded-md px-3 py-2 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600';
const CAMPO_TEXTO_CORTO = 'border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600';

const ETIQUETA = 'block text-sm font-bold text-gray-800 mb-1';

// Avisos flotantes; cualquier página necesita <div id="avisos">.
function avisar(mensaje, tipo = 'exito') {
  const contenedor = document.getElementById('avisos');
  if (!contenedor) return;
  const clases = {
    exito: 'bg-blue-800',
    error: 'bg-red-600',
    advertencia: 'bg-amber-700',
    info: 'bg-gray-800',
  }[tipo] ?? 'bg-gray-700';
  const aviso = document.createElement('div');
  aviso.className = `${clases} text-white text-sm rounded-md shadow-lg px-4 py-3 max-w-sm transition-opacity duration-300 cursor-pointer`;
  aviso.setAttribute('role', 'status');
  aviso.textContent = mensaje;
  aviso.addEventListener('click', () => aviso.remove());
  contenedor.appendChild(aviso);
  setTimeout(() => {
    aviso.style.opacity = '0';
    setTimeout(() => aviso.remove(), 300);
  }, tipo === 'error' ? 8000 : 4000);
}

// Banner fijo dentro de una vista. El 503 de un motor caído se muestra como
// advertencia: la pantalla sigue en pie.
const CLASES_BANNER = {
  error: 'bg-red-50 border-red-600 text-red-900',
  advertencia: 'bg-amber-50 border-amber-600 text-amber-900',
  exito: 'bg-green-50 border-green-600 text-green-900',
  info: 'bg-white border-blue-600 text-gray-800',
};

const bannerHtml = (mensaje, tipo = 'info') =>
  `<div class="border border-l-4 rounded-md px-4 py-3 text-sm ${CLASES_BANNER[tipo]}" role="alert">${mensaje}</div>`;

const bannerErrorHtml = (error) =>
  bannerHtml(esc(error?.message || 'Ocurrió un error inesperado.'), error?.estado === 503 ? 'advertencia' : 'error');

const filaVacia = (columnas, mensaje = 'Sin registros.') =>
  `<tr><td colspan="${columnas}" class="px-3 py-6 text-center text-gray-600">${esc(mensaje)}</td></tr>`;

// Desactiva el botón mientras corre la operación: primera línea contra el doble clic.
async function conCarga(boton, operacion) {
  if (!boton) return operacion();
  const original = boton.disabled;
  boton.disabled = true;
  boton.classList.add('opacity-60', 'cursor-not-allowed');
  try {
    return await operacion();
  } finally {
    boton.disabled = original;
    boton.classList.remove('opacity-60', 'cursor-not-allowed');
  }
}

// Modal único por página. El contenido se muestra con scroll; cerrar exige clic
// explícito para no perder formularios a medio llenar.
let capaModal = null;
const ICONO_CERRAR = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>';

function abrirModal(titulo, cuerpoHtml, { alMontar, ampliada = false } = {}) {
  cerrarModal();
  const previo = document.activeElement;
  capaModal = document.createElement('div');
  capaModal.className = 'capa-modal fixed inset-0 z-40 flex items-center justify-center p-4';
  capaModal.innerHTML = `
    <div class="bg-white shadow-2xl w-full ${ampliada ? 'max-w-3xl' : 'max-w-xl'} max-h-[88vh] flex flex-col" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <header class="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
        <h2 class="text-lg font-bold text-gray-900">${esc(titulo)}</h2>
        <button type="button" data-cerrar class="text-gray-500 hover:text-gray-900 rounded p-1" aria-label="Cerrar">${ICONO_CERRAR}</button>
      </header>
      <div class="px-6 py-5 overflow-y-auto"></div>
    </div>`;
  capaModal.querySelector('header ~ div').innerHTML = cuerpoHtml;
  capaModal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  // Escape también es un cierre explícito; un clic fuera no, para no perder formularios.
  capaModal.addEventListener('keydown', (evento) => { if (evento.key === 'Escape') cerrarModal(); });
  capaModal.devolverFoco = previo;
  document.body.appendChild(capaModal);
  if (alMontar) alMontar(capaModal);
  (capaModal.querySelector('header ~ div input, header ~ div select, header ~ div textarea') ?? capaModal.querySelector('[data-cerrar]')).focus();
  return capaModal;
}

function cerrarModal() {
  const capa = capaModal ?? document.querySelector('div.capa-modal');
  if (capa) {
    capa.remove();
    if (capa.devolverFoco?.isConnected) capa.devolverFoco.focus();
  }
  capaModal = null;
}

// Confirmación modal: devuelve true si el usuario acepta.
function confirmar(mensaje, { textoBoton = 'Confirmar', titulo = 'Confirmar', peligro = false } = {}) {
  return new Promise((resolver) => {
    const capa = abrirModal(titulo, `
      <p class="text-gray-800">${esc(mensaje)}</p>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" data-cancelar class="btn btn-secundario">Volver</button>
        <button type="button" data-aceptar class="btn ${peligro ? 'btn-peligro-lleno' : 'btn-primario'}">${esc(textoBoton)}</button>
      </div>`);
    capa.querySelector('[data-aceptar]').focus();
    capa.querySelector('[data-cancelar]').addEventListener('click', () => { cerrarModal(); resolver(false); });
    capa.querySelector('[data-aceptar]').addEventListener('click', () => { cerrarModal(); resolver(true); });
  });
}

// Pie estándar de un modal: cancelar y la acción principal con su nombre real.
const pieModalHtml = (textoAccion, { peligro = false } = {}) => `
  <div class="flex justify-end gap-2 pt-4 mt-2 border-t border-gray-200">
    <button type="button" data-cancelar class="btn btn-secundario">Cancelar</button>
    <button type="button" data-guardar class="btn ${peligro ? 'btn-peligro-lleno' : 'btn-primario'}">${esc(textoAccion)}</button>
  </div>`;

// Encabezado de página: enlace de regreso, título, descripción y acciones.
const encabezadoHtml = (titulo, { volver, descripcion = '', acciones = '' } = {}) => `
  <div class="encabezado">
    ${volver ? `<a href="${esc(volver.href)}" class="volver">${esc(volver.texto)}</a>` : ''}
    <div class="encabezado-fila">
      <h1 class="titulo-pagina">${esc(titulo)}</h1>
      ${acciones ? `<div class="acciones">${acciones}</div>` : ''}
    </div>
    ${descripcion ? `<p class="encabezado-desc">${descripcion}</p>` : ''}
  </div>`;

const vacioHtml = (titulo, detalle = '') =>
  `<div class="vacio"><strong>${esc(titulo)}</strong>${detalle ? esc(detalle) : ''}</div>`;

const cargandoHtml = (texto = 'Cargando...') => `<p class="cargando" role="status">${esc(texto)}</p>`;

const SEXOS = { M: 'Masculino', F: 'Femenino', O: 'Otro' };

// Carátula del expediente: identifica al paciente en toda vista clínica.
// alergias: undefined no muestra la franja; [] la muestra como "sin alergias".
function fichaPacienteHtml(paciente, { alergias, acciones = '', codigo } = {}) {
  const p = paciente ?? {};
  const franja = alergias === undefined ? '' : alergias.length
    ? `<div class="ficha-alergias" data-hay="si" role="note"><strong>Alergias</strong><span>${alergias
      .map((a) => esc(`${a.sustancia}${a.nivel_gravedad ? ` (${a.nivel_gravedad.toLowerCase()})` : ''}`)).join(', ')}</span></div>`
    : '<div class="ficha-alergias" data-hay="no">Sin alergias registradas</div>';
  return `
    <header class="ficha" data-estado="${esc(p.estado)}">
      <div class="ficha-cabeza">
        <h1 class="ficha-nombre">${esc(p.nombres)} ${esc(p.apellidos)}</h1>
        ${insignia(p.estado)}
        ${acciones ? `<div class="acciones">${acciones}</div>` : ''}
      </div>
      <dl class="ficha-datos">
        <div><dt>Historial</dt><dd>${o(codigo ?? p.codigo_historial)}</dd></div>
        <div><dt>Edad</dt><dd>${edadComoTexto(p.fecha_nacimiento)}</dd></div>
        <div><dt>Nacimiento</dt><dd>${fechaLarga(p.fecha_nacimiento)}</dd></div>
        <div><dt>Sexo</dt><dd>${o(SEXOS[p.sexo] ?? p.sexo)}</dd></div>
        <div><dt>Sangre</dt><dd>${o(p.tipo_sangre)}</dd></div>
        <div><dt>Documento</dt><dd>${o(p.dpi_o_documento)}</dd></div>
      </dl>
      ${franja}
    </header>`;
}

// Opciones para un <select>.
const opcionesSelect = (items, valor, texto) =>
  items.map((item) => `<option value="${esc(valor(item))}">${esc(texto(item))}</option>`).join('');

// Caché de nombres de pacientes para las tablas de citas y órdenes: la API de citas
// solo devuelve ids. Suficiente para el volumen del proyecto; el alta suma al caché.
const cachePacientes = { nombres: new Map(), promesa: null };

async function nombresDePacientes() {
  if (!cachePacientes.promesa) {
    cachePacientes.promesa = (async () => {
      const LIMITE = 100;
      const MAX_PAGINAS = 30;
      let desplazamiento = 0;
      for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
        const respuesta = await api.obtener(`/api/pacientes?${construirConsulta({ limite: LIMITE, desplazamiento })}`);
        respuesta.elementos.forEach((p) => cachePacientes.nombres.set(String(p.id_paciente), `${p.nombres} ${p.apellidos}`));
        desplazamiento += respuesta.elementos.length;
        if (respuesta.elementos.length === 0 || desplazamiento >= respuesta.total) break;
      }
    })();
    cachePacientes.promesa.catch(() => { cachePacientes.promesa = null; });
  }
  try {
    await cachePacientes.promesa;
  } catch {
    // Sin nombres, las tablas muestran el id: mejor eso que romper la vista.
  }
  return cachePacientes.nombres;
}

function recordarPaciente(paciente) {
  cachePacientes.nombres.set(String(paciente.id_paciente), `${paciente.nombres} ${paciente.apellidos}`);
}

const nombreDePaciente = (mapa, id) => mapa.get(String(id)) ?? String(id);

// Buscador de pacientes reutilizable. Devuelve el id elegido como texto (los ids
// son opacos en Mongo y Firebase) y lo conserva en pantalla hasta que se cambia.
function crearSelectorPaciente({ etiqueta = 'Paciente', alElegir, soloActivos = false, pacienteInicial = null } = {}) {
  const estado = { elegido: null, temporizador: null };

  const raiz = document.createElement('div');
  raiz.className = 'w-full';

  const pintar = () => {
    if (estado.elegido) {
      const p = estado.elegido;
      raiz.innerHTML = `
        <span class="${ETIQUETA}">${esc(etiqueta)}</span>
        <div class="flex items-center justify-between gap-3 border border-gray-300 border-l-4 border-l-blue-600 rounded-md px-3 py-2 bg-white">
          <div class="min-w-0">
            <p class="font-bold text-gray-900 truncate">${esc(p.nombres)} ${esc(p.apellidos)} <span class="ml-1 align-middle">${insignia(p.estado)}</span></p>
            <p class="text-sm text-gray-600">Documento ${o(p.dpi_o_documento)}, ${edadComoTexto(p.fecha_nacimiento)}</p>
          </div>
          <button type="button" data-cambiar class="enlace shrink-0">Cambiar paciente</button>
        </div>`;
      raiz.querySelector('[data-cambiar]').addEventListener('click', () => {
        estado.elegido = null;
        pintar();
        if (alElegir) alElegir(null);
      });
      return;
    }

    raiz.innerHTML = `
      <label class="block">
        <span class="${ETIQUETA}">${esc(etiqueta)}</span>
        <input type="search" placeholder="Nombre, apellido o documento" autocomplete="off"
               class="${CAMPO_TEXTO}">
        <div data-resultados class="mt-1 divide-y divide-gray-100 border border-gray-300 rounded-md bg-white shadow-lg hidden"></div>
      </label>`;

    const entrada = raiz.querySelector('input');
    const resultados = raiz.querySelector('[data-resultados]');

    const buscar = async () => {
      const texto = entrada.value.trim();
      if (texto.length < 2) {
        resultados.classList.add('hidden');
        resultados.innerHTML = '';
        return;
      }
      try {
        const consulta = { texto, limite: 8 };
        if (soloActivos) consulta.estado = 'Activo';
        const respuesta = await api.obtener(`/api/pacientes?${construirConsulta(consulta)}`);
        resultados.innerHTML = respuesta.elementos.length === 0
          ? '<p class="px-3 py-2 text-sm text-gray-600">Ningún paciente coincide. Revisa la ortografía o busca por documento.</p>'
          : respuesta.elementos.map((p) => `
            <button type="button" data-id="${esc(p.id_paciente)}" class="w-full text-left px-3 py-2 hover:bg-blue-50 focus:bg-blue-50 flex items-center justify-between gap-3">
              <span>
                <span class="font-bold text-gray-900 block">${esc(p.nombres)} ${esc(p.apellidos)}</span>
                <span class="text-sm text-gray-600">${o(p.codigo_historial)}, documento ${o(p.dpi_o_documento)}</span>
              </span>
              ${insignia(p.estado)}
            </button>`).join('');
        resultados.classList.remove('hidden');
        resultados.querySelectorAll('[data-id]').forEach((boton) => {
          boton.addEventListener('click', () => {
            const elegido = respuesta.elementos.find((p) => String(p.id_paciente) === boton.dataset.id);
            if (!elegido) return;
            recordarPaciente(elegido);
            estado.elegido = elegido;
            pintar();
            if (alElegir) alElegir(elegido);
          });
        });
      } catch (error) {
        resultados.innerHTML = `<p class="px-3 py-2 text-sm text-red-700">${esc(error.message)}</p>`;
        resultados.classList.remove('hidden');
      }
    };

    entrada.addEventListener('input', () => {
      clearTimeout(estado.temporizador);
      estado.temporizador = setTimeout(buscar, 300);
    });
  };

  if (pacienteInicial) {
    estado.elegido = pacienteInicial;
    recordarPaciente(pacienteInicial);
  }
  pintar();

  return {
    elemento: raiz,
    valor: () => estado.elegido?.id_paciente ?? null,
    paciente: () => estado.elegido,
    limpiar: () => { estado.elegido = null; pintar(); if (alElegir) alElegir(null); },
  };
}

// Tabla de consultas compartida por las vistas de consultas e historial.
const tablaConsultasHtml = (consultas, { conEnlace = true } = {}) => {
  if (!consultas?.length) {
    return `<div class="tabla-marco">${vacioHtml('Aún no hay consultas', ' Registra la primera desde una cita o con "Nueva consulta".')}</div>`;
  }
  return `
    <div class="tabla-marco">
      <table>
        <thead>
          <tr>
            <th class="px-3 py-2">Fecha</th>
            <th class="px-3 py-2">Motivo</th>
            <th class="px-3 py-2">Diagnósticos</th>
            <th class="px-3 py-2">Estado</th>
            <th class="px-3 py-2"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          ${consultas.map((c) => `
            <tr>
              <td class="px-3 py-2.5 whitespace-nowrap">${fechaHoraLarga(c.fecha_hora)}</td>
              <td class="px-3 py-2.5">${o(c.motivo_consulta)}</td>
              <td class="px-3 py-2.5 text-gray-700">${c.diagnosticos?.length ? c.diagnosticos.map((d) => esc(d.nombre_diagnostico)).join(', ') : '—'}</td>
              <td class="px-3 py-2.5">${insignia(c.estado)}</td>
              <td class="px-3 py-2.5 text-right whitespace-nowrap">
                ${conEnlace ? `<a href="#/consultas?id=${encodeURIComponent(c.id_consulta)}" class="enlace">Abrir</a>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
};
