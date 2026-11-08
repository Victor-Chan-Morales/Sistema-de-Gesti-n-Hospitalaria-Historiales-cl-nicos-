// Vista de pacientes: búsqueda paginada, registro con historial, edición y baja.
// Un menor de edad exige al menos un representante (lo valida el backend).

REGISTRO_VISTAS.pacientes = {
  titulo: 'Pacientes',
  permiso: PERMISOS.GESTIONAR_PACIENTES_Y_CITAS,
  alMontar: vistaPacientes,
};

async function vistaPacientes(contenedor, params) {
  if (params.get('id')) return detallePaciente(contenedor, params.get('id'));
  if (params.get('nuevo') === '1') return formularioPaciente(contenedor, null);
  return listaPacientes(contenedor);
}

// ----- Listado con búsqueda y paginación -----

async function listaPacientes(contenedor) {
  const estado = { texto: '', estadoPaciente: '', desplazamiento: 0, total: 0 };
  const LIMITE = 20;

  contenedor.innerHTML = `
    <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
      <h1 class="text-xl font-semibold text-gray-800">Pacientes</h1>
      <a href="#/pacientes?nuevo=1" class="bg-blue-600 text-white text-sm rounded px-4 py-2 hover:bg-blue-700">Nuevo paciente</a>
    </div>
    <form data-busqueda class="flex gap-2 flex-wrap mb-4">
      <input type="search" data-texto placeholder="Nombre, apellido o documento" class="${CAMPO_TEXTO} flex-1 min-w-52">
      <select data-estado class="${CAMPO_TEXTO} w-44">
        <option value="">Todos los estados</option>
        <option>Activo</option>
        <option>Archivado</option>
        <option>Inactivo</option>
      </select>
      <button type="submit" class="bg-gray-800 text-white text-sm rounded px-4 py-2 hover:bg-gray-900">Buscar</button>
    </form>
    <div id="tabla-pacientes"></div>`;

  const pintar = async () => {
    const zona = contenedor.querySelector('#tabla-pacientes');
    try {
      const consulta = construirConsulta({
        texto: estado.texto,
        estado: estado.estadoPaciente,
        limite: LIMITE,
        desplazamiento: estado.desplazamiento,
      });
      const respuesta = await api.obtener(`/api/pacientes?${consulta}`);
      estado.total = respuesta.total;
      const pagina = respuesta.elementos;

      zona.innerHTML = `
        <div class="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs uppercase text-gray-500 border-b bg-gray-50">
                <th class="px-3 py-2">Historial</th>
                <th class="px-3 py-2">Paciente</th>
                <th class="px-3 py-2">Documento</th>
                <th class="px-3 py-2">Nacimiento</th>
                <th class="px-3 py-2">Edad</th>
                <th class="px-3 py-2">Sexo</th>
                <th class="px-3 py-2">Estado</th>
                <th class="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              ${pagina.length === 0
                ? filaVacia(8, 'Sin pacientes que coincidan con la búsqueda.')
                : pagina.map((p) => `
                  <tr class="border-b last:border-0 hover:bg-gray-50">
                    <td class="px-3 py-2 font-mono text-xs text-gray-500">${o(p.codigo_historial)}</td>
                    <td class="px-3 py-2 font-medium text-gray-800">${esc(p.nombres)} ${esc(p.apellidos)}</td>
                    <td class="px-3 py-2 text-gray-600">${o(p.dpi_o_documento)}</td>
                    <td class="px-3 py-2 whitespace-nowrap">${fechaLarga(p.fecha_nacimiento)}</td>
                    <td class="px-3 py-2 text-gray-600">${edadComoTexto(p.fecha_nacimiento)}</td>
                    <td class="px-3 py-2">${o(p.sexo)}</td>
                    <td class="px-3 py-2">${insignia(p.estado)}</td>
                    <td class="px-3 py-2 text-right">
                      <a href="#/pacientes?id=${encodeURIComponent(p.id_paciente)}" class="text-blue-600 hover:text-blue-800">Ver</a>
                    </td>
                  </tr>`).join('')}
            </tbody>
          </table>
          <div class="flex items-center justify-between px-3 py-2 border-t text-sm text-gray-600">
            <span data-contador></span>
            <div class="flex gap-2">
              <button type="button" data-anterior class="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40">Anterior</button>
              <button type="button" data-siguiente class="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40">Siguiente</button>
            </div>
          </div>
        </div>`;

      const desde = estado.desplazamiento + 1;
      const hasta = Math.min(estado.desplazamiento + LIMITE, estado.total);
      zona.querySelector('[data-contador]').textContent =
        estado.total === 0 ? 'Sin resultados' : `${desde}–${hasta} de ${estado.total}`;
      zona.querySelector('[data-anterior]').disabled = estado.desplazamiento === 0;
      zona.querySelector('[data-siguiente]').disabled = estado.desplazamiento + LIMITE >= estado.total;

      zona.querySelector('[data-anterior]').addEventListener('click', async (e) => {
        estado.desplazamiento = Math.max(0, estado.desplazamiento - LIMITE);
        await conCarga(e.currentTarget, pintar);
      });
      zona.querySelector('[data-siguiente]').addEventListener('click', async (e) => {
        if (estado.desplazamiento + LIMITE < estado.total) {
          estado.desplazamiento += LIMITE;
          await conCarga(e.currentTarget, pintar);
        }
      });
    } catch (error) {
      zona.innerHTML = bannerErrorHtml(error);
    }
  };

  contenedor.querySelector('[data-busqueda]').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    estado.texto = evento.currentTarget.querySelector('[data-texto]').value.trim();
    estado.estadoPaciente = evento.currentTarget.querySelector('[data-estado]').value;
    estado.desplazamiento = 0;
    await conCarga(evento.submitter, pintar);
  });

  await pintar();
}

