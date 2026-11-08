// Vista de consultas (profesionales): lista por paciente, registro atómico con
// signos vitales, diagnósticos, tratamientos y receta, detalle y estados.
// Las advertencias de alergias que devuelve la API se muestran de forma visible.

REGISTRO_VISTAS.consultas = {
  titulo: 'Consultas',
  permiso: PERMISOS.VER_HISTORIAL_CLINICO,
  alMontar: vistaConsultas,
};

// Advertencias del último registro, para conservarlas al abrir el detalle.
let advertenciasPendientes = [];

async function vistaConsultas(contenedor, params) {
  if (params.get('id')) return detalleConsulta(contenedor, params.get('id'));
  if (params.get('paciente')) return formularioConsulta(contenedor, params.get('paciente'), params.get('cita'));
  return listaConsultas(contenedor);
}

// ----- Lista por paciente -----

async function listaConsultas(contenedor) {
  const estado = { paciente: null, consultas: [], alergias: [] };

  contenedor.innerHTML = `
    <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
      <h1 class="text-xl font-semibold text-gray-800">Consultas</h1>
      <button type="button" data-nueva class="bg-blue-600 text-white text-sm rounded px-4 py-2 hover:bg-blue-700">Nueva consulta</button>
    </div>
    <div class="bg-white border border-gray-200 rounded-lg p-4 mb-4" data-espacio-selector></div>
    <div data-zona-lista></div>`;

  const pintarLista = () => {
    const zona = contenedor.querySelector('[data-zona-lista]');
    if (!estado.paciente) {
      zona.innerHTML = '<p class="text-sm text-gray-500 py-6 text-center">Busca y elige un paciente para ver sus consultas.</p>';
      return;
    }
    const alergiasHtml = estado.alergias.length
      ? `<div class="mb-4">${bannerHtml(`<strong>Alergias del paciente:</strong> ${estado.alergias.map((a) => esc(`${a.sustancia}${a.nivel_gravedad ? ` (${a.nivel_gravedad})` : ''}`)).join(' · ')}`, 'advertencia')}</div>`
      : '';
    zona.innerHTML = `
      ${alergiasHtml}
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <h2 class="font-semibold text-gray-700 mb-2">Historial de consultas</h2>
        ${tablaConsultasHtml(estado.consultas)}
      </div>`;
  };

  const cargarPaciente = async (paciente) => {
    estado.paciente = paciente;
    if (!paciente) {
      estado.consultas = [];
      estado.alergias = [];
      pintarLista();
      return;
    }
    const zona = contenedor.querySelector('[data-zona-lista]');
    zona.innerHTML = '<p class="text-sm text-gray-500 py-6 text-center">Cargando consultas...</p>';
    try {
      const historial = await api.obtener(`/api/pacientes/${encodeURIComponent(paciente.id_paciente)}/historial`);
      estado.consultas = historial.consultas ?? [];
      estado.alergias = historial.alergias ?? [];
      pintarLista();
    } catch (error) {
      zona.innerHTML = bannerErrorHtml(error);
    }
  };

  const selector = crearSelectorPaciente({ etiqueta: 'Paciente', alElegir: cargarPaciente });
  contenedor.querySelector('[data-espacio-selector]').appendChild(selector.elemento);

  contenedor.querySelector('[data-nueva]').addEventListener('click', () => {
    if (!estado.paciente) {
      avisar('Elige primero el paciente de la consulta.', 'advertencia');
      return;
    }
    window.location.hash = `#/consultas?paciente=${encodeURIComponent(estado.paciente.id_paciente)}`;
  });

  pintarLista();
}

// ----- Formulario de registro atómico -----

const filaDiagnosticoHtml = (opcionesDiag) => `
  <div class="fila-diagnostico grid grid-cols-1 sm:grid-cols-4 gap-2 items-start mb-2">
    <select data-diagnostico required class="${CAMPO_TEXTO} sm:col-span-2">
      <option value="">Diagnóstico del catálogo *</option>
      ${opcionesDiag}
    </select>
    <select data-tipo class="${CAMPO_TEXTO}">
      <option value="">Tipo</option>
      ${['Presuntivo', 'Definitivo', 'Seguimiento'].map((t) => `<option>${t}</option>`).join('')}
    </select>
    <div class="flex gap-1">
      <input type="text" data-observaciones placeholder="Observaciones" class="${CAMPO_TEXTO_CORTO} flex-1">
      <button type="button" data-quitar-fila class="text-red-600 hover:text-red-800 text-sm px-1">Quitar</button>
    </div>
  </div>`;

