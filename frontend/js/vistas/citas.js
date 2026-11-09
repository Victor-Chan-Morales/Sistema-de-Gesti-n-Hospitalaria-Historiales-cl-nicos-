// Vista de citas: lista con filtros, programación, reprogramación y estados.
// Un paciente archivado o inactivo no recibe citas nuevas (422 del backend).

REGISTRO_VISTAS.citas = {
  titulo: 'Citas',
  permiso: PERMISOS.GESTIONAR_PACIENTES_Y_CITAS,
  alMontar: vistaCitas,
};

const ESTADOS_CITA = ['Programada', 'Atendida', 'Cancelada', 'No Asistió'];

async function vistaCitas(contenedor, params) {
  const usuario = obtenerSesion().usuario;
  const puedeRegistrar = tienePermiso(usuario.rol, PERMISOS.REGISTRAR_DATOS_CLINICOS);
  const filtros = { paciente: null, estado: '', profesional: '', desde: '', hasta: '' };

  contenedor.innerHTML = `
    ${encabezadoHtml('Agenda de citas', {
      descripcion: 'Citas por día. Solo las programadas se pueden reprogramar, cancelar o atender.',
      acciones: '<button type="button" data-programar class="btn btn-primario">Programar cita</button>',
    })}
    <div class="filtros grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 !items-end">
      <div data-espacio-paciente class="sm:col-span-2"></div>
      <label class="block">
        <span class="${ETIQUETA}">Estado</span>
        <select data-estado class="${CAMPO_TEXTO}">
          <option value="">Todos</option>
          ${ESTADOS_CITA.map((e) => `<option>${e}</option>`).join('')}
        </select>
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Profesional</span>
        <select data-profesional class="${CAMPO_TEXTO}"><option value="">Todos</option></select>
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Desde</span>
        <input type="datetime-local" data-desde class="${CAMPO_TEXTO}">
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Hasta</span>
        <input type="datetime-local" data-hasta class="${CAMPO_TEXTO}">
      </label>
      <div class="flex items-end gap-2 sm:col-span-2">
        <button type="button" data-aplicar class="btn btn-secundario">Filtrar</button>
        <button type="button" data-limpiar class="enlace px-2 py-2">Quitar filtros</button>
      </div>
    </div>
    <div id="tabla-citas"></div>`;

  let pacienteParam = null;
  if (params.get('paciente')) {
    pacienteParam = await api.obtener(`/api/pacientes/${encodeURIComponent(params.get('paciente'))}`);
    filtros.paciente = pacienteParam.id_paciente;
  }
  const selector = crearSelectorPaciente({
    etiqueta: 'Paciente',
    alElegir: (paciente) => { filtros.paciente = paciente?.id_paciente ?? null; },
    pacienteInicial: pacienteParam,
  });
  contenedor.querySelector('[data-espacio-paciente]').appendChild(selector.elemento);

  try {
    const profesionales = await api.obtener('/api/catalogos/profesionales');
    contenedor.querySelector('[data-profesional]').innerHTML = `<option value="">Todos</option>${opcionesSelect(profesionales, (p) => p.id_usuario, (p) => `${p.nombres} ${p.apellidos} (${p.rol})`)}`;
    filtros.listaProfesionales = profesionales;
  } catch { /* el filtro de profesional queda vacío: no rompe la vista */ }

  const cargar = async () => {
    const zona = contenedor.querySelector('#tabla-citas');
    zona.innerHTML = cargandoHtml('Cargando agenda...');
    try {
      const consulta = construirConsulta({
        id_paciente: filtros.paciente,
        id_usuario_profesional: filtros.profesional,
        estado: filtros.estado,
        desde: filtros.desde ? aFechaHora(filtros.desde) : '',
        hasta: filtros.hasta ? aFechaHora(filtros.hasta) : '',
      });
      const [citas, nombres] = await Promise.all([
        api.obtener(`/api/citas?${consulta}`),
        nombresDePacientes(),
      ]);

      if (!citas.length) {
        zona.innerHTML = `<div class="tabla-marco">${vacioHtml('No hay citas con estos filtros', ' Quita algún filtro o programa una cita nueva.')}</div>`;
        return;
      }

      // Agenda: un bloque por día, en orden cronológico.
      const porDia = new Map();
      [...citas].sort((x, y) => String(x.fecha_hora).localeCompare(String(y.fecha_hora))).forEach((cita) => {
        const dia = String(cita.fecha_hora).slice(0, 10);
        if (!porDia.has(dia)) porDia.set(dia, []);
        porDia.get(dia).push(cita);
      });
      const diaHoy = hoy();

      zona.innerHTML = `
        <div class="tabla-marco">
          <table>
            <thead>
              <tr>
                <th class="px-4 py-2 w-20">Hora</th>
                <th class="px-3 py-2">Paciente</th>
                <th class="px-3 py-2">Profesional</th>
                <th class="px-3 py-2">Motivo</th>
                <th class="px-3 py-2">Estado</th>
                <th class="px-3 py-2"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            ${[...porDia].map(([dia, delDia]) => `
            <tbody>
              <tr class="!bg-gray-50">
                <th colspan="6" scope="colgroup" class="px-4 py-2 text-left font-bold text-gray-800 first-letter:uppercase border-y border-gray-200">
                  ${esc(fechaDia(dia))}${dia === diaHoy ? ' <span class="ml-2 text-sm text-blue-700">Hoy</span>' : ''}
                  <span class="ml-2 text-sm font-normal text-gray-500">${delDia.length} ${delDia.length === 1 ? 'cita' : 'citas'}</span>
                </th>
              </tr>
              ${delDia.map((cita) => `
                <tr data-id="${esc(cita.id_cita)}" class="${cita.estado === 'Cancelada' ? 'text-gray-500' : ''}">
                  <td class="px-4 py-2.5 text-lg font-bold whitespace-nowrap">${esc(String(cita.fecha_hora).slice(11, 16))}</td>
                  <td class="px-3 py-2.5 font-bold">${esc(nombreDePaciente(nombres, cita.id_paciente))}</td>
                  <td class="px-3 py-2.5" data-profesional="${esc(cita.id_usuario_profesional)}"></td>
                  <td class="px-3 py-2.5">${o(cita.motivo_consulta)}${cita.observaciones ? `<span class="block text-sm text-gray-500 max-w-xs truncate" title="${esc(cita.observaciones)}">${esc(cita.observaciones)}</span>` : ''}</td>
                  <td class="px-3 py-2.5">${insignia(cita.estado)}</td>
                  <td class="px-3 py-2.5 text-right whitespace-nowrap space-x-3"></td>
                </tr>`).join('')}
            </tbody>`).join('')}
          </table>
        </div>`;

      // Nombres de profesional en cada fila.
      zona.querySelectorAll('[data-profesional]').forEach((celda) => {
        if (filtros.listaProfesionales?.length) {
          const profesional = filtros.listaProfesionales.find((p) => String(p.id_usuario) === celda.dataset.profesional);
          celda.textContent = profesional ? `${profesional.nombres} ${profesional.apellidos}` : o(celda.dataset.profesional);
        } else {
          celda.textContent = o(celda.dataset.profesional);
        }
      });

      zona.querySelectorAll('tbody tr[data-id]').forEach((fila) => {
        const id = fila.dataset.id;
        const cita = citas.find((c) => String(c.id_cita) === id);
        const acciones = fila.querySelector('td:last-child');
        if (cita.estado !== 'Programada') return;
        acciones.innerHTML = `
          ${puedeRegistrar ? `<a href="#/consultas?paciente=${encodeURIComponent(cita.id_paciente)}&cita=${encodeURIComponent(cita.id_cita)}" class="btn btn-primario btn-chico">Atender</a>` : ''}
          <button type="button" data-reprogramar class="enlace">Reprogramar</button>
          <button type="button" data-no-asistio class="enlace !text-amber-800">No asistió</button>
          <button type="button" data-cancelar class="enlace-quitar">Cancelar</button>`;

        acciones.querySelector('[data-reprogramar]').addEventListener('click', () => modalReprogramar(cita, cargar));
        acciones.querySelector('[data-no-asistio]').addEventListener('click', async (e) => {
          if (!await confirmar('La cita quedará registrada como No Asistió y ya no se podrá modificar.', { textoBoton: 'Marcar no asistió', titulo: 'Paciente no asistió' })) return;
          try {
            await conCarga(e.currentTarget, async () => {
              await api.actualizar(`/api/citas/${encodeURIComponent(id)}`, { estado: 'No Asistió' });
              avisar('Cita marcada como No Asistió.');
            });
            await cargar();
          } catch (error) { avisar(error.message, 'error'); }
        });
        acciones.querySelector('[data-cancelar]').addEventListener('click', async (e) => {
          if (!await confirmar('La cita se cancelará y el horario quedará libre. Esta acción no se puede deshacer.', { textoBoton: 'Cancelar cita', titulo: 'Cancelar cita', peligro: true })) return;
          try {
            await conCarga(e.currentTarget, async () => {
              await api.actualizar(`/api/citas/${encodeURIComponent(id)}`, { estado: 'Cancelada' });
              avisar('Cita cancelada.');
            });
            await cargar();
          } catch (error) { avisar(error.message, 'error'); }
        });
      });
    } catch (error) {
      zona.innerHTML = bannerErrorHtml(error);
    }
  };

  contenedor.querySelector('[data-aplicar]').addEventListener('click', async (evento) => {
    filtros.estado = contenedor.querySelector('[data-estado]').value;
    filtros.profesional = contenedor.querySelector('[data-profesional]').value;
    filtros.desde = contenedor.querySelector('[data-desde]').value;
    filtros.hasta = contenedor.querySelector('[data-hasta]').value;
    await conCarga(evento.currentTarget, cargar);
  });

  contenedor.querySelector('[data-limpiar]').addEventListener('click', async () => {
    filtros.paciente = null;
    filtros.estado = '';
    filtros.profesional = '';
    filtros.desde = '';
    filtros.hasta = '';
    selector.limpiar();
    contenedor.querySelector('[data-estado]').value = '';
    contenedor.querySelector('[data-profesional]').value = '';
    contenedor.querySelector('[data-desde]').value = '';
    contenedor.querySelector('[data-hasta]').value = '';
    await cargar();
  });

  contenedor.querySelector('[data-programar]').addEventListener('click', () => {
    modalProgramarCita(contenedor, filtros.listaProfesionales ?? [], cargar);
  });

  await cargar();
}

