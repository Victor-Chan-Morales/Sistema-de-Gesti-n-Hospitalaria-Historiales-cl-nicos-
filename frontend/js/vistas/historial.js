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
    ${encabezadoHtml('Historial clínico', { descripcion: 'Alergias, antecedentes y consultas del paciente en tu institución.' })}
    <div class="max-w-2xl mb-6" data-espacio-selector></div>
    <div data-zona-historial></div>`;

  const lista = (elementos, vacio, fila) => (elementos.length === 0
    ? `<p class="text-gray-600 py-2">${esc(vacio)}</p>`
    : `<ul class="divide-y divide-gray-200 border-y border-gray-200">${elementos.map((e) => `<li class="py-3">${fila(e)}</li>`).join('')}</ul>`);

  const pintar = () => {
    const zona = contenedor.querySelector('[data-zona-historial]');
    if (!estado.paciente) {
      zona.innerHTML = vacioHtml('Elige un paciente', ' Búscalo por nombre o documento para abrir su historial.');
      return;
    }

    const h = estado.historial ?? {};
    const activo = estado.paciente.estado === 'Activo';
    const acciones = puedeRegistrar && activo
      ? `<a href="#/consultas?paciente=${encodeURIComponent(estado.paciente.id_paciente)}" class="btn btn-primario">Nueva consulta</a>` : '';
    zona.innerHTML = `
      ${fichaPacienteHtml(estado.paciente, { alergias: estado.alergias, acciones, codigo: h.codigo_historial })}
      <p class="text-sm text-gray-600 -mt-4 mb-6">
        Historial ${esc((h.estado ?? 'Activo').toLowerCase())}, abierto el ${fechaLarga(h.fecha_apertura)}${h.fecha_cierre ? `; cerrado el ${fechaLarga(h.fecha_cierre)}${h.motivo_cierre ? ` por ${esc(h.motivo_cierre)}` : ''}` : ''}.
        ${h.observaciones ? esc(h.observaciones) : ''}
      </p>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-10">
        <section class="mb-8">
          <div class="seccion-cabeza">
            <h2 class="titulo-seccion">Alergias</h2>
            ${puedeRegistrar && activo ? '<button type="button" data-agregar-alergia class="enlace">Registrar alergia</button>' : ''}
          </div>
          ${lista(estado.alergias, 'Sin alergias registradas.', (a) => `
            <div class="flex items-baseline justify-between gap-3">
              <p class="font-bold">${esc(a.sustancia)} ${a.tipo_alergia ? `<span class="font-normal text-gray-600">(${esc(a.tipo_alergia)})</span>` : ''}</p>
              ${a.nivel_gravedad ? insignia(a.nivel_gravedad) : ''}
            </div>
            ${a.reaccion ? `<p class="text-gray-700">Reacción: ${esc(a.reaccion)}</p>` : ''}
            ${a.observaciones ? `<p class="text-sm text-gray-600">${esc(a.observaciones)}</p>` : ''}
            <p class="text-sm text-gray-500">Registrada el ${fechaLarga(a.fecha_registro)}</p>`)}
        </section>

        <section class="mb-8">
          <div class="seccion-cabeza">
            <h2 class="titulo-seccion">Antecedentes</h2>
            ${puedeRegistrar && activo ? '<button type="button" data-agregar-antecedente class="enlace">Registrar antecedente</button>' : ''}
          </div>
          ${lista(estado.antecedentes, 'Sin antecedentes registrados.', (a) => `
            <div class="flex items-baseline justify-between gap-3">
              <p><span class="text-gray-600">${esc(a.tipo_antecedente)}:</span> <span class="font-bold">${esc(a.descripcion)}</span></p>
              ${a.estado ? `<span class="text-sm text-gray-600 whitespace-nowrap">${esc(a.estado)}</span>` : ''}
            </div>
            ${a.observaciones ? `<p class="text-sm text-gray-600">${esc(a.observaciones)}</p>` : ''}
            <p class="text-sm text-gray-500">Registrado el ${fechaLarga(a.fecha_registro)}</p>`)}
        </section>
      </div>

      <section>
        <div class="seccion-cabeza">
          <h2 class="titulo-seccion">Consultas</h2>
          <span class="seccion-nota">${estado.consultas.length} en total</span>
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
    zona.innerHTML = cargandoHtml('Cargando historial...');
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
  const capa = abrirModal('Registrar alergia', `
    <div class="space-y-4">
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
      ${pieModalHtml('Registrar')}
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
        avisar('Alergia registrada.');
        await alRecargar(estado.paciente);
      });
    } catch (error) {
      avisar(error.message, 'error');
    }
  });
}

function modalAgregarAntecedente(estado, alRecargar) {
  const capa = abrirModal('Registrar antecedente', `
    <div class="space-y-4">
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
      ${pieModalHtml('Registrar')}
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
        avisar('Antecedente registrado.');
        await alRecargar(estado.paciente);
      });
    } catch (error) {
      avisar(error.message, 'error');
    }
  });
}