const filaTratamientoHtml = () => `
  <div class="fila-tratamiento border border-gray-200 rounded-lg p-3 mb-2 bg-gray-50">
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
      <input type="text" data-descripcion required placeholder="Descripción *" maxlength="255" class="${CAMPO_TEXTO} sm:col-span-4">
      <label class="text-xs text-gray-500">Inicio
        <input type="date" data-inicio class="${CAMPO_TEXTO_CORTO} w-full mt-1">
      </label>
      <label class="text-xs text-gray-500">Fin
        <input type="date" data-fin class="${CAMPO_TEXTO_CORTO} w-full mt-1">
      </label>
      <label class="text-xs text-gray-500">Estado
        <select data-estado class="${CAMPO_TEXTO_CORTO} w-full mt-1">
          <option value="">Activo</option>
          <option>Finalizado</option>
          <option>Suspendido</option>
        </select>
      </label>
      <div class="flex items-end">
        <button type="button" data-quitar-fila class="text-red-600 hover:text-red-800 text-sm">Quitar tratamiento</button>
      </div>
      <input type="text" data-indicaciones placeholder="Indicaciones" maxlength="255" class="${CAMPO_TEXTO_CORTO} sm:col-span-4">
    </div>
  </div>`;

const filaDetalleRecetaHtml = (opcionesMed) => `
  <div class="fila-detalle grid grid-cols-1 sm:grid-cols-6 gap-2 items-start mb-2 border border-gray-200 rounded-lg p-2">
    <select data-medicamento required class="${CAMPO_TEXTO} sm:col-span-2">
      <option value="">Medicamento *</option>
      ${opcionesMed}
    </select>
    <input type="text" data-dosis required placeholder="Dosis *" maxlength="100" class="${CAMPO_TEXTO}">
    <input type="text" data-frecuencia required placeholder="Frecuencia *" maxlength="100" class="${CAMPO_TEXTO}">
    <input type="text" data-via placeholder="Vía" maxlength="50" class="${CAMPO_TEXTO}">
    <input type="text" data-duracion placeholder="Duración" maxlength="50" class="${CAMPO_TEXTO}">
    <div class="flex gap-1 sm:col-span-6">
      <input type="text" data-indicaciones placeholder="Indicaciones específicas" class="${CAMPO_TEXTO_CORTO} flex-1">
      <button type="button" data-quitar-fila class="text-red-600 hover:text-red-800 text-sm px-1">Quitar</button>
    </div>
  </div>`;

const CAMPOS_SIGNOS = [
  ['presion_arterial', 'Presión arterial', 'text'],
  ['temperatura', 'Temperatura (°C)', 'number'],
  ['frecuencia_cardiaca', 'Frecuencia cardíaca (lpm)', 'number'],
  ['frecuencia_respiratoria', 'Frecuencia respiratoria (rpm)', 'number'],
  ['peso', 'Peso (kg)', 'number'],
  ['talla', 'Talla (m)', 'number'],
  ['saturacion_oxigeno', 'Saturación de oxígeno (%)', 'number'],
];

