// Vista propia del Laboratorio Clínico (institución 3, MongoDB): órdenes de
// examen con uno o varios exámenes y resultados de estructura variable.

REGISTRO_VISTAS.laboratorio = {
  titulo: 'Órdenes de laboratorio',
  permiso: PERMISOS.VER_HISTORIAL_CLINICO,
  soloInstitucion: esLaboratorio,
  alMontar: vistaLaboratorio,
};

const ESTADOS_ORDEN = ['Pendiente', 'En proceso', 'Finalizada', 'Entregada', 'Cancelada'];
const TRANSICIONES_ORDEN = {
  Pendiente: ['En proceso', 'Cancelada'],
  'En proceso': ['Finalizada', 'Cancelada'],
  Finalizada: ['Entregada'],
};

async function vistaLaboratorio(contenedor, params) {
  const usuario = obtenerSesion().usuario;
  const puedeRegistrar = tienePermiso(usuario.rol, PERMISOS.REGISTRAR_DATOS_CLINICOS);
  const estado = { ordenes: [], filtroEstado: '', filtroPaciente: null, tipoVista: 'lista', orden: null };

  contenedor.innerHTML = `
    <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
      <h1 class="text-xl font-semibold text-gray-800">Órdenes de laboratorio</h1>
      ${puedeRegistrar ? '<button type="button" data-nueva-orden class="bg-blue-600 text-white text-sm rounded px-4 py-2 hover:bg-blue-700">Nueva orden</button>' : ''}
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white border border-gray-200 rounded-lg p-4 mb-4" data-filtros-lista>
      <div data-espacio-paciente class="sm:col-span-2"></div>
      <label class="block">
        <span class="${ETIQUETA}">Estado</span>
        <select data-estado class="${CAMPO_TEXTO}">
          <option value="">Todos</option>
          ${ESTADOS_ORDEN.map((e) => `<option>${e}</option>`).join('')}
        </select>
      </label>
    </div>
    <div id="zona-laboratorio"></div>`;

  const selector = crearSelectorPaciente({
    etiqueta: 'Paciente',
    alElegir: (paciente) => { estado.filtroPaciente = paciente?.id_paciente ?? null; },
  });
  contenedor.querySelector('[data-espacio-paciente]').appendChild(selector.elemento);
  contenedor.querySelector('[data-estado]').addEventListener('change', (e) => {
    estado.filtroEstado = e.target.value;
  });
  contenedor.querySelector('[data-filtros-lista]').addEventListener('change', () => cargarLista());

  async function cargarLista() {
    estado.tipoVista = 'lista';
    const zona = contenedor.querySelector('#zona-laboratorio');
    zona.innerHTML = '<p class="text-sm text-gray-500 py-6 text-center">Cargando órdenes...</p>';
    try {
      const consulta = construirConsulta({
        estado: estado.filtroEstado,
        id_paciente: estado.filtroPaciente,
      });
      const [ordenes, nombres] = await Promise.all([
        api.obtener(`/api/laboratorio/ordenes?${consulta}`),
        nombresDePacientes(),
      ]);
      estado.ordenes = ordenes;

      zona.innerHTML = `
        <div class="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs uppercase text-gray-500 border-b bg-gray-50">
                <th class="px-3 py-2">Fecha</th>
                <th class="px-3 py-2">Paciente</th>
                <th class="px-3 py-2">Exámenes</th>
                <th class="px-3 py-2">Resultados</th>
                <th class="px-3 py-2">Prioridad</th>
                <th class="px-3 py-2">Estado</th>
                <th class="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              ${ordenes.length === 0
                ? filaVacia(7, 'Sin órdenes con estos filtros.')
                : ordenes.map((orden) => `
                  <tr class="border-b last:border-0 hover:bg-gray-50" data-id="${esc(orden.id_orden_laboratorio)}">
                    <td class="px-3 py-2 whitespace-nowrap">${fechaHoraLarga(orden.fecha_orden)}</td>
                    <td class="px-3 py-2 font-medium text-gray-800">${esc(nombreDePaciente(nombres, orden.id_paciente))}</td>
                    <td class="px-3 py-2 text-gray-600">${(orden.examenes ?? []).length}</td>
                    <td class="px-3 py-2 text-gray-600">${(orden.resultados ?? []).length}/${orden.examenes.length}</td>
                    <td class="px-3 py-2">${insignia(orden.prioridad)}</td>
                    <td class="px-3 py-2">${insignia(orden.estado)}</td>
                    <td class="px-3 py-2 text-right">
                      <button type="button" data-ver class="text-blue-600 hover:text-blue-800 text-sm">Ver</button>
                    </td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

      zona.querySelectorAll('[data-id]').forEach((fila) => {
        fila.querySelector('[data-ver]').addEventListener('click', async () => {
          const orden = await api.obtener(`/api/laboratorio/ordenes/${encodeURIComponent(fila.dataset.id)}`);
          estado.ordenes = [orden];
          pintarDetalle(orden, []);
        });
      });
    } catch (error) {
      zona.innerHTML = bannerErrorHtml(error);
    }
  }

  async function pintarDetalle(orden, advertencias = []) {
    estado.tipoVista = 'detalle';
    const zona = contenedor.querySelector('#zona-laboratorio');
    const nombres = await nombresDePacientes();
    const transiciones = TRANSICIONES_ORDEN[orden.estado] ?? [];

    const resultadoDe = (idTipo) => (orden.resultados ?? []).find((r) => String(r.id_tipo_examen) === String(idTipo));

    zona.innerHTML = `
      ${advertencias.length ? `<div class="mb-4">${bannerHtml(advertencias.map((a) => esc(a)).join('<br>'), 'advertencia')}</div>` : ''}
      <button type="button" data-volver class="text-sm text-blue-600 hover:text-blue-800 mb-2">&larr; Volver a las órdenes</button>
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4">
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-xs text-gray-500">Paciente</p>
          <p class="font-medium text-gray-800">${esc(nombreDePaciente(nombres, orden.id_paciente))}</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-xs text-gray-500">Fecha de la orden</p>
          <p class="font-medium text-gray-800">${fechaHoraLarga(orden.fecha_orden)}</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-xs text-gray-500">Prioridad</p>
          <p class="font-medium text-gray-800">${insignia(orden.prioridad)}</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-xs text-gray-500">Estado</p>
          <p class="font-medium text-gray-800">${insignia(orden.estado)}</p>
        </div>
      </div>
      ${orden.observaciones ? `<div class="mb-4">${bannerHtml(esc(orden.observaciones), 'info')}</div>` : ''}
      ${puedeRegistrar && transiciones.length ? `
        <div class="flex gap-2 mb-4">
          ${transiciones.map((t) => t === 'Cancelada'
            ? `<button type="button" data-transicion="${esc(t)}" class="border border-red-300 text-red-700 text-sm rounded px-3 py-2 hover:bg-red-50">Cancelar orden</button>`
            : `<button type="button" data-transicion="${esc(t)}" class="bg-blue-600 text-white text-sm rounded px-3 py-2 hover:bg-blue-700">${esc(t === 'Entregada' ? 'Marcar entregada' : t)}</button>`).join('')}
        </div>` : ''}
      <div class="space-y-3">
        ${(orden.examenes ?? []).map((examen) => {
          const resultado = resultadoDe(examen.id_tipo_examen);
          return `
          <section class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div>
                <h3 class="font-semibold text-gray-800">${esc(examen.nombre)}</h3>
                <p class="text-xs text-gray-500">Muestra: ${o(examen.tipo_muestra)}</p>
              </div>
              ${resultado ? insignia('Finalizada', 'resultado-existe') : `<span class="text-xs text-amber-700 bg-amber-50 rounded-full px-2.5 py-0.5">Sin resultado</span>`}
              ${puedeRegistrar && !resultado && orden.estado !== 'Cancelada' ? `<button type="button" data-registrar="${esc(examen.id_tipo_examen)}" class="text-sm bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700">Registrar resultado</button>` : ''}
            </div>
            ${resultado ? `
              <div class="text-sm text-gray-700">
                <p><span class="text-gray-500">Resultado:</span> ${o(resultado.resultado_general)}</p>
                <p><span class="text-gray-500">Fecha de muestra:</span> ${fechaLarga(resultado.fecha_toma_muestra)} · <span class="text-gray-500">Fecha del resultado:</span> ${fechaLarga(resultado.fecha_resultado)}</p>
                ${(resultado.valores_detallados ?? []).length ? `
                  <table class="w-full text-sm mt-2 border border-gray-200 rounded">
                    <thead><tr class="text-left text-xs uppercase text-gray-500 bg-gray-50 border-b">
                      <th class="px-3 py-1.5">Parámetro</th><th class="px-3 py-1.5">Valor</th>
                      <th class="px-3 py-1.5">Unidad</th><th class="px-3 py-1.5">Rango de referencia</th>
                    </tr></thead>
                    <tbody>
                      ${resultado.valores_detallados.map((v) => `
                        <tr class="border-b last:border-0">
                          <td class="px-3 py-1.5 font-medium text-gray-800">${esc(v.parametro)}</td>
                          <td class="px-3 py-1.5">${esc(v.valor)}</td>
                          <td class="px-3 py-1.5">${o(v.unidad)}</td>
                          <td class="px-3 py-1.5">${o(v.rango_referencia)}</td>
                        </tr>`).join('')}
                    </tbody>
                  </table>` : ''}
                ${resultado.observaciones ? `<p class="mt-2"><span class="text-gray-500">Observaciones:</span> ${esc(resultado.observaciones)}</p>` : ''}
              </div>` : ''}
          </section>`;
        }).join('')}
      </div>`;

    zona.querySelector('[data-volver]').addEventListener('click', cargarLista);

    zona.querySelectorAll('[data-transicion]').forEach((boton) => {
      boton.addEventListener('click', async () => {
        const destino = boton.dataset.transicion;
        if (!await confirmar(destino === 'Cancelada' ? 'Cancelar esta orden de laboratorio?' : `Cambiar la orden al estado "${destino}"?`, { textoBoton: 'Aplicar' })) return;
        try {
          await conCarga(boton, async () => {
            const actualizada = await api.actualizar(`/api/laboratorio/ordenes/${encodeURIComponent(orden.id_orden_laboratorio)}/estado`, { estado: destino });
            avisar('Estado actualizado.');
            pintarDetalle(actualizada);
          });
        } catch (error) {
          avisar(error.message, 'error');
        }
      });
    });

    zona.querySelectorAll('[data-registrar]').forEach((boton) => {
      boton.addEventListener('click', () => {
        const idTipo = boton.dataset.registrar;
        const examen = orden.examenes.find((e) => String(e.id_tipo_examen) === String(idTipo));
        modalRegistrarResultado(orden, examen, pintarDetalle);
      });
    });
  }

  function modalRegistrarResultado(orden, examen, alPintar) {
    const capa = abrirModal(`Resultado: ${examen.nombre}`, `
      <div class="space-y-3">
        <label class="block">
          <span class="${ETIQUETA}">Fecha de toma de muestra</span>
          <input type="date" data-toma class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Fecha del resultado</span>
          <input type="date" data-resultado value="${hoy()}" class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Resultado general</span>
          <textarea data-general rows="2" class="${CAMPO_TEXTO}"></textarea>
        </label>
        <div>
          <p class="${ETIQUETA}">Valores medidos</p>
          <div data-valores></div>
          <button type="button" data-agregar-valor class="text-sm text-blue-600 hover:text-blue-800">Agregar parámetro medido</button>
        </div>
        <label class="block">
          <span class="${ETIQUETA}">Observaciones</span>
          <textarea data-observaciones rows="2" class="${CAMPO_TEXTO}"></textarea>
        </label>
        <p class="text-xs text-gray-500">El resultado y el estado de la orden se guardan como una unidad.</p>
        <div class="flex justify-end gap-2">
          <button type="button" data-cancelar class="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
          <button type="button" data-guardar class="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Guardar resultado</button>
        </div>
      </div>`, { ampliada: true });

    const filaValorHtml = () => `
      <div class="fila-valor grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        <input type="text" data-parametro maxlength="100" placeholder="Parámetro *" class="${CAMPO_TEXTO_CORTO}">
        <input type="text" data-valor maxlength="100" placeholder="Valor *" class="${CAMPO_TEXTO_CORTO}">
        <input type="text" data-unidad maxlength="30" placeholder="Unidad" class="${CAMPO_TEXTO_CORTO}">
        <div class="flex gap-1">
          <input type="text" data-rango maxlength="100" placeholder="Rango ref." class="${CAMPO_TEXTO_CORTO} flex-1">
          <button type="button" data-quitar-valor class="text-red-600 hover:text-red-800 text-sm px-1">Quitar</button>
        </div>
      </div>`;

    capa.querySelector('[data-agregar-valor]').addEventListener('click', () => {
      capa.querySelector('[data-valores]').insertAdjacentHTML('beforeend', filaValorHtml());
    });
    capa.querySelector('[data-valores]').addEventListener('click', (evento) => {
      const quitar = evento.target.closest('[data-quitar-valor]');
      if (quitar) quitar.closest('.fila-valor')?.remove();
    });

    capa.querySelector('[data-cancelar]').addEventListener('click', cerrarModal);
    capa.querySelector('[data-guardar]').addEventListener('click', async (evento) => {
      const cuerpo = { id_tipo_examen: examen.id_tipo_examen };
      const toma = capa.querySelector('[data-toma]').value;
      if (toma) cuerpo.fecha_toma_muestra = toma;
      const fechaResultado = capa.querySelector('[data-resultado]').value;
      if (fechaResultado) cuerpo.fecha_resultado = fechaResultado;
      const general = capa.querySelector('[data-general]').value.trim();
      if (general) cuerpo.resultado_general = general;

      const valores = Array.from(capa.querySelectorAll('.fila-valor'))
        .map((fila) => {
          const parametro = fila.querySelector('[data-parametro]').value.trim();
          const valor = fila.querySelector('[data-valor]').value.trim();
          if (!parametro || !valor) return null;
          const medido = { parametro, valor };
          const unidad = fila.querySelector('[data-unidad]').value.trim();
          if (unidad) medido.unidad = unidad;
          const rango = fila.querySelector('[data-rango]').value.trim();
          if (rango) medido.rango_referencia = rango;
          return medido;
        })
        .filter(Boolean);
      if (valores.length) cuerpo.valores_detallados = valores;

      const observaciones = capa.querySelector('[data-observaciones]').value.trim();
      if (observaciones) cuerpo.observaciones = observaciones;

      try {
        await conCarga(evento.currentTarget, async () => {
          const actualizada = await api.crear(`/api/laboratorio/ordenes/${encodeURIComponent(orden.id_orden_laboratorio)}/resultados`, cuerpo);
          cerrarModal();
          avisar('Resultado registrado.');
          alPintar(actualizada);
        });
      } catch (error) {
        avisar(error.message, 'error');
      }
    });
  }

  const botonNueva = contenedor.querySelector('[data-nueva-orden]');
  if (botonNueva) {
    botonNueva.addEventListener('click', async () => {
      const tipos = await api.obtener('/api/laboratorio/tipos-examen');
      const selectorOrden = crearSelectorPaciente({ etiqueta: 'Paciente *', soloActivos: true });

      const capa = abrirModal('Nueva orden de laboratorio', `
        <div class="space-y-3" data-form-orden>
          <div data-zona-selector></div>
          <label class="block">
            <span class="${ETIQUETA}">Prioridad</span>
            <select data-prioridad class="${CAMPO_TEXTO}">
              <option>Normal</option><option>Urgente</option><option>Emergencia</option>
            </select>
          </label>
          <label class="block">
            <span class="${ETIQUETA}">Observaciones</span>
            <textarea data-obs-orden rows="2" class="${CAMPO_TEXTO}"></textarea>
          </label>
          <div>
            <input type="search" data-filtro-tipo placeholder="Filtrar tipos de examen" class="${CAMPO_TEXTO} mb-2">
            <div data-lista-tipos class="border border-gray-200 rounded-lg p-3 max-h-56 overflow-y-auto space-y-1 text-sm"></div>
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" data-cancelar class="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button type="button" data-guardar class="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Crear orden</button>
          </div>
        </div>`, { alMontar: (capaModal) => {
          capaModal.querySelector('[data-zona-selector]').appendChild(selectorOrden.elemento);
          const lista = capaModal.querySelector('[data-lista-tipos]');
          const pintarTipos = (texto = '') => {
            const filtrados = tipos.filter((t) => t.nombre.toLowerCase().includes(texto.toLowerCase()));
            lista.innerHTML = filtrados.length === 0
              ? '<p class="text-sm text-gray-400">Sin coincidencias.</p>'
              : filtrados.map((t) => `
                <label class="flex items-start gap-2">
                  <input type="checkbox" data-tipo-examen value="${esc(t.id_tipo_examen)}" class="mt-1">
                  <span class="text-sm text-gray-700">${esc(t.nombre)}<span class="block text-xs text-gray-400">${o(t.tipo_muestra)}</span></span>
                </label>`).join('');
          };
          pintarTipos();
          capaModal.querySelector('[data-filtro-tipo]').addEventListener('input', (e) => pintarTipos(e.target.value.trim()));
        }, ampliada: true });

      capa.querySelector('[data-cancelar]').addEventListener('click', cerrarModal);
      capa.querySelector('[data-guardar]').addEventListener('click', async (evento) => {
        const idPaciente = selectorOrden.valor();
        if (!idPaciente) { avisar('Elige el paciente de la orden.', 'advertencia'); return; }
        const examenes = Array.from(capa.querySelectorAll('[data-tipo-examen]:checked'))
          .map((input) => ({ id_tipo_examen: input.value }));
        if (!examenes.length) { avisar('Marca al menos un tipo de examen.', 'advertencia'); return; }

        const cuerpo = { id_paciente: idPaciente, examenes };
        const prioridad = capa.querySelector('[data-prioridad]').value;
        if (prioridad && prioridad !== 'Normal') cuerpo.prioridad = prioridad;
        const observaciones = capa.querySelector('[data-obs-orden]').value.trim();
        if (observaciones) cuerpo.observaciones = observaciones;

        try {
          await conCarga(evento.currentTarget, async () => {
            const orden = await api.crear('/api/laboratorio/ordenes', cuerpo);
            cerrarModal();
            avisar('Orden creada.');
            pintarDetalle(orden);
          });
        } catch (error) {
          avisar(error.message, 'error');
        }
      });
    });
  }

  await cargarLista();
}
