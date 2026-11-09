// Vista propia del Centro Médico Pediátrico (institución 4, Firebase): controles
// de crecimiento y registro de vacunación. El paciente debe ser menor de 18 años.

REGISTRO_VISTAS.pediatria = {
  titulo: 'Pediátrico',
  permiso: PERMISOS.VER_HISTORIAL_CLINICO,
  soloInstitucion: esPediatrico,
  alMontar: vistaPediatria,
};

async function vistaPediatria(contenedor, params) {
  const usuario = obtenerSesion().usuario;
  const puedeRegistrar = tienePermiso(usuario.rol, PERMISOS.REGISTRAR_DATOS_CLINICOS);
  const estado = { paciente: null, controles: [], vacunas: [], pestana: 'controles', catalogoVacunas: [] };

  contenedor.innerHTML = `
    ${encabezadoHtml('Seguimiento pediátrico', { descripcion: 'Controles de crecimiento y esquema de vacunación de pacientes menores de 18 años.' })}
    <div class="max-w-2xl mb-6" data-espacio-selector></div>
    <div data-zona-pediatria></div>`;

  // Diferencia con el control anterior, con signo: "+0.40".
  const variacion = (actual, previo) => {
    if (actual == null || previo == null) return '';
    const d = Number(actual) - Number(previo);
    return ` <span class="text-sm font-normal text-gray-600">(${d >= 0 ? '+' : ''}${d.toFixed(2)})</span>`;
  };

  const pintar = () => {
    const zona = contenedor.querySelector('[data-zona-pediatria]');
    if (!estado.paciente) {
      zona.innerHTML = vacioHtml('Elige un paciente', ' Búscalo por nombre o documento para ver su seguimiento.');
      return;
    }

    const esMenor = esMenorDeEdad(estado.paciente.fecha_nacimiento);
    const puedeAnotar = puedeRegistrar && esMenor && estado.paciente.estado === 'Activo';
    const enControles = estado.pestana === 'controles';
    const ordenados = [...estado.controles].sort((x, y) => String(y.fecha_control).localeCompare(String(x.fecha_control)));
    const [ultimo, anterior] = ordenados;
    const diaHoy = hoy();

    zona.innerHTML = `
      ${fichaPacienteHtml(estado.paciente, { alergias: estado.alergias })}
      ${esMenor ? '' : `<div class="mb-5">${bannerHtml('El paciente tiene 18 años o más: el seguimiento pediátrico solo aplica a menores.', 'advertencia')}</div>`}
      <div class="flex items-end justify-between gap-3 flex-wrap border-b border-gray-200 mb-5">
        <div class="pestanas !border-0 !mb-0" role="tablist">
          <button type="button" role="tab" data-pestana="controles" aria-selected="${enControles}" class="pestana">Controles de crecimiento <span class="font-normal">(${estado.controles.length})</span></button>
          <button type="button" role="tab" data-pestana="vacunas" aria-selected="${!enControles}" class="pestana">Vacunación <span class="font-normal">(${estado.vacunas.length})</span></button>
        </div>
        ${puedeAnotar ? `<div class="pb-2">${enControles
          ? '<button type="button" data-registrar-control class="btn btn-primario">Registrar control</button>'
          : '<button type="button" data-registrar-dosis class="btn btn-primario">Registrar dosis</button>'}</div>` : ''}
      </div>
      <div data-tabla role="tabpanel"></div>`;

    const tabla = zona.querySelector('[data-tabla]');
    if (enControles) {
      tabla.innerHTML = estado.controles.length === 0
        ? `<div class="tabla-marco">${vacioHtml('Sin controles de crecimiento', puedeAnotar ? ' Registra el primero con "Registrar control".' : '')}</div>`
        : `<dl class="datos mb-5">
            <div><dt>Último control</dt><dd>${fechaLarga(ultimo.fecha_control)}</dd></div>
            <div><dt>Peso (kg)</dt><dd>${o(ultimo.peso)}${variacion(ultimo.peso, anterior?.peso)}</dd></div>
            <div><dt>Talla (cm)</dt><dd>${o(ultimo.talla)}${variacion(ultimo.talla, anterior?.talla)}</dd></div>
            <div><dt>IMC</dt><dd>${o(ultimo.indice_masa_corporal)}</dd></div>
          </dl>
          <div class="tabla-marco">
            <table>
              <thead><tr>
                <th class="px-4 py-2">Fecha</th><th class="px-3 py-2 text-right">Peso (kg)</th><th class="px-3 py-2 text-right">Talla (cm)</th>
                <th class="px-3 py-2 text-right">Perímetro cefálico (cm)</th><th class="px-3 py-2 text-right">IMC</th><th class="px-3 py-2">Observaciones</th>
              </tr></thead>
              <tbody>
                ${ordenados.map((c) => `
                  <tr>
                    <td class="px-4 py-2.5 whitespace-nowrap">${fechaLarga(c.fecha_control)}</td>
                    <td class="px-3 py-2.5 text-right">${o(c.peso)}</td>
                    <td class="px-3 py-2.5 text-right">${o(c.talla)}</td>
                    <td class="px-3 py-2.5 text-right">${o(c.perimetro_cefalico)}</td>
                    <td class="px-3 py-2.5 text-right font-bold">${o(c.indice_masa_corporal)}</td>
                    <td class="px-3 py-2.5 text-gray-700">${o(c.observaciones)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
    } else {
      tabla.innerHTML = estado.vacunas.length === 0
        ? `<div class="tabla-marco">${vacioHtml('Sin dosis registradas', puedeAnotar ? ' Registra la primera con "Registrar dosis".' : '')}</div>`
        : `<div class="tabla-marco">
            <table>
              <thead><tr>
                <th class="px-4 py-2">Vacuna</th><th class="px-3 py-2">Dosis</th><th class="px-3 py-2">Aplicada</th>
                <th class="px-3 py-2">Lote</th><th class="px-3 py-2">Centro</th><th class="px-3 py-2">Próxima dosis</th>
              </tr></thead>
              <tbody>
                ${estado.vacunas.map((v) => {
                  const vencida = v.proxima_dosis && String(v.proxima_dosis) < diaHoy;
                  return `
                  <tr>
                    <td class="px-4 py-2.5 font-bold">${esc(v.nombre_vacuna)}</td>
                    <td class="px-3 py-2.5">${esc(v.numero_dosis)}</td>
                    <td class="px-3 py-2.5 whitespace-nowrap">${fechaLarga(v.fecha_aplicacion)}</td>
                    <td class="px-3 py-2.5 text-gray-700">${o(v.lote)}</td>
                    <td class="px-3 py-2.5 text-gray-700">${o(v.centro_aplicacion)}</td>
                    <td class="px-3 py-2.5 whitespace-nowrap ${vencida ? 'text-red-700 font-bold' : ''}">${v.proxima_dosis ? `${fechaLarga(v.proxima_dosis)}${vencida ? ' (vencida)' : ''}` : '—'}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`;
    }

    zona.querySelectorAll('[data-pestana]').forEach((boton) => {
      boton.addEventListener('click', () => {
        estado.pestana = boton.dataset.pestana;
        pintar();
      });
    });
    zona.querySelector('[data-registrar-control]')?.addEventListener('click', () => modalRegistrarControl(estado, cargar));
    zona.querySelector('[data-registrar-dosis]')?.addEventListener('click', () => modalRegistrarDosis(estado, cargar));
  };

  const cargar = async (paciente) => {
    estado.paciente = paciente;
    if (!paciente) {
      estado.controles = [];
      estado.vacunas = [];
      estado.alergias = undefined;
      pintar();
      return;
    }
    const zona = contenedor.querySelector('[data-zona-pediatria]');
    zona.innerHTML = cargandoHtml('Cargando seguimiento...');
    try {
      const [controles, vacunas, alergias] = await Promise.all([
        api.obtener(`/api/pediatria/pacientes/${encodeURIComponent(paciente.id_paciente)}/controles`),
        api.obtener(`/api/pediatria/pacientes/${encodeURIComponent(paciente.id_paciente)}/vacunas`),
        api.obtener(`/api/pacientes/${encodeURIComponent(paciente.id_paciente)}/historial`).then((h) => h.alergias ?? []).catch(() => undefined),
      ]);
      estado.controles = controles;
      estado.vacunas = vacunas;
      estado.alergias = alergias;
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

  if (pacienteParam) await cargar(pacienteParam);
  else pintar();
}

function modalRegistrarControl(estado, alRecargar) {
  const capa = abrirModal('Registrar control de crecimiento', `
    <div class="space-y-4">
      <label class="block">
        <span class="${ETIQUETA}">Fecha del control</span>
        <input type="date" data-fecha value="${hoy()}" max="${hoy()}" class="${CAMPO_TEXTO}">
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="${ETIQUETA}">Peso (kg)</span>
          <input type="number" step="0.01" min="0" data-peso class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Talla (cm)</span>
          <input type="number" step="0.1" min="0" data-talla class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Perímetro cefálico (cm)</span>
          <input type="number" step="0.1" min="0" data-perimetro class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Índice de masa corporal</span>
          <input type="number" step="0.01" min="0" data-imc class="${CAMPO_TEXTO}">
        </label>
      </div>
      <p class="text-sm text-gray-600">Si dejas el IMC vacío, se calcula con el peso y la talla.</p>
      <label class="block">
        <span class="${ETIQUETA}">Observaciones</span>
        <textarea data-observaciones rows="2" class="${CAMPO_TEXTO}"></textarea>
      </label>
      ${pieModalHtml('Guardar control')}
    </div>`);

  capa.querySelector('[data-cancelar]').addEventListener('click', cerrarModal);
  capa.querySelector('[data-guardar]').addEventListener('click', async (evento) => {
    const cuerpo = {};
    const fecha = capa.querySelector('[data-fecha]').value;
    if (fecha && fecha !== hoy()) cuerpo.fecha_control = fecha;
    const numero = (selector) => {
      const valor = capa.querySelector(selector).value;
      return valor === '' ? null : Number(valor);
    };
    if (numero('[data-peso]') !== null) cuerpo.peso = numero('[data-peso]');
    if (numero('[data-talla]') !== null) cuerpo.talla = numero('[data-talla]');
    if (numero('[data-perimetro]') !== null) cuerpo.perimetro_cefalico = numero('[data-perimetro]');
    if (numero('[data-imc]') !== null) cuerpo.indice_masa_corporal = numero('[data-imc]');
    const observaciones = capa.querySelector('[data-observaciones]').value.trim();
    if (observaciones) cuerpo.observaciones = observaciones;

    try {
      await conCarga(evento.currentTarget, async () => {
        await api.crear(`/api/pediatria/pacientes/${encodeURIComponent(estado.paciente.id_paciente)}/controles`, cuerpo);
        cerrarModal();
        avisar('Control de crecimiento registrado.');
        await alRecargar(estado.paciente);
      });
    } catch (error) {
      avisar(error.message, 'error');
    }
  });
}

async function modalRegistrarDosis(estado, alRecargar) {
  const vacunas = await api.obtener('/api/pediatria/vacunas');
  const capa = abrirModal('Registrar dosis de vacuna', `
    <div class="space-y-4">
      <label class="block">
        <span class="${ETIQUETA}">Vacuna *</span>
        <select data-vacuna required class="${CAMPO_TEXTO}">
          ${opcionesSelect(vacunas, (v) => v.id_vacuna, (v) => v.nombre)}
        </select>
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="${ETIQUETA}">Dosis *</span>
          <input type="text" data-dosis required maxlength="30" placeholder="Primera, Segunda..." class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Fecha de aplicación</span>
          <input type="date" data-aplicacion value="${hoy()}" max="${hoy()}" class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Lote</span>
          <input type="text" data-lote maxlength="50" class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Centro de aplicación</span>
          <input type="text" data-centro maxlength="100" class="${CAMPO_TEXTO}">
        </label>
      </div>
      <label class="block">
        <span class="${ETIQUETA}">Próxima dosis</span>
        <input type="date" data-proxima min="${hoy()}" class="${CAMPO_TEXTO}">
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Observaciones</span>
        <textarea data-observaciones rows="2" class="${CAMPO_TEXTO}"></textarea>
      </label>
      ${pieModalHtml('Guardar dosis')}
    </div>`);

  capa.querySelector('[data-cancelar]').addEventListener('click', cerrarModal);
  capa.querySelector('[data-guardar]').addEventListener('click', async (evento) => {
    const dosis = capa.querySelector('[data-dosis]').value.trim();
    if (!dosis) { avisar('Indica el número de dosis (Primera, Segunda...).', 'advertencia'); return; }

    const cuerpo = { id_vacuna: capa.querySelector('[data-vacuna]').value, numero_dosis: dosis };
    const aplicacion = capa.querySelector('[data-aplicacion]').value;
    if (aplicacion && aplicacion !== hoy()) cuerpo.fecha_aplicacion = aplicacion;
    const lote = capa.querySelector('[data-lote]').value.trim();
    if (lote) cuerpo.lote = lote;
    const centro = capa.querySelector('[data-centro]').value.trim();
    if (centro) cuerpo.centro_aplicacion = centro;
    const proxima = capa.querySelector('[data-proxima]').value;
    if (proxima) cuerpo.proxima_dosis = proxima;
    const observaciones = capa.querySelector('[data-observaciones]').value.trim();
    if (observaciones) cuerpo.observaciones = observaciones;

    try {
      await conCarga(evento.currentTarget, async () => {
        await api.crear(`/api/pediatria/pacientes/${encodeURIComponent(estado.paciente.id_paciente)}/vacunas`, cuerpo);
        cerrarModal();
        avisar('Dosis registrada.');
        await alRecargar(estado.paciente);
      });
    } catch (error) {
      avisar(error.message, 'error');
    }
  });
}