async function formularioConsulta(contenedor, idPaciente, idCita) {
  const paciente = await api.obtener(`/api/pacientes/${encodeURIComponent(idPaciente)}`);
  const catalogos = await Promise.all([
    api.obtener('/api/catalogos/diagnosticos'),
    api.obtener('/api/catalogos/medicamentos'),
  ]).then(([diagnosticos, medicamentos]) => ({ diagnosticos, medicamentos }));

  const opcionesDiag = opcionesSelect(catalogos.diagnosticos, (d) => d.id_catalogo_diag, (d) => `${d.nombre_diagnostico}${d.codigo_clinico ? ` [${d.codigo_clinico}]` : ''}`);
  const opcionesMed = opcionesSelect(catalogos.medicamentos, (m) => m.id_medicamento, (m) => `${m.nombre}${m.concentracion ? ` ${m.concentracion}` : ''}`);

  contenedor.innerHTML = `
    <div class="mb-4">
      <a href="#/consultas" class="text-sm text-blue-600 hover:text-blue-800">&larr; Volver a consultas</a>
      <h1 class="text-xl font-semibold text-gray-800 mt-1">Nueva consulta</h1>
      <p class="text-sm text-gray-500">${esc(paciente.nombres)} ${esc(paciente.apellidos)} · ${edadComoTexto(paciente.fecha_nacimiento)} ${insignia(paciente.estado)}</p>
      ${idCita ? `<p class="text-sm text-gray-500">La cita <span class="font-mono">${esc(idCita)}</span> quedará como Atendida al registrar la consulta.</p>` : ''}
    </div>
    <form data-formulario-consulta class="space-y-4">
      <section class="bg-white rounded-lg border border-gray-200 p-4">
        <h2 class="font-semibold text-gray-800 mb-3">Motivo y anamnesis</h2>
        <div class="grid grid-cols-1 gap-3">
          <label class="block">
            <span class="${ETIQUETA}">Motivo de consulta</span>
            <input type="text" data-campo="motivo_consulta" maxlength="255" class="${CAMPO_TEXTO}">
          </label>
          <label class="block">
            <span class="${ETIQUETA}">Síntomas</span>
            <textarea data-campo="sintomas" rows="2" class="${CAMPO_TEXTO}"></textarea>
          </label>
          <label class="block">
            <span class="${ETIQUETA}">Examen físico</span>
            <textarea data-campo="examen_fisico" rows="2" class="${CAMPO_TEXTO}"></textarea>
          </label>
          <label class="block">
            <span class="${ETIQUETA}">Notas clínicas</span>
            <textarea data-campo="notas_clinicas" rows="2" class="${CAMPO_TEXTO}"></textarea>
          </label>
          <label class="block">
            <span class="${ETIQUETA}">Estado de la consulta</span>
            <select data-campo="estado" class="${CAMPO_TEXTO} w-56">
              <option value="Abierta">Abierta</option>
              <option value="Finalizada">Finalizada</option>
            </select>
          </label>
        </div>
      </section>

      <section class="bg-white rounded-lg border border-gray-200 p-4">
        <h2 class="font-semibold text-gray-800 mb-3">Signos vitales</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          ${CAMPOS_SIGNOS.map(([clave, titulo, tipo]) => `
            <label class="block">
              <span class="${ETIQUETA}">${titulo}</span>
              <input type="${tipo}" step="any" min="0" data-signo="${clave}" class="${CAMPO_TEXTO}">
            </label>`).join('')}
        </div>
      </section>

      <section class="bg-white rounded-lg border border-gray-200 p-4">
        <h2 class="font-semibold text-gray-800 mb-3">Diagnósticos</h2>
        <div data-coleccion-diagnosticos></div>
        <button type="button" data-agregar="diagnostico" class="text-sm text-blue-600 hover:text-blue-800">Agregar diagnóstico</button>
      </section>

      <section class="bg-white rounded-lg border border-gray-200 p-4">
        <h2 class="font-semibold text-gray-800 mb-3">Tratamientos</h2>
        <div data-coleccion-tratamientos></div>
        <button type="button" data-agregar="tratamiento" class="text-sm text-blue-600 hover:text-blue-800">Agregar tratamiento</button>
      </section>

      <section class="bg-white rounded-lg border border-gray-200 p-4">
        <h2 class="font-semibold text-gray-800 mb-1">Receta</h2>
        <p class="text-sm text-gray-500 mb-3">Si el paciente tiene alergias relacionadas, la API devolverá advertencias visibles.</p>
        <label class="block mb-3">
          <span class="${ETIQUETA}">Indicaciones generales</span>
          <input type="text" data-receta-general maxlength="255" class="${CAMPO_TEXTO}">
        </label>
        <div data-coleccion-detalles></div>
        <button type="button" data-agregar="detalle" class="text-sm text-blue-600 hover:text-blue-800">Agregar medicamento recetado</button>
      </section>

      <div class="flex gap-2">
        <button type="submit" data-guardar class="bg-blue-600 text-white text-sm rounded px-4 py-2 hover:bg-blue-700">Registrar consulta</button>
        <a href="#/consultas" class="border border-gray-300 text-gray-700 text-sm rounded px-4 py-2 hover:bg-gray-50">Cancelar</a>
      </div>
    </form>`;

  const formulario = contenedor.querySelector('[data-formulario-consulta]');
  formulario.addEventListener('click', (evento) => {
    const quitar = evento.target.closest('[data-quitar-fila]');
    if (quitar) {
      quitar.closest('.fila-diagnostico, .fila-tratamiento, .fila-detalle')?.remove();
      return;
    }
    const agregar = evento.target.closest('[data-agregar]');
    if (!agregar) return;
    const destino = {
      diagnostico: formulario.querySelector('[data-coleccion-diagnosticos]'),
      tratamiento: formulario.querySelector('[data-coleccion-tratamientos]'),
      detalle: formulario.querySelector('[data-coleccion-detalles]'),
    }[agregar.dataset.agregar];
    if (!destino) return;
    destino.insertAdjacentHTML('beforeend', {
      diagnostico: filaDiagnosticoHtml(opcionesDiag),
      tratamiento: filaTratamientoHtml(),
      detalle: filaDetalleRecetaHtml(opcionesMed),
    }[agregar.dataset.agregar]);
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector('[data-guardar]');

    const texto = (nombre) => formulario.querySelector(`[data-campo="${nombre}"]`).value.trim();
    const cuerpo = { id_paciente: paciente.id_paciente, estado: texto('estado') };
    if (idCita) cuerpo.id_cita = idCita;
    ['motivo_consulta', 'sintomas', 'examen_fisico', 'notas_clinicas'].forEach((nombre) => {
      if (texto(nombre)) cuerpo[nombre] = texto(nombre);
    });

    const signos = {};
    formulario.querySelectorAll('[data-signo]').forEach((input) => {
      if (input.value.trim() === '') return;
      signos[input.dataset.signo] = input.type === 'number' ? Number(input.value) : input.value.trim();
    });
    if (Object.keys(signos).length) cuerpo.signos_vitales = signos;

    const diagnosticos = Array.from(formulario.querySelectorAll('.fila-diagnostico'))
      .map((fila) => {
        if (!fila.querySelector('[data-diagnostico]').value) return null;
        const diagnostico = { id_catalogo_diag: fila.querySelector('[data-diagnostico]').value };
        const tipo = fila.querySelector('[data-tipo]').value;
        if (tipo) diagnostico.tipo = tipo;
        const observaciones = fila.querySelector('[data-observaciones]').value.trim();
        if (observaciones) diagnostico.observaciones = observaciones;
        return diagnostico;
      })
      .filter(Boolean);
    if (diagnosticos.length) cuerpo.diagnosticos = diagnosticos;

    const tratamientos = Array.from(formulario.querySelectorAll('.fila-tratamiento'))
      .map((fila) => {
        const descripcion = fila.querySelector('[data-descripcion]').value.trim();
        if (!descripcion) return null;
        const tratamiento = { descripcion };
        const inicio = fila.querySelector('[data-inicio]').value;
        if (inicio) tratamiento.fecha_inicio = inicio;
        const fin = fila.querySelector('[data-fin]').value;
        if (fin) tratamiento.fecha_fin = fin;
        const estadoTratamiento = fila.querySelector('[data-estado]').value;
        if (estadoTratamiento) tratamiento.estado = estadoTratamiento;
        const indicaciones = fila.querySelector('[data-indicaciones]').value.trim();
        if (indicaciones) tratamiento.indicaciones = indicaciones;
        return tratamiento;
      })
      .filter(Boolean);
    if (tratamientos.length) cuerpo.tratamientos = tratamientos;

    const detalles = Array.from(formulario.querySelectorAll('.fila-detalle'))
      .map((fila) => {
        if (!fila.querySelector('[data-medicamento]').value) return null;
        const detalle = {
          id_medicamento: fila.querySelector('[data-medicamento]').value,
          dosis: fila.querySelector('[data-dosis]').value.trim(),
          frecuencia: fila.querySelector('[data-frecuencia]').value.trim(),
        };
        if (!detalle.dosis || !detalle.frecuencia) return null;
        const via = fila.querySelector('[data-via]').value.trim();
        if (via) detalle.via_administracion = via;
        const duracion = fila.querySelector('[data-duracion]').value.trim();
        if (duracion) detalle.duracion = duracion;
        const indicaciones = fila.querySelector('[data-indicaciones]').value.trim();
        if (indicaciones) detalle.indicaciones_especificas = indicaciones;
        return detalle;
      })
      .filter(Boolean);
    if (detalles.length) {
      cuerpo.receta = { detalles };
      const generales = formulario.querySelector('[data-receta-general]').value.trim();
      if (generales) cuerpo.receta.indicaciones_generales = generales;
    }

    try {
      await conCarga(boton, async () => {
        const respuesta = await api.crear('/api/consultas', cuerpo);
        advertenciasPendientes = respuesta.advertencias ?? [];
        avisar('Consulta registrada.');
        window.location.hash = `#/consultas?id=${encodeURIComponent(respuesta.consulta.id_consulta)}`;
      });
    } catch (error) {
      avisar(error.message, 'error');
    }
  });
}