// La fecha y hora se envían en el formato del contrato: YYYY-MM-DDTHH:MM:SS.
const valorFechaHora = (zona, nombre) => {
  const valor = zona.querySelector(`[data-${nombre}]`).value;
  return valor ? aFechaHora(valor) : null;
};

function modalProgramarCita(contenedor, profesionales, alGuardar) {
  const selector = crearSelectorPaciente({ etiqueta: 'Paciente *', soloActivos: false });
  const inicial = new Date(Date.now() + 60 * 60 * 1000);
  const sugerida = aValorDateTimeLocal(inicial);

  const capa = abrirModal('Programar cita', `
    <div class="space-y-4">
      <div data-zona-selector></div>
      <label class="block">
        <span class="${ETIQUETA}">Profesional *</span>
        <select data-profesional required class="${CAMPO_TEXTO}">
          ${opcionesSelect(profesionales, (p) => p.id_usuario, (p) => `${p.nombres} ${p.apellidos} (${p.rol})`)}
        </select>
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Fecha y hora *</span>
        <input type="datetime-local" data-fecha required value="${sugerida}" class="${CAMPO_TEXTO}">
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Motivo de consulta</span>
        <input type="text" data-motivo maxlength="255" class="${CAMPO_TEXTO}">
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Observaciones</span>
        <textarea data-observaciones rows="2" class="${CAMPO_TEXTO}"></textarea>
      </label>
      ${pieModalHtml('Programar cita')}
    </div>`, { alMontar: (capaModal) => {
      capaModal.querySelector('[data-zona-selector]').appendChild(selector.elemento);
    } });

  capa.querySelector('[data-cancelar]').addEventListener('click', cerrarModal);
  capa.querySelector('[data-guardar]').addEventListener('click', async (evento) => {
    const idPaciente = selector.valor();
    if (!idPaciente) { avisar('Elige el paciente de la cita.', 'advertencia'); return; }
    if (!valorFechaHora(capa, 'fecha')) { avisar('Indica la fecha y hora.', 'advertencia'); return; }

    const cuerpo = {
      id_paciente: idPaciente,
      id_usuario_profesional: capa.querySelector('[data-profesional]').value,
      fecha_hora: valorFechaHora(capa, 'fecha'),
    };
    const motivo = capa.querySelector('[data-motivo]').value.trim();
    if (motivo) cuerpo.motivo_consulta = motivo;
    const observaciones = capa.querySelector('[data-observaciones]').value.trim();
    if (observaciones) cuerpo.observaciones = observaciones;

    try {
      await conCarga(evento.currentTarget, async () => {
        await api.crear('/api/citas', cuerpo);
        cerrarModal();
        avisar('Cita programada.');
      });
      await alGuardar();
    } catch (error) {
      avisar(error.message, 'error');
    }
  });
}

