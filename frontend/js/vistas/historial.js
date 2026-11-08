// Vista de historial clínico (profesionales): datos del historial, alergias,
// antecedentes y la línea de consultas del paciente.

REGISTRO_VISTAS.historial = {
  titulo: 'Historial',
  permiso: PERMISOS.VER_HISTORIAL_CLINICO,
  alMontar: vistaHistorial,
};

async function vistaHistorial(contenedor, params) {
  const usuario = obtenerSesion().usuario;
  const puedeRegistrar = tienePermiso(usuario.rol, PERMISOS.REGISTRAR_DATOS_CLINICOS);
  const estado = { paciente: null, historial: null, antecedentes: [], alergias: [], consultas: [] };

  contenedor.innerHTML = `
    <h1 class="text-xl font-semibold text-gray-800 mb-4">Historial clínico</h1>
    <div class="bg-white border border-gray-200 rounded-lg p-4 mb-4" data-espacio-selector></div>
    <div data-zona-historial></div>`;

  const pintar = () => {
    const zona = contenedor.querySelector('[data-zona-historial]');
    if (!estado.paciente) {
      zona.innerHTML = '<p class="text-sm text-gray-500 py-6 text-center">Busca y elige un paciente para ver su historial.</p>';
      return;
    }

    const h = estado.historial ?? {};
    zona.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-4">
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-xs text-gray-500">Paciente</p>
          <p class="font-medium text-gray-800">${esc(estado.paciente.nombres)} ${esc(estado.paciente.apellidos)}</p>
          <p class="text-sm text-gray-500">${edadComoTexto(estado.paciente.fecha_nacimiento)} · ${o(estado.paciente.dpi_o_documento)}</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-xs text-gray-500">Historial</p>
          <p class="font-mono text-sm text-gray-800">${o(h.codigo_historial)} ${insignia(h.estado ?? 'Activo')}</p>
          <p class="text-sm text-gray-500">Abierto el ${fechaLarga(h.fecha_apertura)}</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-xs text-gray-500">Cierre</p>
          <p class="text-sm text-gray-800">${h.fecha_cierre ? fechaLarga(h.fecha_cierre) : 'Abierto'}</p>
          ${h.motivo_cierre ? `<p class="text-sm text-gray-500">${esc(h.motivo_cierre)}</p>` : ''}
          ${h.observaciones ? `<p class="text-sm text-gray-500">${esc(h.observaciones)}</p>` : ''}
        </div>
      </div>

      <section class="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-gray-800">Alergias</h2>
          ${puedeRegistrar ? '<button type="button" data-agregar-alergia class="text-sm text-blue-600 hover:text-blue-800">Agregar alergia</button>' : ''}
        </div>
        ${estado.alergias.length === 0
          ? '<p class="text-sm text-gray-400">Sin alergias registradas.</p>'
          : `<div class="overflow-x-auto"><table class="w-full text-sm">
              <thead><tr class="text-left text-xs uppercase text-gray-500 border-b bg-gray-50">
                <th class="px-3 py-2">Sustancia</th><th class="px-3 py-2">Tipo</th><th class="px-3 py-2">Reacción</th>
                <th class="px-3 py-2">Gravedad</th><th class="px-3 py-2">Observaciones</th><th class="px-3 py-2">Registro</th>
              </tr></thead>
              <tbody>${estado.alergias.map((a) => `
                <tr class="border-b last:border-0">
                  <td class="px-3 py-2 font-medium text-gray-800">${esc(a.sustancia)}</td>
                  <td class="px-3 py-2">${o(a.tipo_alergia)}</td>
                  <td class="px-3 py-2">${o(a.reaccion)}</td>
                  <td class="px-3 py-2">${a.nivel_gravedad ? insignia(a.nivel_gravedad) : '—'}</td>
                  <td class="px-3 py-2 max-w-52 truncate">${o(a.observaciones)}</td>
                  <td class="px-3 py-2 whitespace-nowrap text-gray-500">${fechaLarga(a.fecha_registro)}</td>
                </tr>`).join('')}</tbody>
            </table></div>`}
      </section>

      <section class="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-gray-800">Antecedentes</h2>
          ${puedeRegistrar ? '<button type="button" data-agregar-antecedente class="text-sm text-blue-600 hover:text-blue-800">Agregar antecedente</button>' : ''}
        </div>
        ${estado.antecedentes.length === 0
          ? '<p class="text-sm text-gray-400">Sin antecedentes registrados.</p>'
          : `<div class="overflow-x-auto"><table class="w-full text-sm">
              <thead><tr class="text-left text-xs uppercase text-gray-500 border-b bg-gray-50">
                <th class="px-3 py-2">Tipo</th><th class="px-3 py-2">Descripción</th>
                <th class="px-3 py-2">Estado</th><th class="px-3 py-2">Observaciones</th><th class="px-3 py-2">Registro</th>
              </tr></thead>
              <tbody>${estado.antecedentes.map((a) => `
                <tr class="border-b last:border-0">
                  <td class="px-3 py-2">${esc(a.tipo_antecedente)}</td>
                  <td class="px-3 py-2 font-medium text-gray-800">${esc(a.descripcion)}</td>
                  <td class="px-3 py-2">${o(a.estado)}</td>
                  <td class="px-3 py-2 max-w-52 truncate">${o(a.observaciones)}</td>
                  <td class="px-3 py-2 whitespace-nowrap text-gray-500">${fechaLarga(a.fecha_registro)}</td>
                </tr>`).join('')}</tbody>
            </table></div>`}
      </section>

      <section class="bg-white rounded-lg border border-gray-200 p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-gray-800">Consultas</h2>
        </div>
        ${tablaConsultasHtml(estado.consultas)}
      </section>`;

    const agregarAlergia = zona.querySelector('[data-agregar-alergia]');
    if (agregarAlergia) agregarAlergia.addEventListener('click', () => modalAgregarAlergia(estado, cargar));
    const agregarAntecedente = zona.querySelector('[data-agregar-antecedente]');
    if (agregarAntecedente) agregarAntecedente.addEventListener('click', () => modalAgregarAntecedente(estado, cargar));
  };

  const cargar = async (paciente) => {
    estado.paciente = paciente;
    if (!paciente) {
      pintar();
      return;
    }
    const zona = contenedor.querySelector('[data-zona-historial]');
    zona.innerHTML = '<p class="text-sm text-gray-500 py-6 text-center">Cargando historial...</p>';
    try {
      const respuesta = await api.obtener(`/api/pacientes/${encodeURIComponent(paciente.id_paciente)}/historial`);
      estado.historial = respuesta.historial;
      estado.antecedentes = respuesta.antecedentes ?? [];
      estado.alergias = respuesta.alergias ?? [];
      estado.consultas = respuesta.consultas ?? [];
      pintar();
    } catch (error) {
      zona.innerHTML = bannerErrorHtml(error);
    }
  };

  let pacienteParam = null;
  if (params.get('paciente')) {
    pacienteParam = await api.obtener(`/api/pacientes/${encodeURIComponent(params.get('paciente'))}`);
  }
  const selector = crearSelectorPaciente({ etiqueta: 'Paciente', alElegir: cargar, pacienteInicial: pacienteParam });
  contenedor.querySelector('[data-espacio-selector]').appendChild(selector.elemento);

  if (pacienteParam) {
    await cargar(pacienteParam);
    return;
  }
  pintar();
}

async function modalAgregarAlergia(estado, alRecargar) {
  const catalogo = await api.obtener('/api/catalogos/alergias');
  const capa = abrirModal('Agregar alergia', `
    <div class="space-y-3">
      <label class="block">
        <span class="${ETIQUETA}">Alergia del catálogo *</span>
        <select data-alergia required class="${CAMPO_TEXTO}">
          ${opcionesSelect(catalogo, (a) => a.id_catalogo_alergia, (a) => a.sustancia)}
        </select>
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Reacción</span>
        <input type="text" data-reaccion maxlength="255" class="${CAMPO_TEXTO}">
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Nivel de gravedad</span>
        <select data-gravedad class="${CAMPO_TEXTO}">
          <option value="">Sin especificar</option>
          <option>Leve</option><option>Moderada</option><option>Grave</option>
        </select>
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Observaciones</span>
        <textarea data-observaciones rows="2" class="${CAMPO_TEXTO}"></textarea>
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" data-cancelar class="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="button" data-guardar class="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Agregar</button>
      </div>
    </div>`);

  capa.querySelector('[data-cancelar]').addEventListener('click', cerrarModal);
  capa.querySelector('[data-guardar]').addEventListener('click', async (evento) => {
    const cuerpo = { id_catalogo_alergia: capa.querySelector('[data-alergia]').value };
    const reaccion = capa.querySelector('[data-reaccion]').value.trim();
    if (reaccion) cuerpo.reaccion = reaccion;
    const gravedad = capa.querySelector('[data-gravedad]').value;
    if (gravedad) cuerpo.nivel_gravedad = gravedad;
    const observaciones = capa.querySelector('[data-observaciones]').value.trim();
    if (observaciones) cuerpo.observaciones = observaciones;
    try {
      await conCarga(evento.currentTarget, async () => {
        await api.crear(`/api/pacientes/${encodeURIComponent(estado.paciente.id_paciente)}/alergias`, cuerpo);
        cerrarModal();
        avisar('Alergia agregada.');
        await alRecargar(estado.paciente);
      });
    } catch (error) {
      avisar(error.message, 'error');
    }
  });
}

function modalAgregarAntecedente(estado, alRecargar) {
  const capa = abrirModal('Agregar antecedente', `
    <div class="space-y-3">
      <label class="block">
        <span class="${ETIQUETA}">Tipo *</span>
        <select data-tipo required class="${CAMPO_TEXTO}">
          <option>Personal</option><option>Familiar</option><option>Quirúrgico</option>
          <option>Patológico</option><option>Hereditario</option>
        </select>
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Descripción *</span>
        <textarea data-descripcion required rows="2" class="${CAMPO_TEXTO}"></textarea>
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Estado</span>
        <input type="text" data-estado maxlength="20" placeholder="Activo, superado..." class="${CAMPO_TEXTO}">
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Observaciones</span>
        <textarea data-observaciones rows="2" class="${CAMPO_TEXTO}"></textarea>
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" data-cancelar class="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="button" data-guardar class="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Agregar</button>
      </div>
    </div>`);

  capa.querySelector('[data-cancelar]').addEventListener('click', cerrarModal);
  capa.querySelector('[data-guardar]').addEventListener('click', async (evento) => {
    const descripcion = capa.querySelector('[data-descripcion]').value.trim();
    if (!descripcion) { avisar('Escribe la descripción del antecedente.', 'advertencia'); return; }
    const cuerpo = {
      tipo_antecedente: capa.querySelector('[data-tipo]').value,
      descripcion,
    };
    const estadoTexto = capa.querySelector('[data-estado]').value.trim();
    if (estadoTexto) cuerpo.estado = estadoTexto;
    const observaciones = capa.querySelector('[data-observaciones]').value.trim();
    if (observaciones) cuerpo.observaciones = observaciones;
    try {
      await conCarga(evento.currentTarget, async () => {
        await api.crear(`/api/pacientes/${encodeURIComponent(estado.paciente.id_paciente)}/antecedentes`, cuerpo);
        cerrarModal();
        avisar('Antecedente agregado.');
        await alRecargar(estado.paciente);
      });
    } catch (error) {
      avisar(error.message, 'error');
    }
  });
}
