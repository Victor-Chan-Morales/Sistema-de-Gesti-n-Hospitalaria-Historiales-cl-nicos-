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
    ${encabezadoHtml('Consultas', {
      descripcion: 'Elige un paciente para ver sus consultas o registrar una nueva.',
      acciones: '<button type="button" data-nueva class="btn btn-primario">Nueva consulta</button>',
    })}
    <div class="max-w-2xl mb-6" data-espacio-selector></div>
    <div data-zona-lista></div>`;

  const pintarLista = () => {
    const zona = contenedor.querySelector('[data-zona-lista]');
    if (!estado.paciente) {
      zona.innerHTML = vacioHtml('Elige un paciente', ' Búscalo por nombre o documento.');
      return;
    }
    zona.innerHTML = `
      ${fichaPacienteHtml(estado.paciente, { alergias: estado.alergias })}
      <div class="seccion-cabeza">
        <h2 class="titulo-seccion">Consultas del paciente</h2>
        <span class="seccion-nota">${estado.consultas.length} en total</span>
      </div>
      ${tablaConsultasHtml(estado.consultas)}`;
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
    zona.innerHTML = cargandoHtml('Cargando consultas...');
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
      contenedor.querySelector('[data-espacio-selector] input')?.focus();
      return;
    }
    window.location.hash = `#/consultas?paciente=${encodeURIComponent(estado.paciente.id_paciente)}`;
  });

  pintarLista();
}

// ----- Formulario de registro atómico -----

const filaDiagnosticoHtml = (opcionesDiag) => `
  <div class="fila-diagnostico renglon grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
    <select data-diagnostico required class="${CAMPO_TEXTO} sm:col-span-2">
      <option value="">Diagnóstico del catálogo *</option>
      ${opcionesDiag}
    </select>
    <select data-tipo aria-label="Tipo de diagnóstico" class="${CAMPO_TEXTO}">
      <option value="">Tipo</option>
      ${['Presuntivo', 'Definitivo', 'Seguimiento'].map((t) => `<option>${t}</option>`).join('')}
    </select>
    <div class="flex gap-1">
      <input type="text" data-observaciones placeholder="Observaciones" aria-label="Observaciones del diagnóstico" class="${CAMPO_TEXTO} flex-1">
      <button type="button" data-quitar-fila class="enlace-quitar px-1">Quitar</button>
    </div>
  </div>`;

const filaTratamientoHtml = () => `
  <div class="fila-tratamiento renglon">
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
      <input type="text" data-descripcion required placeholder="Descripción *" maxlength="255" class="${CAMPO_TEXTO} sm:col-span-4">
      <label class="text-sm font-bold text-gray-700">Inicio
        <input type="date" data-inicio class="${CAMPO_TEXTO_CORTO} w-full mt-1">
      </label>
      <label class="text-sm font-bold text-gray-700">Fin
        <input type="date" data-fin class="${CAMPO_TEXTO_CORTO} w-full mt-1">
      </label>
      <label class="text-sm font-bold text-gray-700">Estado
        <select data-estado class="${CAMPO_TEXTO_CORTO} w-full mt-1">
          <option value="">Activo</option>
          <option>Finalizado</option>
          <option>Suspendido</option>
        </select>
      </label>
      <div class="flex items-end">
        <button type="button" data-quitar-fila class="enlace-quitar">Quitar tratamiento</button>
      </div>
      <input type="text" data-indicaciones placeholder="Indicaciones" maxlength="255" class="${CAMPO_TEXTO_CORTO} sm:col-span-4">
    </div>
  </div>`;