// ----- Detalle de consulta -----

const filaDetalleRecetaDetalleHtml = (detalle) => `
  <tr class="border-b last:border-0">
    <td class="px-3 py-2 font-medium text-gray-800">${o(detalle.nombre_medicamento)}</td>
    <td class="px-3 py-2">${o(detalle.dosis)}</td>
    <td class="px-3 py-2">${o(detalle.frecuencia)}</td>
    <td class="px-3 py-2">${o(detalle.via_administracion)}</td>
    <td class="px-3 py-2">${o(detalle.duracion)}</td>
    <td class="px-3 py-2">${o(detalle.indicaciones_especificas)}</td>
  </tr>`;

const tarjetaRecetaHtml = (receta) => `
  <div class="border border-gray-200 rounded-lg p-3 mb-2">
    <p class="text-sm font-medium text-gray-700 mb-2">Receta del ${fechaLarga(receta.fecha_receta)}</p>
    ${receta.indicaciones_generales ? `<p class="text-sm text-gray-600 mb-2">${esc(receta.indicaciones_generales)}</p>` : ''}
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs uppercase text-gray-500 border-b">
            <th class="px-3 py-2">Medicamento</th><th class="px-3 py-2">Dosis</th><th class="px-3 py-2">Frecuencia</th>
            <th class="px-3 py-2">Vía</th><th class="px-3 py-2">Duración</th><th class="px-3 py-2">Indicaciones</th>
          </tr>
        </thead>
        <tbody>${(receta.detalles ?? []).map(filaDetalleRecetaDetalleHtml).join('')}</tbody>
      </table>
    </div>
  </div>`;