// ----- Formulario compartido por registro y edición -----

const TIPOS_TELEFONO = ['Celular', 'Casa', 'Trabajo'];
const TIPOS_TELEFONO_CONTACTO = ['Celular', 'Casa'];
const TIPOS_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const filaTelefonoHtml = (telefono = {}, tipos = TIPOS_TELEFONO) => `
  <div class="fila-telefono flex gap-2 mb-2">
    <input type="tel" data-numero value="${esc(telefono.numero ?? '')}" placeholder="Número" maxlength="20" class="${CAMPO_TEXTO_CORTO} w-40">
    <select data-tipo class="${CAMPO_TEXTO_CORTO} w-32">
      <option value="">Tipo</option>
      ${tipos.map((t) => `<option ${telefono.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
    </select>
    <button type="button" data-quitar-fila class="text-red-600 hover:text-red-800 text-sm px-2">Quitar</button>
  </div>`;

const filaCorreoHtml = (correo = {}) => `
  <div class="fila-correo flex gap-2 mb-2">
    <input type="email" data-correo value="${esc(correo.correo ?? '')}" placeholder="correo@ejemplo.com" maxlength="100" class="${CAMPO_TEXTO_CORTO} flex-1">
    <button type="button" data-quitar-fila class="text-red-600 hover:text-red-800 text-sm px-2">Quitar</button>
  </div>`;

const tarjetaContactoHtml = (contacto = {}, { representante = false } = {}) => `
  <div class="${representante ? 'tarjeta-representante' : 'tarjeta-contacto'} border border-gray-200 rounded-lg p-3 mb-2 bg-gray-50">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
      <input type="text" data-nombres value="${esc(contacto.nombres ?? '')}" placeholder="Nombres *" maxlength="100" class="${CAMPO_TEXTO_CORTO}">
      <input type="text" data-apellidos value="${esc(contacto.apellidos ?? '')}" placeholder="Apellidos *" maxlength="100" class="${CAMPO_TEXTO_CORTO}">
      <input type="text" data-parentesco value="${esc(contacto.parentesco ?? '')}" placeholder="Parentesco" maxlength="50" class="${CAMPO_TEXTO_CORTO}">
      ${representante ? `<input type="text" data-dpi value="${esc(contacto.dpi ?? '')}" placeholder="DPI" maxlength="50" class="${CAMPO_TEXTO_CORTO}">` : ''}
      <input type="text" data-direccion value="${esc(contacto.direccion ?? '')}" placeholder="Dirección" maxlength="200" class="${CAMPO_TEXTO_CORTO} sm:col-span-2">
    </div>
    <p class="text-xs text-gray-500 mb-1">Teléfonos</p>
    <div data-telefonos>${(contacto.telefonos ?? []).map((t) => filaTelefonoHtml(t, TIPOS_TELEFONO_CONTACTO)).join('')}</div>
    <div class="flex gap-2 mb-1">
      <button type="button" data-agregar-telefono class="text-sm text-blue-600 hover:text-blue-800">Agregar teléfono</button>
      <button type="button" data-quitar-fila class="text-red-600 hover:text-red-800 text-sm ml-auto">Quitar ${representante ? 'representante' : 'contacto'}</button>
    </div>
    ${representante ? `
      <p class="text-xs text-gray-500 mb-1">Correos</p>
      <div data-correos>${(contacto.correos ?? []).map(filaCorreoHtml).join('')}</div>
      <button type="button" data-agregar-correo class="text-sm text-blue-600 hover:text-blue-800">Agregar correo</button>` : ''}
  </div>`;

const formPacienteHtml = (paciente) => {
  const p = paciente ?? {};
  return `
  <form data-formulario class="space-y-4">
    <section class="bg-white rounded-lg border border-gray-200 p-4">
      <h2 class="font-semibold text-gray-800 mb-3">Datos personales</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <label class="block">
          <span class="${ETIQUETA}">Nombres *</span>
          <input type="text" data-campo="nombres" required maxlength="100" value="${esc(p.nombres ?? '')}" class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Apellidos *</span>
          <input type="text" data-campo="apellidos" required maxlength="100" value="${esc(p.apellidos ?? '')}" class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">DPI o documento</span>
          <input type="text" data-campo="dpi_o_documento" maxlength="50" value="${esc(p.dpi_o_documento ?? '')}" class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Fecha de nacimiento *</span>
          <input type="date" data-campo="fecha_nacimiento" required value="${esc(p.fecha_nacimiento ?? '')}" class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Sexo</span>
          <select data-campo="sexo" class="${CAMPO_TEXTO}">
            <option value="">Sin especificar</option>
            ${['M', 'F', 'O'].map((s) => `<option value="${s}" ${p.sexo === s ? 'selected' : ''}>${s === 'M' ? 'Masculino' : s === 'F' ? 'Femenino' : 'Otro'}</option>`).join('')}
          </select>
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Tipo de sangre</span>
          <select data-campo="tipo_sangre" class="${CAMPO_TEXTO}">
            <option value="">Sin especificar</option>
            ${TIPOS_SANGRE.map((t) => `<option value="${t}" ${p.tipo_sangre === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Estado civil</span>
          <input type="text" data-campo="estado_civil" maxlength="50" value="${esc(p.estado_civil ?? '')}" class="${CAMPO_TEXTO}">
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Ocupación</span>
          <input type="text" data-campo="ocupacion" maxlength="100" value="${esc(p.ocupacion ?? '')}" class="${CAMPO_TEXTO}">
        </label>
        <label class="block sm:col-span-2 lg:col-span-3">
          <span class="${ETIQUETA}">Dirección</span>
          <input type="text" data-campo="direccion" maxlength="200" value="${esc(p.direccion ?? '')}" class="${CAMPO_TEXTO}">
        </label>
      </div>
    </section>

    <section class="bg-white rounded-lg border border-gray-200 p-4">
      <h2 class="font-semibold text-gray-800 mb-3">Teléfonos</h2>
      <div data-coleccion-telefonos>${(p.telefonos ?? []).map((t) => filaTelefonoHtml(t)).join('')}</div>
      <button type="button" data-agregar="telefono" class="text-sm text-blue-600 hover:text-blue-800">Agregar teléfono</button>
    </section>

    <section class="bg-white rounded-lg border border-gray-200 p-4">
      <h2 class="font-semibold text-gray-800 mb-3">Correos</h2>
      <div data-coleccion-correos>${(p.correos ?? []).map(filaCorreoHtml).join('')}</div>
      <button type="button" data-agregar="correo" class="text-sm text-blue-600 hover:text-blue-800">Agregar correo</button>
    </section>

    <section class="bg-white rounded-lg border border-gray-200 p-4">
      <h2 class="font-semibold text-gray-800 mb-3">Contactos de emergencia</h2>
      <div data-coleccion-contactos>${(p.contactos_emergencia ?? []).map((c) => tarjetaContactoHtml(c)).join('')}</div>
      <button type="button" data-agregar="contacto" class="text-sm text-blue-600 hover:text-blue-800">Agregar contacto</button>
    </section>

    <section class="bg-white rounded-lg border border-gray-200 p-4">
      <h2 class="font-semibold text-gray-800 mb-3">Representantes legales</h2>
      <p class="text-sm text-gray-500 mb-3">Los menores de 18 años requieren al menos un representante.</p>
      <div data-coleccion-representantes>${(p.representantes ?? []).map((r) => tarjetaContactoHtml(r, { representante: true })).join('')}</div>
      <button type="button" data-agregar="representante" class="text-sm text-blue-600 hover:text-blue-800">Agregar representante</button>
    </section>

    <div class="flex gap-2" data-acciones></div>
  </form>`;
};

// Botones de agregar y quitar con delegación: un solo listener por formulario y
// las filas nuevas responden sin reenganchar nada.
function activarColecciones(formulario) {
  formulario.addEventListener('click', (evento) => {
    const objetivo = evento.target;

    const quitar = objetivo.closest('[data-quitar-fila]');
    if (quitar) {
      quitar.closest('.fila-telefono, .fila-correo, .tarjeta-contacto, .tarjeta-representante')?.remove();
      return;
    }

    const agregarTelefono = objetivo.closest('[data-agregar-telefono]');
    if (agregarTelefono) {
      const tarjeta = agregarTelefono.closest('.tarjeta-contacto, .tarjeta-representante');
      tarjeta?.querySelector('[data-telefonos]')?.insertAdjacentHTML('beforeend', filaTelefonoHtml({}, TIPOS_TELEFONO_CONTACTO));
      return;
    }

    const agregarCorreo = objetivo.closest('[data-agregar-correo]');
    if (agregarCorreo) {
      const tarjeta = agregarCorreo.closest('.tarjeta-representante');
      tarjeta?.querySelector('[data-correos]')?.insertAdjacentHTML('beforeend', filaCorreoHtml());
      return;
    }

    const agregar = objetivo.closest('[data-agregar]');
    if (!agregar) return;
    const tipo = agregar.dataset.agregar;
    const destino = {
      telefono: formulario.querySelector('[data-coleccion-telefonos]'),
      correo: formulario.querySelector('[data-coleccion-correos]'),
      contacto: formulario.querySelector('[data-coleccion-contactos]'),
      representante: formulario.querySelector('[data-coleccion-representantes]'),
    }[tipo];
    if (!destino) return;
    destino.insertAdjacentHTML('beforeend', tipo === 'telefono'
      ? filaTelefonoHtml()
      : tipo === 'correo'
        ? filaCorreoHtml()
        : tarjetaContactoHtml({}, { representante: tipo === 'representante' }));
    destino.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

// Lee el formulario completo: los campos opcionales vacíos se omiten y las
// colecciones se reenvían completas, porque el PATCH las reemplaza.
function leerPaciente(formulario) {
  const campo = (nombre) => formulario.querySelector(`[data-campo="${nombre}"]`).value.trim();
  const paciente = {
    nombres: campo('nombres'),
    apellidos: campo('apellidos'),
    fecha_nacimiento: campo('fecha_nacimiento'),
  };
  ['dpi_o_documento', 'sexo', 'tipo_sangre', 'estado_civil', 'ocupacion', 'direccion'].forEach((nombre) => {
    const valor = campo(nombre);
    if (valor) paciente[nombre] = valor;
  });

  const leerTelefonos = (zona) => Array.from(zona.querySelectorAll('.fila-telefono'))
    .map((fila) => {
      const telefono = { numero: fila.querySelector('[data-numero]').value.trim() };
      const tipo = fila.querySelector('[data-tipo]').value;
      if (tipo) telefono.tipo = tipo;
      return telefono;
    })
    .filter((t) => t.numero !== '');

  const leerCorreos = (zona) => Array.from(zona.querySelectorAll('.fila-correo'))
    .map((fila) => ({ correo: fila.querySelector('[data-correo]').value.trim() }))
    .filter((c) => c.correo !== '');

  paciente.telefonos = leerTelefonos(formulario.querySelector('[data-coleccion-telefonos]'));
  paciente.correos = leerCorreos(formulario.querySelector('[data-coleccion-correos]'));

  paciente.contactos_emergencia = Array.from(formulario.querySelectorAll('.tarjeta-contacto'))
    .map((tarjeta) => ({
      nombres: tarjeta.querySelector('[data-nombres]').value.trim(),
      apellidos: tarjeta.querySelector('[data-apellidos]').value.trim(),
      parentesco: tarjeta.querySelector('[data-parentesco]').value.trim() || null,
      direccion: tarjeta.querySelector('[data-direccion]').value.trim() || null,
      telefonos: leerTelefonos(tarjeta.querySelector('[data-telefonos]')),
    }))
    .filter((c) => c.nombres !== '' || c.apellidos !== '');

  paciente.representantes = Array.from(formulario.querySelectorAll('.tarjeta-representante'))
    .map((tarjeta) => {
      const representante = {
        nombres: tarjeta.querySelector('[data-nombres]').value.trim(),
        apellidos: tarjeta.querySelector('[data-apellidos]').value.trim(),
        parentesco: tarjeta.querySelector('[data-parentesco]').value.trim() || null,
        direccion: tarjeta.querySelector('[data-direccion]').value.trim() || null,
        telefonos: leerTelefonos(tarjeta.querySelector('[data-telefonos]')),
        correos: leerCorreos(tarjeta.querySelector('[data-correos]')),
      };
      const dpi = tarjeta.querySelector('[data-dpi]').value.trim();
      if (dpi) representante.dpi = dpi;
      return representante;
    })
    .filter((r) => r.nombres !== '' || r.apellidos !== '');

  return paciente;
}

async function formularioPaciente(contenedor, paciente) {
  const nuevo = !paciente;
  contenedor.innerHTML = `
    <div class="mb-4">
      <a href="#/pacientes" class="text-sm text-blue-600 hover:text-blue-800">&larr; Volver al listado</a>
      <h1 class="text-xl font-semibold text-gray-800 mt-1">${nuevo ? 'Nuevo paciente' : 'Editar paciente'}</h1>
      ${nuevo ? '' : `<p class="text-sm text-gray-500">${esc(paciente.nombres)} ${esc(paciente.apellidos)} · ${o(paciente.codigo_historial)} ${insignia(paciente.estado)}</p>`}
    </div>
    ${formPacienteHtml(paciente)}`;

  const formulario = contenedor.querySelector('[data-formulario]');
  activarColecciones(formulario);
  formulario.querySelector('[data-acciones]').innerHTML = `
    <button type="submit" data-guardar class="bg-blue-600 text-white text-sm rounded px-4 py-2 hover:bg-blue-700">${nuevo ? 'Registrar paciente' : 'Guardar cambios'}</button>
    <a href="#/pacientes" class="border border-gray-300 text-gray-700 text-sm rounded px-4 py-2 hover:bg-gray-50">Cancelar</a>`;

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector('[data-guardar]');
    const cuerpo = leerPaciente(formulario);

    if (esMenorDeEdad(cuerpo.fecha_nacimiento) && cuerpo.representantes.length === 0) {
      avisar('Un menor de 18 años requiere al menos un representante legal.', 'advertencia');
      return;
    }

    try {
      await conCarga(boton, async () => {
        const guardado = nuevo
          ? await api.crear('/api/pacientes', cuerpo)
          : await api.actualizar(`/api/pacientes/${encodeURIComponent(paciente.id_paciente)}`, cuerpo);
        recordarPaciente(guardado);
        avisar(nuevo ? 'Paciente registrado con historial clínico abierto.' : 'Cambios guardados.');
        window.location.hash = `#/pacientes?id=${encodeURIComponent(guardado.id_paciente)}`;
      });
    } catch (error) {
      avisar(error.message, 'error');
    }
  });
}

// ----- Detalle: edición, acciones por permiso y archivado -----

async function detallePaciente(contenedor, id) {
  const paciente = await api.obtener(`/api/pacientes/${encodeURIComponent(id)}`);
  const usuario = obtenerSesion().usuario;
  const puedeVerHistorial = tienePermiso(usuario.rol, PERMISOS.VER_HISTORIAL_CLINICO);
  const puedeArchivar = tienePermiso(usuario.rol, PERMISOS.ARCHIVAR_PACIENTES) && paciente.estado === 'Activo';

  contenedor.innerHTML = `
    <div class="mb-4">
      <a href="#/pacientes" class="text-sm text-blue-600 hover:text-blue-800">&larr; Volver al listado</a>
    </div>
    <div class="flex items-center gap-2 flex-wrap mb-4">
      <h1 class="text-xl font-semibold text-gray-800">${esc(paciente.nombres)} ${esc(paciente.apellidos)}</h1>
      ${insignia(paciente.estado)}
      <span class="text-sm text-gray-500">${edadComoTexto(paciente.fecha_nacimiento)}</span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
      <a href="#/citas?paciente=${encodeURIComponent(id)}" class="text-center bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-blue-700 hover:border-blue-400">Citas del paciente</a>
      ${puedeVerHistorial ? `
        <a href="#/historial?paciente=${encodeURIComponent(id)}" class="text-center bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-blue-700 hover:border-blue-400">Historial clínico</a>
        <a href="#/consultas?paciente=${encodeURIComponent(id)}" class="text-center bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-blue-700 hover:border-blue-400">Nueva consulta</a>` : ''}
    </div>
    ${puedeArchivar ? `<button type="button" data-archivar class="mb-4 border border-red-300 text-red-700 text-sm rounded px-4 py-2 hover:bg-red-50">Archivar o dar de baja</button>` : ''}
    ${formPacienteHtml(paciente)}`;

  const formulario = contenedor.querySelector('[data-formulario]');
  activarColecciones(formulario);
  formulario.querySelector('[data-acciones]').innerHTML =
    `<button type="submit" data-guardar class="bg-blue-600 text-white text-sm rounded px-4 py-2 hover:bg-blue-700">Guardar cambios</button>`;

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector('[data-guardar]');
    const cuerpo = leerPaciente(formulario);

    if (esMenorDeEdad(cuerpo.fecha_nacimiento) && cuerpo.representantes.length === 0) {
      avisar('Un menor de 18 años requiere al menos un representante legal.', 'advertencia');
      return;
    }
    try {
      await conCarga(boton, async () => {
        await api.actualizar(`/api/pacientes/${encodeURIComponent(id)}`, cuerpo);
        avisar('Cambios guardados.');
      });
    } catch (error) {
      avisar(error.message, 'error');
    }
  });

  const botonArchivar = contenedor.querySelector('[data-archivar]');
  if (!botonArchivar) return;

  botonArchivar.addEventListener('click', async () => {
    const acepta = await confirmar(
      'El paciente dejará de recibir citas nuevas y su historial se archiva junto con el registro.',
      { textoBoton: 'Archivar', titulo: 'Archivar paciente' },
    );
    if (!acepta) return;

    const capa = abrirModal('Archivar paciente', `
      <label class="block mb-3">
        <span class="${ETIQUETA}">Estado final *</span>
        <select data-estado class="${CAMPO_TEXTO}">
          <option value="Archivado">Archivado</option>
          <option value="Inactivo">Inactivo</option>
        </select>
      </label>
      <label class="block mb-3">
        <span class="${ETIQUETA}">Motivo *</span>
        <textarea data-motivo rows="2" maxlength="255" class="${CAMPO_TEXTO}"></textarea>
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" data-cancelar class="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="button" data-confirmar class="px-4 py-2 rounded bg-red-600 text-white text-sm hover:bg-red-700">Guardar baja</button>
      </div>`);
    capa.querySelector('[data-cancelar]').addEventListener('click', cerrarModal);
    capa.querySelector('[data-confirmar]').addEventListener('click', async (evento) => {
      const cuerpo = {
        estado: capa.querySelector('[data-estado]').value,
        motivo: capa.querySelector('[data-motivo]').value.trim(),
      };
      if (!cuerpo.motivo) {
        avisar('Escribe el motivo de la baja.', 'advertencia');
        return;
      }
      try {
        await conCarga(evento.currentTarget, async () => {
          await api.crear(`/api/pacientes/${encodeURIComponent(id)}/archivar`, cuerpo);
          cerrarModal();
          avisar('Paciente dado de baja.');
          window.location.hash = '#/pacientes';
        });
      } catch (error) {
        avisar(error.message, 'error');
      }
    });
  });
}
