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
    <div data-cabecera-lista>
      ${encabezadoHtml('Órdenes de laboratorio', {
        descripcion: 'Cada orden agrupa uno o varios exámenes. Al registrar todos los resultados, la orden pasa a finalizada.',
        acciones: puedeRegistrar ? '<button type="button" data-nueva-orden class="btn btn-primario">Nueva orden</button>' : '',
      })}
    </div>
    <div class="filtros grid grid-cols-1 sm:grid-cols-3 !items-end" data-filtros-lista>
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
    contenedor.querySelector('[data-cabecera-lista]').hidden = false;
    contenedor.querySelector('[data-filtros-lista]').hidden = false;
    zona.innerHTML = cargandoHtml('Cargando órdenes...');
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
        <div class="tabla-marco">
          <table>
            <thead>
              <tr>
                <th class="px-4 py-2">Fecha</th>
                <th class="px-3 py-2">Paciente</th>
                <th class="px-3 py-2">Exámenes</th>
                <th class="px-3 py-2">Resultados</th>
                <th class="px-3 py-2">Prioridad</th>
                <th class="px-3 py-2">Estado</th>
                <th class="px-3 py-2"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              ${ordenes.length === 0
                ? filaVacia(7, estado.filtroEstado || estado.filtroPaciente ? 'Ninguna orden coincide con estos filtros.' : 'Aún no hay órdenes. Crea la primera con "Nueva orden".')
                : ordenes.map((orden) => `
                  <tr data-id="${esc(orden.id_orden_laboratorio)}">
                    <td class="px-4 py-2.5 whitespace-nowrap">${fechaHoraLarga(orden.fecha_orden)}</td>
                    <td class="px-3 py-2.5 font-bold">${esc(nombreDePaciente(nombres, orden.id_paciente))}</td>
                    <td class="px-3 py-2.5 text-gray-700 max-w-xs">${(orden.examenes ?? []).map((e) => esc(e.nombre)).join(', ')}</td>
                    <td class="px-3 py-2.5 whitespace-nowrap">${(orden.resultados ?? []).length} de ${(orden.examenes ?? []).length}</td>
                    <td class="px-3 py-2.5">${insignia(orden.prioridad)}</td>
                    <td class="px-3 py-2.5">${insignia(orden.estado)}</td>
                    <td class="px-3 py-2.5 text-right">
                      <button type="button" data-ver class="enlace">Abrir</button>
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

    contenedor.querySelector('[data-cabecera-lista]').hidden = true;
    contenedor.querySelector('[data-filtros-lista]').hidden = true;
    const completos = (orden.resultados ?? []).length;
    const total = (orden.examenes ?? []).length;

    zona.innerHTML = `
      <button type="button" data-volver class="volver">Órdenes de laboratorio</button>
      ${advertencias.length ? `<div class="mb-4">${bannerHtml(advertencias.map((a) => esc(a)).join('<br>'), 'advertencia')}</div>` : ''}
      <div class="encabezado">
        <div class="encabezado-fila">
          <div class="flex items-center gap-3 flex-wrap">
            <h1 class="titulo-pagina">Orden de ${esc(nombreDePaciente(nombres, orden.id_paciente))}</h1>
            ${insignia(orden.estado)}
          </div>
          ${puedeRegistrar && transiciones.length ? `<div class="acciones">
            ${transiciones.map((t) => t === 'Cancelada'
              ? `<button type="button" data-transicion="${esc(t)}" class="btn btn-peligro">Cancelar orden</button>`
              : `<button type="button" data-transicion="${esc(t)}" class="btn btn-primario">${esc(t === 'Entregada' ? 'Marcar entregada' : t === 'En proceso' ? 'Iniciar proceso' : `Pasar a ${t.toLowerCase()}`)}</button>`).join('')}
          </div>` : ''}
        </div>
      </div>
      <dl class="datos border-y border-gray-200 py-4 mb-6">
        <div><dt>Fecha de la orden</dt><dd>${fechaHoraLarga(orden.fecha_orden)}</dd></div>
        <div><dt>Prioridad</dt><dd>${insignia(orden.prioridad)}</dd></div>
        <div><dt>Resultados</dt><dd>${completos} de ${total} exámenes</dd></div>
        ${orden.observaciones ? `<div class="col-span-full"><dt>Observaciones</dt><dd class="!font-normal">${esc(orden.observaciones)}</dd></div>` : ''}
      </dl>
      <div class="space-y-6">
        ${(orden.examenes ?? []).map((examen) => {
          const resultado = resultadoDe(examen.id_tipo_examen);
          return `
          <section class="tabla-marco">
            <div class="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-gray-200">
              <div>
                <h2 class="font-bold text-lg">${esc(examen.nombre)}</h2>
                <p class="text-sm text-gray-600">Muestra: ${o(examen.tipo_muestra)}</p>
              </div>
              ${resultado
                ? `<p class="text-sm text-gray-700 resultado-existe">Resultado del ${fechaLarga(resultado.fecha_resultado)}</p>`
                : puedeRegistrar && orden.estado !== 'Cancelada'
                  ? `<button type="button" data-registrar="${esc(examen.id_tipo_examen)}" class="btn btn-primario btn-chico">Registrar resultado</button>`
                  : '<span class="text-sm text-amber-800">Sin resultado</span>'}
            </div>
            ${resultado ? `
              <div class="px-4 py-3">
                <dl class="datos mb-3">
                  <div><dt>Resultado general</dt><dd>${o(resultado.resultado_general)}</dd></div>
                  <div><dt>Toma de muestra</dt><dd>${fechaLarga(resultado.fecha_toma_muestra)}</dd></div>
                </dl>
                ${(resultado.valores_detallados ?? []).length ? `
                  <table class="border-t border-gray-200">
                    <thead><tr>
                      <th class="px-3 py-1.5">Parámetro</th><th class="px-3 py-1.5 text-right">Valor</th>
                      <th class="px-3 py-1.5">Unidad</th><th class="px-3 py-1.5">Rango de referencia</th>
                    </tr></thead>
                    <tbody>
                      ${resultado.valores_detallados.map((v) => `
                        <tr>
                          <td class="px-3 py-2">${esc(v.parametro)}</td>
                          <td class="px-3 py-2 text-right font-bold">${esc(v.valor)}</td>
                          <td class="px-3 py-2 text-gray-700">${o(v.unidad)}</td>
                          <td class="px-3 py-2 text-gray-700">${o(v.rango_referencia)}</td>
                        </tr>`).join('')}
                    </tbody>
                  </table>` : ''}
                ${resultado.observaciones ? `<p class="mt-3 text-gray-700"><span class="font-bold">Observaciones:</span> ${esc(resultado.observaciones)}</p>` : ''}
              </div>` : ''}
          </section>`;
        }).join('')}
      </div>`;

    zona.querySelector('[data-volver]').addEventListener('click', cargarLista);

    zona.querySelectorAll('[data-transicion]').forEach((boton) => {
      boton.addEventListener('click', async () => {
        const destino = boton.dataset.transicion;
        if (!await confirmar(destino === 'Cancelada' ? 'La orden se cancelará y ya no admitirá resultados.' : `La orden pasará a "${destino}".`, { textoBoton: destino === 'Cancelada' ? 'Cancelar orden' : 'Cambiar estado', titulo: 'Estado de la orden', peligro: destino === 'Cancelada' })) return;
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
    const capa = abrirModal(`Resultado de ${examen.nombre}`, `
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label class="block">
            <span class="${ETIQUETA}">Fecha de toma de muestra</span>
            <input type="date" data-toma max="${hoy()}" class="${CAMPO_TEXTO}">
          </label>
          <label class="block">
            <span class="${ETIQUETA}">Fecha del resultado</span>
            <input type="date" data-resultado value="${hoy()}" max="${hoy()}" class="${CAMPO_TEXTO}">
          </label>
        </div>
        <label class="block">
          <span class="${ETIQUETA}">Resultado general</span>
          <textarea data-general rows="2" class="${CAMPO_TEXTO}"></textarea>
        </label>
        <div>
          <p class="${ETIQUETA}">Valores medidos</p>
          <p class="text-sm text-gray-600 mb-2">Cada examen tiene sus propios parámetros: añade los que correspondan.</p>
          <div data-valores></div>
          <button type="button" data-agregar-valor class="enlace">Añadir parámetro</button>
        </div>
        <label class="block">
          <span class="${ETIQUETA}">Observaciones</span>
          <textarea data-observaciones rows="2" class="${CAMPO_TEXTO}"></textarea>
        </label>
        <p class="text-sm text-gray-600">El resultado y el avance de la orden se guardan juntos.</p>
        ${pieModalHtml('Guardar resultado')}
      </div>`, { ampliada: true });

    const filaValorHtml = () => `
      <div class="fila-valor renglon grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input type="text" data-parametro maxlength="100" placeholder="Parámetro *" class="${CAMPO_TEXTO_CORTO}">
        <input type="text" data-valor maxlength="100" placeholder="Valor *" class="${CAMPO_TEXTO_CORTO}">
        <input type="text" data-unidad maxlength="30" placeholder="Unidad" class="${CAMPO_TEXTO_CORTO}">
        <div class="flex gap-1">
          <input type="text" data-rango maxlength="100" placeholder="Rango ref." class="${CAMPO_TEXTO_CORTO} flex-1">
          <button type="button" data-quitar-valor class="enlace-quitar px-1">Quitar</button>
        </div>
      </div>`;

    capa.querySelector('[data-valores]').insertAdjacentHTML('beforeend', filaValorHtml());
    capa.querySelector('[data-agregar-valor]').addEventListener('click', () => {
      capa.querySelector('[data-valores]').insertAdjacentHTML('beforeend', filaValorHtml());
      capa.querySelector('[data-valores]').lastElementChild.querySelector('input').focus();
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
      // Los marcados sobreviven al filtro: la lista se repinta, la selección no.
      const marcados = new Set();

      const capa = abrirModal('Nueva orden de laboratorio', `
        <div class="space-y-4" data-form-orden>
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
            <p class="${ETIQUETA}">Exámenes *</p>
            <input type="search" data-filtro-tipo placeholder="Filtrar por nombre" aria-label="Filtrar tipos de examen" class="${CAMPO_TEXTO} mb-2">
            <div data-lista-tipos class="border border-gray-300 rounded-md max-h-60 overflow-y-auto divide-y divide-gray-100"></div>
          </div>
          ${pieModalHtml('Crear orden')}
        </div>`, { alMontar: (capaModal) => {
          capaModal.querySelector('[data-zona-selector]').appendChild(selectorOrden.elemento);
          const lista = capaModal.querySelector('[data-lista-tipos]');
          const pintarTipos = (texto = '') => {
            const filtrados = tipos.filter((t) => t.nombre.toLowerCase().includes(texto.toLowerCase()));
            lista.innerHTML = filtrados.length === 0
              ? '<p class="text-sm text-gray-600">Sin coincidencias.</p>'
              : filtrados.map((t) => `
                <label class="flex items-start gap-3 px-3 py-2 hover:bg-blue-50 cursor-pointer">
                  <input type="checkbox" data-tipo-examen value="${esc(t.id_tipo_examen)}" ${marcados.has(String(t.id_tipo_examen)) ? 'checked' : ''} class="mt-1 accent-blue-600 w-4 h-4">
                  <span>${esc(t.nombre)}<span class="block text-sm text-gray-600">Muestra: ${o(t.tipo_muestra)}</span></span>
                </label>`).join('');
          };
          pintarTipos();
          lista.addEventListener('change', (e) => {
            const casilla = e.target.closest('[data-tipo-examen]');
            if (!casilla) return;
            if (casilla.checked) marcados.add(casilla.value); else marcados.delete(casilla.value);
          });
          capaModal.querySelector('[data-filtro-tipo]').addEventListener('input', (e) => pintarTipos(e.target.value.trim()));
        }, ampliada: true });

      capa.querySelector('[data-cancelar]').addEventListener('click', cerrarModal);
      capa.querySelector('[data-guardar]').addEventListener('click', async (evento) => {
        const idPaciente = selectorOrden.valor();
        if (!idPaciente) { avisar('Elige el paciente de la orden.', 'advertencia'); return; }
        const examenes = [...marcados].map((id) => ({ id_tipo_examen: id }));
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