async function detalleConsulta(contenedor, id) {
  const usuario = obtenerSesion().usuario;
  const puedeRegistrar = tienePermiso(usuario.rol, PERMISOS.REGISTRAR_DATOS_CLINICOS);

  const consulta = await api.obtener(`/api/consultas/${encodeURIComponent(id)}`);
  const [nombres, profesionales] = await Promise.all([
    nombresDePacientes(),
    api.obtener('/api/catalogos/profesionales').catch(() => []),
  ]);
  const profesional = profesionales.find((p) => String(p.id_usuario) === String(consulta.id_usuario_profesional));

  const advertencias = advertenciasPendientes;
  advertenciasPendientes = [];

  const pintar = (consultaActual, advertenciasActuales = []) => {
    contenedor.innerHTML = `
      <div class="mb-4">
        <a href="#/consultas" class="text-sm text-blue-600 hover:text-blue-800">&larr; Volver a consultas</a>
      </div>
      ${advertenciasActuales.length ? `<div class="mb-4">${bannerHtml(`<strong>Advertencias de alergias:</strong><br>${advertenciasActuales.map((a) => esc(a)).join('<br>')}`, 'advertencia')}</div>` : ''}
      <div class="flex items-center gap-2 flex-wrap mb-4">
        <h1 class="text-xl font-semibold text-gray-800">Consulta del ${fechaHoraLarga(consultaActual.fecha_hora)}</h1>
        ${insignia(consultaActual.estado)}
        <div class="flex-1"></div>
        ${puedeRegistrar && consultaActual.estado === 'Abierta' ? '<button type="button" data-finalizar class="bg-green-600 text-white text-sm rounded px-3 py-2 hover:bg-green-700">Finalizar</button>' : ''}
        ${puedeRegistrar && (consultaActual.estado === 'Abierta' || consultaActual.estado === 'Finalizada') ? '<button type="button" data-anular class="border border-red-300 text-red-700 text-sm rounded px-3 py-2 hover:bg-red-50">Anular</button>' : ''}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-4">
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-xs text-gray-500">Paciente</p>
          <p class="font-medium text-gray-800">${esc(nombreDePaciente(nombres, consultaActual.id_paciente))}</p>
          <a class="text-sm text-blue-600 hover:text-blue-800" href="#/historial?paciente=${encodeURIComponent(consultaActual.id_paciente)}">Ver historial</a>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-xs text-gray-500">Profesional</p>
          <p class="font-medium text-gray-800">${profesional ? esc(`${profesional.nombres} ${profesional.apellidos}`) : o(consultaActual.id_usuario_profesional)}</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-xs text-gray-500">Cita de origen</p>
          <p class="font-medium text-gray-800">${consultaActual.id_cita ? esc(consultaActual.id_cita) : 'Consulta directa'}</p>
        </div>
      </div>

      <section class="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h2 class="font-semibold text-gray-800 mb-3">Anamnesis</h2>
        <dl class="text-sm space-y-2">
          <div><dt class="text-gray-500">Motivo de consulta</dt><dd>${o(consultaActual.motivo_consulta)}</dd></div>
          <div><dt class="text-gray-500">Síntomas</dt><dd>${o(consultaActual.sintomas)}</dd></div>
          <div><dt class="text-gray-500">Examen físico</dt><dd>${o(consultaActual.examen_fisico)}</dd></div>
          <div><dt class="text-gray-500">Notas clínicas</dt><dd>${o(consultaActual.notas_clinicas)}</dd></div>
        </dl>
      </section>

      <section class="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h2 class="font-semibold text-gray-800 mb-3">Signos vitales</h2>
        ${signosHtmlDe(consultaActual)}
      </section>

      <section class="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-gray-800">Diagnósticos</h2>
          ${puedeRegistrar && consultaActual.estado !== 'Anulada' ? '<button type="button" data-agregar-diagnostico class="text-sm text-blue-600 hover:text-blue-800">Agregar</button>' : ''}
        </div>
        ${(consultaActual.diagnosticos ?? []).length === 0
          ? '<p class="text-sm text-gray-400">Sin diagnósticos.</p>'
          : `<table class="w-full text-sm"><tbody>${consultaActual.diagnosticos.map((d) => `
              <tr class="border-b last:border-0">
                <td class="px-3 py-2 font-medium text-gray-800">${esc(d.nombre_diagnostico)}</td>
                <td class="px-3 py-2">${o(d.tipo)}</td>
                <td class="px-3 py-2 text-gray-600">${o(d.observaciones)}</td>
              </tr>`).join('')}</tbody></table>`}
      </section>

      <section class="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-gray-800">Tratamientos</h2>
          ${puedeRegistrar && consultaActual.estado !== 'Anulada' ? '<button type="button" data-agregar-tratamiento class="text-sm text-blue-600 hover:text-blue-800">Agregar</button>' : ''}
        </div>
        ${(consultaActual.tratamientos ?? []).length === 0
          ? '<p class="text-sm text-gray-400">Sin tratamientos.</p>'
          : `<table class="w-full text-sm"><tbody>${consultaActual.tratamientos.map((t) => `
              <tr class="border-b last:border-0">
                <td class="px-3 py-2 font-medium text-gray-800">${esc(t.descripcion)}</td>
                <td class="px-3 py-2">${fechaLarga(t.fecha_inicio)}${t.fecha_fin ? ` a ${fechaLarga(t.fecha_fin)}` : ''}</td>
                <td class="px-3 py-2">${o(t.estado)}</td>
                <td class="px-3 py-2 text-gray-600">${o(t.indicaciones)}</td>
              </tr>`).join('')}</tbody></table>`}
      </section>

      <section class="bg-white rounded-lg border border-gray-200 p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-gray-800">Recetas</h2>
          ${puedeRegistrar && consultaActual.estado !== 'Anulada' ? '<button type="button" data-agregar-receta class="text-sm text-blue-600 hover:text-blue-800">Nueva receta</button>' : ''}
        </div>
        ${(consultaActual.recetas ?? []).length === 0
          ? '<p class="text-sm text-gray-400">Sin recetas.</p>'
          : consultaActual.recetas.map(tarjetaRecetaHtml).join('')}
      </section>`;

    const botonFinalizar = contenedor.querySelector('[data-finalizar]');
    if (botonFinalizar) {
      botonFinalizar.addEventListener('click', async () => {
        try {
          await conCarga(botonFinalizar, async () => {
            const actualizada = await api.actualizar(`/api/consultas/${encodeURIComponent(id)}`, { estado: 'Finalizada' });
            avisar('Consulta finalizada.');
            pintar(actualizada);
          });
        } catch (error) { avisar(error.message, 'error'); }
      });
    }
    const botonAnular = contenedor.querySelector('[data-anular]');
    if (botonAnular) {
      botonAnular.addEventListener('click', async () => {
        if (!await confirmar('Anular la consulta deja registro de la anulación en el historial.', { textoBoton: 'Anular' })) return;
        try {
          await conCarga(botonAnular, async () => {
            const actualizada = await api.actualizar(`/api/consultas/${encodeURIComponent(id)}`, { estado: 'Anulada' });
            avisar('Consulta anulada.');
            pintar(actualizada);
          });
        } catch (error) { avisar(error.message, 'error'); }
      });
    }

    const agregarDiagnostico = contenedor.querySelector('[data-agregar-diagnostico]');
    if (agregarDiagnostico) agregarDiagnostico.addEventListener('click', () => modalAgregarDiagnostico(id, pintar));
    const agregarTratamiento = contenedor.querySelector('[data-agregar-tratamiento]');
    if (agregarTratamiento) agregarTratamiento.addEventListener('click', () => modalAgregarTratamiento(id, pintar));
    const agregarReceta = contenedor.querySelector('[data-agregar-receta]');
    if (agregarReceta) agregarReceta.addEventListener('click', () => modalAgregarReceta(id, pintar));
  };

  const signosHtmlDe = (consultaActual) => {
    const signos = consultaActual.signos_vitales;
    if (!signos) return '<p class="text-sm text-gray-400">Sin signos vitales registrados.</p>';
    return `<dl class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
      ${CAMPOS_SIGNOS.map(([clave, titulo]) => {
        const crudo = signos[clave];
        return `<div><dt class="text-xs text-gray-500">${titulo}</dt><dd class="font-medium text-gray-800">${o(crudo === null || crudo === undefined ? '' : String(crudo))}</dd></div>`;
      }).join('')}
    </dl>`;
  };

  pintar(consulta, advertencias);
}

