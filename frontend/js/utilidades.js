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
  `<span class="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASES_ESTADO[texto] ?? 'bg-gray-100 text-gray-600'} ${extra}">${esc(texto ?? '—')}</span>`;

const CAMPO_TEXTO = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const CAMPO_TEXTO_CORTO = 'border border-gray-300 rounded px-2 py-1.5 text-sm';

const ETIQUETA = 'block text-sm font-medium text-gray-700 mb-1';

// Avisos flotantes; cualquier página necesita <div id="avisos">.
function avisar(mensaje, tipo = 'exito') {
  const contenedor = document.getElementById('avisos');
  if (!contenedor) return;
  const clases = {
    exito: 'bg-green-600',
    error: 'bg-red-600',
    advertencia: 'bg-amber-500',
    info: 'bg-blue-600',
  }[tipo] ?? 'bg-gray-700';
  const aviso = document.createElement('div');
  aviso.className = `${clases} text-white text-sm rounded-lg shadow-lg px-4 py-2.5 max-w-sm transition-opacity duration-300 cursor-pointer`;
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
  error: 'bg-red-50 border-red-300 text-red-800',
  advertencia: 'bg-amber-50 border-amber-400 text-amber-900',
  exito: 'bg-green-50 border-green-400 text-green-800',
  info: 'bg-blue-50 border-blue-300 text-blue-800',
};

const bannerHtml = (mensaje, tipo = 'info') =>
  `<div class="border rounded-lg px-4 py-3 text-sm ${CLASES_BANNER[tipo]}" role="alert">${mensaje}</div>`;

const bannerErrorHtml = (error) =>
  bannerHtml(esc(error?.message || 'Ocurrió un error inesperado.'), error?.estado === 503 ? 'advertencia' : 'error');

const filaVacia = (columnas, mensaje = 'Sin registros.') =>
  `<tr><td colspan="${columnas}" class="px-3 py-4 text-center text-gray-400">${esc(mensaje)}</td></tr>`;

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
  capaModal = document.createElement('div');
  capaModal.className = 'fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40';
  capaModal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl w-full ${ampliada ? 'max-w-3xl' : 'max-w-xl'} max-h-[88vh] flex flex-col" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <header class="flex items-center justify-between border-b border-gray-200 px-5 py-3 shrink-0">
        <h2 class="text-lg font-semibold text-gray-800">${esc(titulo)}</h2>
        <button type="button" data-cerrar class="text-gray-400 hover:text-gray-700" aria-label="Cerrar">${ICONO_CERRAR}</button>
      </header>
      <div class="px-5 py-4 overflow-y-auto"></div>
    </div>`;
  capaModal.querySelector('header ~ div').innerHTML = cuerpoHtml;
  capaModal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  document.body.appendChild(capaModal);
  if (alMontar) alMontar(capaModal);
  return capaModal;
}

function cerrarModal() {
  const capa = capaModal ?? document.querySelector('div.fixed.inset-0.z-40');
  if (capa) capa.remove();
  capaModal = null;
}

// Confirmación modal: devuelve true si el usuario acepta.
function confirmar(mensaje, { textoBoton = 'Confirmar', titulo = 'Confirmar' } = {}) {
  return new Promise((resolver) => {
    const capa = abrirModal(titulo, `
      <p class="text-sm text-gray-700">${esc(mensaje)}</p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" data-cancelar class="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="button" data-aceptar class="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">${esc(textoBoton)}</button>
      </div>`);
    capa.querySelector('[data-cancelar]').addEventListener('click', () => { cerrarModal(); resolver(false); });
    capa.querySelector('[data-aceptar]').addEventListener('click', () => { cerrarModal(); resolver(true); });
  });
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
        <div class="flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2 bg-gray-50">
          <div>
            <p class="text-sm font-medium text-gray-800">${esc(p.nombres)} ${esc(p.apellidos)}</p>
            <p class="text-xs text-gray-500">${o(p.dpi_o_documento)} · ${insignia(p.estado)}</p>
          </div>
          <button type="button" data-cambiar class="text-sm text-blue-600 hover:text-blue-800">Cambiar</button>
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
        <input type="search" placeholder="Busca por nombre, apellido o documento (mínimo 2 letras)" autocomplete="off"
               class="${CAMPO_TEXTO}">
        <div data-resultados class="mt-1 divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white hidden"></div>
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
          ? '<p class="px-3 py-2 text-sm text-gray-500">Sin resultados.</p>'
          : respuesta.elementos.map((p) => `
            <button type="button" data-id="${esc(p.id_paciente)}" class="w-full text-left px-3 py-2 hover:bg-blue-50">
              <span class="text-sm font-medium text-gray-800 block">${esc(p.nombres)} ${esc(p.apellidos)}</span>
              <span class="text-xs text-gray-500">${o(p.dpi_o_documento)} · ${esc(p.codigo_historial ?? '')} · ${esc(p.estado)}</span>
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
    return `<table class="w-full text-sm"><tbody><tr><td class="text-center text-gray-400 py-4">El paciente aún no tiene consultas.</td></tr></tbody></table>`;
  }
  return `
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="text-left text-xs uppercase text-gray-500 border-b">
          <th class="px-3 py-2">Fecha</th>
          <th class="px-3 py-2">Motivo</th>
          <th class="px-3 py-2">Diagnósticos</th>
          <th class="px-3 py-2">Estado</th>
          <th class="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody>
        ${consultas.map((c) => `
          <tr class="border-b last:border-0 hover:bg-gray-50">
            <td class="px-3 py-2 whitespace-nowrap">${fechaHoraLarga(c.fecha_hora)}</td>
            <td class="px-3 py-2">${o(c.motivo_consulta)}</td>
            <td class="px-3 py-2 text-gray-600">${c.diagnosticos?.length ?? 0}</td>
            <td class="px-3 py-2">${insignia(c.estado)}</td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              ${conEnlace ? `<a href="#/consultas?id=${encodeURIComponent(c.id_consulta)}" class="text-blue-600 hover:text-blue-800 text-sm">Ver detalle</a>` : ''}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
};