const filaDetalleRecetaHtml = (opcionesMed) => `
  <div class="fila-detalle renglon grid grid-cols-1 sm:grid-cols-6 gap-2 items-start">
    <select data-medicamento required class="${CAMPO_TEXTO} sm:col-span-2">
      <option value="">Medicamento *</option>
      ${opcionesMed}
    </select>
    <input type="text" data-dosis required placeholder="Dosis *" maxlength="100" class="${CAMPO_TEXTO}">
    <input type="text" data-frecuencia required placeholder="Frecuencia *" maxlength="100" class="${CAMPO_TEXTO}">
    <input type="text" data-via placeholder="Vía" maxlength="50" class="${CAMPO_TEXTO}">
    <input type="text" data-duracion placeholder="Duración" maxlength="50" class="${CAMPO_TEXTO}">
    <div class="flex gap-1 sm:col-span-6">
      <input type="text" data-indicaciones placeholder="Indicaciones específicas" aria-label="Indicaciones específicas" class="${CAMPO_TEXTO_CORTO} flex-1">
      <button type="button" data-quitar-fila class="enlace-quitar px-1">Quitar</button>
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
  const alergias = await api.obtener(`/api/pacientes/${encodeURIComponent(idPaciente)}/historial`)
    .then((h) => h.alergias ?? []).catch(() => undefined);
  const catalogos = await Promise.all([
    api.obtener('/api/catalogos/diagnosticos'),
    api.obtener('/api/catalogos/medicamentos'),
  ]).then(([diagnosticos, medicamentos]) => ({ diagnosticos, medicamentos }));

  const opcionesDiag = opcionesSelect(catalogos.diagnosticos, (d) => d.id_catalogo_diag, (d) => `${d.nombre_diagnostico}${d.codigo_clinico ? ` [${d.codigo_clinico}]` : ''}`);
  const opcionesMed = opcionesSelect(catalogos.medicamentos, (m) => m.id_medicamento, (m) => `${m.nombre}${m.concentracion ? ` ${m.concentracion}` : ''}`);

  const bloque = (titulo, nota, cuerpo) => `
    <section class="form-bloque">
      <header><h2>${titulo}</h2>${nota ? `<p>${nota}</p>` : ''}</header>
      <div>${cuerpo}</div>
    </section>`;

  contenedor.innerHTML = `
    <a href="#/consultas" class="volver">Consultas</a>
    ${fichaPacienteHtml(paciente, { alergias })}
    <div class="encabezado">
      <h2 class="titulo-pagina">Nueva consulta</h2>
      <p class="encabezado-desc">Consulta, signos, diagnósticos, tratamientos y receta se guardan juntos: si algo falla, no se guarda nada.${idCita ? ' La cita de origen quedará como atendida.' : ''}</p>
    </div>
    <form data-formulario-consulta>
      ${bloque('Motivo y anamnesis', 'Lo que refiere el paciente y lo que encuentras al examinarlo.', `
        <div class="grid grid-cols-1 gap-4">
          <label class="block">
            <span class="${ETIQUETA}">Motivo de consulta</span>
            <input type="text" data-campo="motivo_consulta" maxlength="255" class="${CAMPO_TEXTO}">
          </label>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="block">
              <span class="${ETIQUETA}">Síntomas</span>
              <textarea data-campo="sintomas" rows="3" class="${CAMPO_TEXTO}"></textarea>
            </label>
            <label class="block">
              <span class="${ETIQUETA}">Examen físico</span>
              <textarea data-campo="examen_fisico" rows="3" class="${CAMPO_TEXTO}"></textarea>
            </label>
          </div>
          <label class="block">
            <span class="${ETIQUETA}">Notas clínicas</span>
            <textarea data-campo="notas_clinicas" rows="2" class="${CAMPO_TEXTO}"></textarea>
          </label>
        </div>`)}
      ${bloque('Signos vitales', 'Opcionales. Deja vacío lo que no se midió.', `
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          ${CAMPOS_SIGNOS.map(([clave, titulo, tipo]) => `
            <label class="block">
              <span class="${ETIQUETA}">${titulo}</span>
              <input type="${tipo}" ${tipo === 'number' ? 'step="any" min="0" inputmode="decimal"' : 'placeholder="120/80"'} data-signo="${clave}" class="${CAMPO_TEXTO}">
            </label>`).join('')}
        </div>`)}
      ${bloque('Diagnósticos', 'Del catálogo de la institución. Puedes registrar varios.', `
        <div data-coleccion-diagnosticos></div>
        <button type="button" data-agregar="diagnostico" class="enlace">Añadir diagnóstico</button>`)}
      ${bloque('Tratamientos', 'Indicaciones no farmacológicas o procedimientos.', `
        <div data-coleccion-tratamientos></div>
        <button type="button" data-agregar="tratamiento" class="enlace">Añadir tratamiento</button>`)}
      ${bloque('Receta', 'Si un medicamento se relaciona con una alergia del paciente, verás una advertencia al guardar. No bloquea: decides tú.', `
        <label class="block mb-4">
          <span class="${ETIQUETA}">Indicaciones generales</span>
          <input type="text" data-receta-general maxlength="255" class="${CAMPO_TEXTO}">
        </label>
        <div data-coleccion-detalles></div>
        <button type="button" data-agregar="detalle" class="enlace">Añadir medicamento</button>`)}
      <div class="form-pie items-center flex-wrap">
        <button type="submit" data-guardar class="btn btn-primario">Registrar consulta</button>
        <a href="#/consultas" class="btn btn-secundario">Cancelar</a>
        <label class="ml-auto flex items-center gap-2 text-sm">
          <span class="font-bold">Al guardar, la consulta queda</span>
          <select data-campo="estado" class="${CAMPO_TEXTO_CORTO}">
            <option value="Abierta">Abierta</option>
            <option value="Finalizada">Finalizada</option>
          </select>
        </label>
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
    destino.lastElementChild?.querySelector('select, input')?.focus();
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
  <tr>
    <td class="px-3 py-2 font-medium text-gray-800">${o(detalle.nombre_medicamento)}</td>
    <td class="px-3 py-2">${o(detalle.dosis)}</td>
    <td class="px-3 py-2">${o(detalle.frecuencia)}</td>
    <td class="px-3 py-2">${o(detalle.via_administracion)}</td>
    <td class="px-3 py-2">${o(detalle.duracion)}</td>
    <td class="px-3 py-2">${o(detalle.indicaciones_especificas)}</td>
  </tr>`;

const tarjetaRecetaHtml = (receta) => `
  <div class="tabla-marco mb-3">
    <div class="flex items-baseline justify-between gap-3 flex-wrap px-4 py-2.5 border-b border-gray-200">
      <p class="font-bold">Receta del ${fechaLarga(receta.fecha_receta)}</p>
      ${receta.indicaciones_generales ? `<p class="text-sm text-gray-700">${esc(receta.indicaciones_generales)}</p>` : ''}
    </div>
    <div class="overflow-x-auto">
      <table>
        <thead>
          <tr>
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
    const editable = puedeRegistrar && consultaActual.estado !== 'Anulada';
    const tablaSimple = (filas, vacio, columnas, celdas) => (filas.length === 0
      ? `<p class="text-gray-600 py-1">${esc(vacio)}</p>`
      : `<div class="tabla-marco"><table>
          <thead><tr>${columnas.map((c) => `<th class="px-3 py-2">${c}</th>`).join('')}</tr></thead>
          <tbody>${filas.map((f) => `<tr>${celdas(f).map((c, i) => `<td class="px-3 py-2.5 ${i === 0 ? 'font-bold' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`);

    contenedor.innerHTML = `
      <a href="#/historial?paciente=${encodeURIComponent(consultaActual.id_paciente)}" class="volver">Historial de ${esc(nombreDePaciente(nombres, consultaActual.id_paciente))}</a>
      ${advertenciasActuales.length ? `<div class="mb-5">${bannerHtml(`<strong>Revisa la receta: posible alergia.</strong><br>${advertenciasActuales.map((a) => esc(a)).join('<br>')}`, 'error')}</div>` : ''}
      <div class="encabezado">
        <div class="encabezado-fila">
          <div class="flex items-center gap-3 flex-wrap">
            <h1 class="titulo-pagina">Consulta del ${fechaHoraLarga(consultaActual.fecha_hora)}</h1>
            ${insignia(consultaActual.estado)}
          </div>
          <div class="acciones">
            ${puedeRegistrar && consultaActual.estado === 'Abierta' ? '<button type="button" data-finalizar class="btn btn-primario">Finalizar consulta</button>' : ''}
            ${puedeRegistrar && (consultaActual.estado === 'Abierta' || consultaActual.estado === 'Finalizada') ? '<button type="button" data-anular class="btn btn-peligro">Anular</button>' : ''}
          </div>
        </div>
      </div>

      <dl class="datos border-y border-gray-200 py-4 mb-6">
        <div><dt>Paciente</dt><dd>${esc(nombreDePaciente(nombres, consultaActual.id_paciente))}</dd></div>
        <div><dt>Profesional</dt><dd>${profesional ? esc(`${profesional.nombres} ${profesional.apellidos}`) : o(consultaActual.id_usuario_profesional)}</dd></div>
        <div><dt>Origen</dt><dd>${consultaActual.id_cita ? 'Cita programada' : 'Consulta directa'}</dd></div>
      </dl>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-x-10">
        <section class="lg:col-span-3 mb-6">
          <h2 class="titulo-seccion mb-3">Anamnesis</h2>
          <dl class="texto-clinico">
            <dt>Motivo de consulta</dt><dd>${o(consultaActual.motivo_consulta)}</dd>
            <dt>Síntomas</dt><dd>${o(consultaActual.sintomas)}</dd>
            <dt>Examen físico</dt><dd>${o(consultaActual.examen_fisico)}</dd>
            <dt>Notas clínicas</dt><dd>${o(consultaActual.notas_clinicas)}</dd>
          </dl>
        </section>
        <section class="lg:col-span-2 mb-6">
          <h2 class="titulo-seccion mb-3">Signos vitales</h2>
          ${signosHtmlDe(consultaActual)}
        </section>
      </div>

      <section class="seccion">
        <div class="seccion-cabeza">
          <h2 class="titulo-seccion">Diagnósticos</h2>
          ${editable ? '<button type="button" data-agregar-diagnostico class="enlace">Añadir diagnóstico</button>' : ''}
        </div>
        ${tablaSimple(consultaActual.diagnosticos ?? [], 'Sin diagnósticos.', ['Diagnóstico', 'Tipo', 'Observaciones'],
          (d) => [esc(d.nombre_diagnostico), o(d.tipo), o(d.observaciones)])}
      </section>

      <section class="seccion">
        <div class="seccion-cabeza">
          <h2 class="titulo-seccion">Tratamientos</h2>
          ${editable ? '<button type="button" data-agregar-tratamiento class="enlace">Añadir tratamiento</button>' : ''}
        </div>
        ${tablaSimple(consultaActual.tratamientos ?? [], 'Sin tratamientos.', ['Tratamiento', 'Periodo', 'Estado', 'Indicaciones'],
          (t) => [esc(t.descripcion), `${fechaLarga(t.fecha_inicio)}${t.fecha_fin ? ` a ${fechaLarga(t.fecha_fin)}` : ''}`, o(t.estado), o(t.indicaciones)])}
      </section>

      <section class="seccion">
        <div class="seccion-cabeza">
          <h2 class="titulo-seccion">Recetas</h2>
          ${editable ? '<button type="button" data-agregar-receta class="enlace">Nueva receta</button>' : ''}
        </div>
        ${(consultaActual.recetas ?? []).length === 0
          ? '<p class="text-gray-600 py-1">Sin recetas.</p>'
          : consultaActual.recetas.map(tarjetaRecetaHtml).join('')}
      </section>`;

    const botonFinalizar = contenedor.querySelector('[data-finalizar]');
    if (botonFinalizar) {
      botonFinalizar.addEventListener('click', async () => {
        try {
          await conCarga(botonFinalizar, async () => {
            const actualizada = await api.actualizar(`/api/consultas/${encodeURIComponent(id)}/estado`, { estado: 'Finalizada' });
            avisar('Consulta finalizada.');
            pintar(actualizada);
          });
        } catch (error) { avisar(error.message, 'error'); }
      });
    }
    const botonAnular = contenedor.querySelector('[data-anular]');
    if (botonAnular) {
      botonAnular.addEventListener('click', async () => {
        if (!await confirmar('La consulta queda en el historial marcada como anulada y ya no admite datos nuevos.', { textoBoton: 'Anular consulta', titulo: 'Anular consulta', peligro: true })) return;
        try {
          await conCarga(botonAnular, async () => {
            const actualizada = await api.actualizar(`/api/consultas/${encodeURIComponent(id)}/estado`, { estado: 'Anulada' });
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
    if (!signos) return '<p class="text-gray-600">Sin signos vitales registrados.</p>';
    return `<dl class="divide-y divide-gray-200 border-y border-gray-200">
      ${CAMPOS_SIGNOS.map(([clave, titulo]) => {
        const crudo = signos[clave];
        return `<div class="flex justify-between gap-4 py-2"><dt class="text-gray-600">${titulo}</dt><dd class="font-bold tabular-nums">${o(crudo === null || crudo === undefined ? '' : String(crudo))}</dd></div>`;
      }).join('')}
    </dl>`;
  };

  pintar(consulta, advertencias);
}

// ----- Extras para consultas abiertas -----

async function modalAgregarDiagnostico(idConsulta, alPintar) {
  const diagnosticos = await api.obtener('/api/catalogos/diagnosticos');
  const capa = abrirModal('Añadir diagnóstico', `
    <div class="space-y-4">
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
      ${pieModalHtml('Añadir diagnóstico')}
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
  const capa = abrirModal('Añadir tratamiento', `
    <div class="space-y-4">
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
      ${pieModalHtml('Añadir tratamiento')}
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
    <div class="space-y-4">
      <label class="block">
        <span class="${ETIQUETA}">Indicaciones generales</span>
        <input type="text" data-general maxlength="255" class="${CAMPO_TEXTO}">
      </label>
      <div data-detalles>${filaDetalleRecetaHtml(opcionesMed)}</div>
      <button type="button" data-agregar-detalle class="enlace">Añadir medicamento</button>
      <p class="text-sm text-gray-600">Si algo recetado se relaciona con una alergia del paciente, verás una advertencia al guardar.</p>
      ${pieModalHtml('Guardar receta')}
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
