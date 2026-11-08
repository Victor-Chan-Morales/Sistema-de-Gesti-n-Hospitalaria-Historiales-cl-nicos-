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
    <h1 class="text-xl font-semibold text-gray-800 mb-4">Seguimiento pediátrico</h1>
    <div class="bg-white border border-gray-200 rounded-lg p-4 mb-4" data-espacio-selector></div>
    <div data-zona-pediatria></div>`;

  const pintar = () => {
    const zona = contenedor.querySelector('[data-zona-pediatria]');
    if (!estado.paciente) {
      zona.innerHTML = '<p class="text-sm text-gray-500 py-6 text-center">Busca y elige un paciente para ver su seguimiento.</p>';
      return;
    }

    const esMenor = esMenorDeEdad(estado.paciente.fecha_nacimiento);
    zona.innerHTML = `
      <div class="flex items-center justify-between gap-2 flex-wrap mb-4">
        <div class="flex gap-1 border-b border-gray-200">
          <button type="button" data-pestana="controles" class="px-4 py-2 text-sm font-medium ${estado.pestana === 'controles' ? 'text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}">Controles de crecimiento</button>
          <button type="button" data-pestana="vacunas" class="px-4 py-2 text-sm font-medium ${estado.pestana === 'vacunas' ? 'text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}">Registro de vacunación</button>
        </div>
        ${puedeRegistrar && esMenor ? `
          <button type="button" data-registrar-control class="hidden bg-blue-600 text-white text-sm rounded px-4 py-2 hover:bg-blue-700">Registrar control</button>
          <button type="button" data-registrar-dosis class="hidden bg-blue-600 text-white text-sm rounded px-4 py-2 hover:bg-blue-700">Registrar dosis</button>` : ''}
      </div>
      ${esMenor ? '' : bannerHtml('El paciente tiene 18 años o más: el seguimiento pediátrico solo aplica a menores.', 'advertencia')}
      <div data-tabla></div>`;

    const tabla = zona.querySelector('[data-tabla]');
    if (estado.pestana === 'controles') {
      zona.querySelector('[data-registrar-control]')?.classList.remove('hidden');
      tabla.innerHTML = estado.controles.length === 0
        ? '<div class="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-400 text-sm">Sin controles de crecimiento registrados.</div>'
        : `<div class="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="text-left text-xs uppercase text-gray-500 border-b bg-gray-50">
                <th class="px-3 py-2">Fecha</th><th class="px-3 py-2">Peso (kg)</th><th class="px-3 py-2">Talla (cm)</th>
                <th class="px-3 py-2">Perímetro cefálico (cm)</th><th class="px-3 py-2">IMC</th><th class="px-3 py-2">Observaciones</th>
              </tr></thead>
              <tbody>
                ${estado.controles.map((c) => `
                  <tr class="border-b last:border-0">
                    <td class="px-3 py-2 whitespace-nowrap">${fechaLarga(c.fecha_control)}</td>
                    <td class="px-3 py-2">${o(c.peso)}</td>
                    <td class="px-3 py-2">${o(c.talla)}</td>
                    <td class="px-3 py-2">${o(c.perimetro_cefalico)}</td>
                    <td class="px-3 py-2 font-medium text-gray-800">${o(c.indice_masa_corporal)}</td>
                    <td class="px-3 py-2">${o(c.observaciones)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
    } else {
      zona.querySelector('[data-registrar-dosis]')?.classList.remove('hidden');
      tabla.innerHTML = estado.vacunas.length === 0
        ? '<div class="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-400 text-sm">Sin dosis registradas.</div>'
        : `<div class="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="text-left text-xs uppercase text-gray-500 border-b bg-gray-50">
                <th class="px-3 py-2">Vacuna</th><th class="px-3 py-2">Dosis</th><th class="px-3 py-2">Aplicación</th>
                <th class="px-3 py-2">Lote</th><th class="px-3 py-2">Centro</th><th class="px-3 py-2">Próxima dosis</th>
              </tr></thead>
              <tbody>
                ${estado.vacunas.map((v) => `
                  <tr class="border-b last:border-0">
                    <td class="px-3 py-2 font-medium text-gray-800">${esc(v.nombre_vacuna)}</td>
                    <td class="px-3 py-2">${esc(v.numero_dosis)}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${fechaLarga(v.fecha_aplicacion)}</td>
                    <td class="px-3 py-2">${o(v.lote)}</td>
                    <td class="px-3 py-2">${o(v.centro_aplicacion)}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${v.proxima_dosis ? fechaLarga(v.proxima_dosis) : '—'}</td>
                  </tr>`).join('')}
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
      pintar();
      return;
    }
    const zona = contenedor.querySelector('[data-zona-pediatria]');
    zona.innerHTML = '<p class="text-sm text-gray-500 py-6 text-center">Cargando seguimiento...</p>';
    try {
      const [controles, vacunas] = await Promise.all([
        api.obtener(`/api/pediatria/pacientes/${encodeURIComponent(paciente.id_paciente)}/controles`),
        api.obtener(`/api/pediatria/pacientes/${encodeURIComponent(paciente.id_paciente)}/vacunas`),
      ]);
      estado.controles = controles;
      estado.vacunas = vacunas;
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
    <div class="space-y-3">
      <label class="block">
        <span class="${ETIQUETA}">Fecha del control</span>
        <input type="date" data-fecha value="${hoy()}" class="${CAMPO_TEXTO}">
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
      <p class="text-xs text-gray-500">Si dejas el IMC vacío, se calcula con el peso y la talla.</p>
      <label class="block">
        <span class="${ETIQUETA}">Observaciones</span>
        <textarea data-observaciones rows="2" class="${CAMPO_TEXTO}"></textarea>
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" data-cancelar class="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="button" data-guardar class="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Guardar control</button>
      </div>
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
    <div class="space-y-3">
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
          <input type="date" data-aplicacion value="${hoy()}" class="${CAMPO_TEXTO}">
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
        <input type="date" data-proxima class="${CAMPO_TEXTO}">
      </label>
      <label class="block">
        <span class="${ETIQUETA}">Observaciones</span>
        <textarea data-observaciones rows="2" class="${CAMPO_TEXTO}"></textarea>
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" data-cancelar class="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="button" data-guardar class="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Guardar dosis</button>
      </div>
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