// ----- Extras para consultas abiertas -----

async function modalAgregarDiagnostico(idConsulta, alPintar) {
  const diagnosticos = await api.obtener('/api/catalogos/diagnosticos');
  const capa = abrirModal('Agregar diagnóstico', `
    <div class="space-y-3">
      <label class="block">
        <span class="${ETIQUETA}">Diagnóstico *</span>
        <select data-diagnostico required class="${CAMPO_TEXTO}">
          ${opcionesSelect(diagnosticos, (d) => d.id_catalogo_diag, (d) => `${d.nombre_diagnostico}${d.codigo_clinico ? ` [${d.codigo_clinico}]` : ''}`)}
        </select>
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Tipo</span>
        <select data-tipo class="${CAMPO_TEXTO}">
          <option value="">Sin especificar</option>
          <option>Presuntivo</option><option>Definitivo</option><option>Seguimiento</option>
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
    const cuerpo = { id_catalogo_diag: capa.querySelector('[data-diagnostico]').value };
    const tipo = capa.querySelector('[data-tipo]').value;
    if (tipo) cuerpo.tipo = tipo;
    const observaciones = capa.querySelector('[data-observaciones]').value.trim();
    if (observaciones) cuerpo.observaciones = observaciones;
    try {
      await conCarga(evento.currentTarget, async () => {
        const actualizada = await api.crear(`/api/consultas/${encodeURIComponent(idConsulta)}/diagnosticos`, cuerpo);
        cerrarModal();
        avisar('Diagnóstico agregado.');
        alPintar(actualizada);
      });
    } catch (error) {
      avisar(error.message, 'error');
    }
  });
}

async function modalAgregarTratamiento(idConsulta, alPintar) {
  const capa = abrirModal('Agregar tratamiento', `
    <div class="space-y-3">
      <label class="block">
        <span class="${ETIQUETA}">Descripción *</span>
        <input type="text" data-descripcion maxlength="255" required class="${CAMPO_TEXTO}">
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="${ETIQUETA}">Inicio</span>
          <input type="date" data-inicio value="${hoy()}" class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Fin</span>
          <input type="date" data-fin class="${CAMPO_TEXTO}">
        </label>
      </div>
      <label class="block">
        <span class="${ETIQUETA}">Estado</span>
        <select data-estado class="${CAMPO_TEXTO}">
          <option value="">Activo</option><option>Finalizado</option><option>Suspendido</option>
        </select>
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Indicaciones</span>
        <textarea data-indicaciones rows="2" class="${CAMPO_TEXTO}"></textarea>
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" data-cancelar class="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="button" data-guardar class="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Agregar</button>
      </div>
    </div>`);

  capa.querySelector('[data-cancelar]').addEventListener('click', cerrarModal);
  capa.querySelector('[data-guardar]').addEventListener('click', async (evento) => {
    const descripcion = capa.querySelector('[data-descripcion]').value.trim();
    if (!descripcion) { avisar('Escribe la descripción del tratamiento.', 'advertencia'); return; }
    const cuerpo = { descripcion };
    const inicio = capa.querySelector('[data-inicio]').value;
    if (inicio) cuerpo.fecha_inicio = inicio;
    const fin = capa.querySelector('[data-fin]').value;
    if (fin) cuerpo.fecha_fin = fin;
    const estado = capa.querySelector('[data-estado]').value;
    if (estado) cuerpo.estado = estado;
    const indicaciones = capa.querySelector('[data-indicaciones]').value.trim();
    if (indicaciones) cuerpo.indicaciones = indicaciones;
    try {
      await conCarga(evento.currentTarget, async () => {
        const actualizada = await api.crear(`/api/consultas/${encodeURIComponent(idConsulta)}/tratamientos`, cuerpo);
        cerrarModal();
        avisar('Tratamiento agregado.');
        alPintar(actualizada);
      });
    } catch (error) {
      avisar(error.message, 'error');
    }
  });
}

async function modalAgregarReceta(idConsulta, alPintar) {
  const medicamentos = await api.obtener('/api/catalogos/medicamentos');
  const opcionesMed = opcionesSelect(medicamentos, (m) => m.id_medicamento, (m) => `${m.nombre}${m.concentracion ? ` ${m.concentracion}` : ''}`);
  const capa = abrirModal('Nueva receta', `
    <div class="space-y-3">
      <label class="block">
        <span class="${ETIQUETA}">Indicaciones generales</span>
        <input type="text" data-general maxlength="255" class="${CAMPO_TEXTO}">
      </label>
      <div data-detalles>${filaDetalleRecetaHtml(opcionesMed)}</div>
      <button type="button" data-agregar-detalle class="text-sm text-blue-600 hover:text-blue-800">Agregar medicamento</button>
      <p class="text-sm text-gray-500">Si algo recetado se cruza con las alergias del paciente, verás una advertencia al guardar.</p>
      <div class="flex justify-end gap-2">
        <button type="button" data-cancelar class="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="button" data-guardar class="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Guardar receta</button>
      </div>
    </div>`, { ampliada: true });

  capa.querySelector('[data-agregar-detalle]').addEventListener('click', () => {
    capa.querySelector('[data-detalles]').insertAdjacentHTML('beforeend', filaDetalleRecetaHtml(opcionesMed));
  });
  capa.querySelector('[data-detalles]').addEventListener('click', (evento) => {
    const quitar = evento.target.closest('[data-quitar-fila]');
    if (quitar) quitar.closest('.fila-detalle')?.remove();
  });

  capa.querySelector('[data-cancelar]').addEventListener('click', cerrarModal);
  capa.querySelector('[data-guardar]').addEventListener('click', async (evento) => {
    const detalles = Array.from(capa.querySelectorAll('.fila-detalle'))
      .map((fila) => {
        if (!fila.querySelector('[data-medicamento]').value) return null;
        const detalle = {
          id_medicamento: fila.querySelector('[data-medicamento]').value,
          dosis: fila.querySelector('[data-dosis]').value.trim(),
          frecuencia: fila.querySelector('[data-frecuencia]').value.trim(),
        };
        if (!detalle.dosis || !detalle.frecuencia) return null;
        const via = fila.querySelector('[data-via]').value.trim();
        if (via) detalle.via_administracion = via;
        const duracion = fila.querySelector('[data-duracion]').value.trim();
        if (duracion) detalle.duracion = duracion;
        const indicaciones = fila.querySelector('[data-indicaciones]').value.trim();
        if (indicaciones) detalle.indicaciones_especificas = indicaciones;
        return detalle;
      })
      .filter(Boolean);

    if (!detalles.length) { avisar('Agrega al menos un medicamento con dosis y frecuencia.', 'advertencia'); return; }

    const cuerpo = { detalles };
    const general = capa.querySelector('[data-general]').value.trim();
    if (general) cuerpo.indicaciones_generales = general;

    try {
      await conCarga(evento.currentTarget, async () => {
        const respuesta = await api.crear(`/api/consultas/${encodeURIComponent(idConsulta)}/recetas`, cuerpo);
        cerrarModal();
        avisar('Receta agregada.');
        alPintar(respuesta.consulta, respuesta.advertencias ?? []);
      });
    } catch (error) {
      avisar(error.message, 'error');
    }
  });
}