function modalReprogramar(cita, alGuardar) {
  const capa = abrirModal('Reprogramar cita', `
    <div class="space-y-4">
      <p class="text-gray-700">Programada para el <strong>${fechaHoraLarga(cita.fecha_hora)}</strong>.</p>
      <label class="block">
        <span class="${ETIQUETA}">Nueva fecha y hora</span>
        <input type="datetime-local" data-fecha value="${esc(String(cita.fecha_hora).slice(0, 16))}" class="${CAMPO_TEXTO}">
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Motivo de consulta</span>
        <input type="text" data-motivo maxlength="255" value="${esc(cita.motivo_consulta ?? '')}" class="${CAMPO_TEXTO}">
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Observaciones</span>
        <textarea data-observaciones rows="2" class="${CAMPO_TEXTO}">${esc(cita.observaciones ?? '')}</textarea>
      </label>
      ${pieModalHtml('Guardar cambios')}
    </div>`);

  capa.querySelector('[data-cancelar]').addEventListener('click', cerrarModal);
  capa.querySelector('[data-guardar]').addEventListener('click', async (evento) => {
    const cuerpo = {};
    const fecha = valorFechaHora(capa, 'fecha');
    if (fecha && fecha !== cita.fecha_hora) cuerpo.fecha_hora = fecha;
    const motivo = capa.querySelector('[data-motivo]').value.trim();
    if (motivo && motivo !== (cita.motivo_consulta ?? '')) cuerpo.motivo_consulta = motivo;
    const observaciones = capa.querySelector('[data-observaciones]').value.trim();
    if (observaciones && observaciones !== (cita.observaciones ?? '')) cuerpo.observaciones = observaciones;

    if (Object.keys(cuerpo).length === 0) { cerrarModal(); return; }

    try {
      await conCarga(evento.currentTarget, async () => {
        await api.actualizar(`/api/citas/${encodeURIComponent(cita.id_cita)}`, cuerpo);
        cerrarModal();
        avisar('Cita reprogramada.');
      });
      await alGuardar();
    } catch (error) {
      avisar(error.message, 'error');
    }
  });
}
