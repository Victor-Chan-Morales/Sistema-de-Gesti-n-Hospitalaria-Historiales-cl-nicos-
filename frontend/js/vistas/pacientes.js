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
    ${encabezadoHtml('Pacientes', {
      descripcion: 'Registro de pacientes de tu institución. Al registrar uno se abre su historial clínico.',
      acciones: '<a href="#/pacientes?nuevo=1" class="btn btn-primario">Registrar paciente</a>',
    })}
    <form data-busqueda class="filtros" role="search">
      <label class="block flex-1 min-w-56">
        <span class="${ETIQUETA}">Buscar</span>
        <input type="search" data-texto placeholder="Nombre, apellido o documento" class="${CAMPO_TEXTO}">
      </label>
      <label class="block w-44">
        <span class="${ETIQUETA}">Estado</span>
        <select data-estado class="${CAMPO_TEXTO}">
        <option value="">Todos los estados</option>
        <option>Activo</option>
        <option>Archivado</option>
        <option>Inactivo</option>
      </select>
      </label>
      <button type="submit" class="btn btn-secundario">Buscar</button>
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
        <div class="tabla-marco">
          <table>
            <thead>
              <tr>
                <th class="px-4 py-2">Paciente</th>
                <th class="px-3 py-2">Historial</th>
                <th class="px-3 py-2">Documento</th>
                <th class="px-3 py-2">Nacimiento</th>
                <th class="px-3 py-2">Sexo</th>
                <th class="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${pagina.length === 0
                ? filaVacia(6, estado.texto || estado.estadoPaciente ? 'Ningún paciente coincide con la búsqueda.' : 'Aún no hay pacientes. Registra el primero con "Registrar paciente".')
                : pagina.map((p) => `
                  <tr>
                    <td class="px-4 py-2.5">
                      <a href="#/pacientes?id=${encodeURIComponent(p.id_paciente)}" class="font-bold text-gray-900 hover:text-blue-700 hover:underline">${esc(p.apellidos)}, ${esc(p.nombres)}</a>
                    </td>
                    <td class="px-3 py-2.5 text-gray-700">${o(p.codigo_historial)}</td>
                    <td class="px-3 py-2.5 text-gray-700">${o(p.dpi_o_documento)}</td>
                    <td class="px-3 py-2.5 whitespace-nowrap">${fechaLarga(p.fecha_nacimiento)} <span class="text-gray-500">(${edadComoTexto(p.fecha_nacimiento)})</span></td>
                    <td class="px-3 py-2.5">${o(SEXOS[p.sexo] ?? p.sexo)}</td>
                    <td class="px-3 py-2.5">${insignia(p.estado)}</td>
                  </tr>`).join('')}
            </tbody>
          </table>
          <div class="flex items-center justify-between px-4 py-2 border-t border-gray-200 text-sm text-gray-700">
            <span data-contador></span>
            <div class="flex gap-2">
              <button type="button" data-anterior class="btn btn-secundario btn-chico">Anterior</button>
              <button type="button" data-siguiente class="btn btn-secundario btn-chico">Siguiente</button>
            </div>
          </div>
        </div>`;

      const desde = estado.desplazamiento + 1;
      const hasta = Math.min(estado.desplazamiento + LIMITE, estado.total);
      zona.querySelector('[data-contador]').textContent =
        estado.total === 0 ? 'Sin resultados' : `${desde} a ${hasta} de ${estado.total} pacientes`;
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
  <div class="fila-telefono flex gap-2 mb-2 items-center">
    <input type="tel" data-numero value="${esc(telefono.numero ?? '')}" placeholder="Número" aria-label="Número de teléfono" maxlength="20" class="${CAMPO_TEXTO_CORTO} w-44">
    <select data-tipo aria-label="Tipo de teléfono" class="${CAMPO_TEXTO_CORTO} w-32">
      <option value="">Tipo</option>
      ${tipos.map((t) => `<option ${telefono.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
    </select>
    <button type="button" data-quitar-fila class="enlace-quitar px-2">Quitar</button>
  </div>`;

const filaCorreoHtml = (correo = {}) => `
  <div class="fila-correo flex gap-2 mb-2 items-center">
    <input type="email" data-correo value="${esc(correo.correo ?? '')}" placeholder="correo@ejemplo.com" aria-label="Correo electrónico" maxlength="100" class="${CAMPO_TEXTO_CORTO} flex-1 max-w-sm">
    <button type="button" data-quitar-fila class="enlace-quitar px-2">Quitar</button>
  </div>`;

const tarjetaContactoHtml = (contacto = {}, { representante = false } = {}) => `
  <div class="${representante ? 'tarjeta-representante' : 'tarjeta-contacto'} renglon">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
      <input type="text" data-nombres value="${esc(contacto.nombres ?? '')}" placeholder="Nombres *" maxlength="100" class="${CAMPO_TEXTO_CORTO}">
      <input type="text" data-apellidos value="${esc(contacto.apellidos ?? '')}" placeholder="Apellidos *" maxlength="100" class="${CAMPO_TEXTO_CORTO}">
      <input type="text" data-parentesco value="${esc(contacto.parentesco ?? '')}" placeholder="Parentesco" maxlength="50" class="${CAMPO_TEXTO_CORTO}">
      ${representante ? `<input type="text" data-dpi value="${esc(contacto.dpi ?? '')}" placeholder="DPI" maxlength="50" class="${CAMPO_TEXTO_CORTO}">` : ''}
      <input type="text" data-direccion value="${esc(contacto.direccion ?? '')}" placeholder="Dirección" maxlength="200" class="${CAMPO_TEXTO_CORTO} sm:col-span-2">
    </div>
    <p class="text-sm font-bold text-gray-700 mb-1">Teléfonos</p>
    <div data-telefonos>${(contacto.telefonos ?? []).map((t) => filaTelefonoHtml(t, TIPOS_TELEFONO_CONTACTO)).join('')}</div>
    <div class="flex gap-2 mb-1">
      <button type="button" data-agregar-telefono class="enlace">Añadir teléfono</button>
      <button type="button" data-quitar-fila class="enlace-quitar ml-auto">Quitar ${representante ? 'representante' : 'contacto'}</button>
    </div>
    ${representante ? `
      <p class="text-sm font-bold text-gray-700 mb-1">Correos</p>
      <div data-correos>${(contacto.correos ?? []).map(filaCorreoHtml).join('')}</div>
      <button type="button" data-agregar-correo class="enlace">Añadir correo</button>` : ''}
  </div>`;

const campo = (etiqueta, control, extra = '') =>
  `<label class="block ${extra}"><span class="${ETIQUETA}">${etiqueta}</span>${control}</label>`;

const formPacienteHtml = (paciente) => {
  const p = paciente ?? {};
  const texto = (nombre, max, requerido = false) =>
    `<input type="text" data-campo="${nombre}" ${requerido ? 'required' : ''} maxlength="${max}" value="${esc(p[nombre] ?? '')}" class="${CAMPO_TEXTO}">`;
  return `
  <form data-formulario>
    <section class="form-bloque">
      <header>
        <h2>Identificación</h2>
        <p>Nombre, documento y fecha de nacimiento son los datos con que se encuentra el expediente.</p>
      </header>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${campo('Nombres *', texto('nombres', 100, true))}
        ${campo('Apellidos *', texto('apellidos', 100, true))}
        ${campo('DPI o documento', texto('dpi_o_documento', 50))}
        ${campo('Fecha de nacimiento *', `<input type="date" data-campo="fecha_nacimiento" required max="${hoy()}" value="${esc(p.fecha_nacimiento ?? '')}" class="${CAMPO_TEXTO}">`)}
        ${campo('Sexo', `<select data-campo="sexo" class="${CAMPO_TEXTO}">
            <option value="">Sin especificar</option>
            ${Object.entries(SEXOS).map(([valor, nombre]) => `<option value="${valor}" ${p.sexo === valor ? 'selected' : ''}>${nombre}</option>`).join('')}
          </select>`)}
        ${campo('Tipo de sangre', `<select data-campo="tipo_sangre" class="${CAMPO_TEXTO}">
            <option value="">Sin especificar</option>
            ${TIPOS_SANGRE.map((t) => `<option value="${t}" ${p.tipo_sangre === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>`)}
        ${campo('Estado civil', texto('estado_civil', 50))}
        ${campo('Ocupación', texto('ocupacion', 100))}
        ${campo('Dirección', texto('direccion', 200), 'sm:col-span-2 lg:col-span-3')}
      </div>
    </section>

    <section class="form-bloque">
      <header>
        <h2>Contacto</h2>
        <p>Teléfonos y correos del propio paciente.</p>
      </header>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p class="${ETIQUETA}">Teléfonos</p>
          <div data-coleccion-telefonos>${(p.telefonos ?? []).map((t) => filaTelefonoHtml(t)).join('')}</div>
          <button type="button" data-agregar="telefono" class="enlace">Añadir teléfono</button>
        </div>
        <div>
          <p class="${ETIQUETA}">Correos</p>
          <div data-coleccion-correos>${(p.correos ?? []).map(filaCorreoHtml).join('')}</div>
          <button type="button" data-agregar="correo" class="enlace">Añadir correo</button>
        </div>
      </div>
    </section>

    <section class="form-bloque">
      <header>
        <h2>Contactos de emergencia</h2>
        <p>A quién llamar si el paciente no puede responder.</p>
      </header>
      <div>
        <div data-coleccion-contactos>${(p.contactos_emergencia ?? []).map((c) => tarjetaContactoHtml(c)).join('')}</div>
        <button type="button" data-agregar="contacto" class="enlace">Añadir contacto de emergencia</button>
      </div>
    </section>

    <section class="form-bloque">
      <header>
        <h2>Representantes legales</h2>
        <p>Obligatorio para menores de 18 años: al menos un representante.</p>
      </header>
      <div>
        <div data-coleccion-representantes>${(p.representantes ?? []).map((r) => tarjetaContactoHtml(r, { representante: true })).join('')}</div>
        <button type="button" data-agregar="representante" class="enlace">Añadir representante</button>
      </div>
    </section>

    <div class="form-pie" data-acciones></div>
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
    ${encabezadoHtml(nuevo ? 'Registrar paciente' : 'Editar paciente', {
      volver: { href: '#/pacientes', texto: 'Pacientes' },
      descripcion: nuevo ? 'Los campos con asterisco son obligatorios. El historial clínico se abre al guardar.' : '',
    })}
    ${formPacienteHtml(paciente)}`;

  const formulario = contenedor.querySelector('[data-formulario]');
  activarColecciones(formulario);
  formulario.querySelector('[data-acciones]').innerHTML = `
    <button type="submit" data-guardar class="btn btn-primario">${nuevo ? 'Registrar paciente' : 'Guardar cambios'}</button>
    <a href="#/pacientes" class="btn btn-secundario">Cancelar</a>`;
  formulario.querySelector('[data-campo="nombres"]').focus();

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

  const idUrl = encodeURIComponent(id);
  const activo = paciente.estado === 'Activo';
  const acciones = [
    `<a href="#/citas?paciente=${idUrl}" class="btn btn-secundario">Ver citas</a>`,
    puedeVerHistorial ? `<a href="#/historial?paciente=${idUrl}" class="btn btn-secundario">Abrir historial</a>` : '',
    puedeVerHistorial && activo ? `<a href="#/consultas?paciente=${idUrl}" class="btn btn-primario">Nueva consulta</a>` : '',
  ].join('');

  contenedor.innerHTML = `
    <a href="#/pacientes" class="volver">Pacientes</a>
    ${fichaPacienteHtml(paciente, { acciones })}
    ${activo ? '' : `<div class="mb-6">${bannerHtml(`Expediente ${esc(paciente.estado.toLowerCase())}${paciente.motivo_baja ? `: ${esc(paciente.motivo_baja)}` : ''}. No recibe citas ni datos clínicos nuevos.`, 'info')}</div>`}
    <div class="seccion-cabeza">
      <h2 class="titulo-seccion">Datos del registro</h2>
      ${puedeArchivar ? '<button type="button" data-archivar class="btn btn-peligro btn-chico">Dar de baja</button>' : ''}
    </div>
    ${formPacienteHtml(paciente)}`;

  const formulario = contenedor.querySelector('[data-formulario]');
  activarColecciones(formulario);
  formulario.querySelector('[data-acciones]').innerHTML =
    `<button type="submit" data-guardar class="btn btn-primario">Guardar cambios</button>`;

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
        const guardado = await api.actualizar(`/api/pacientes/${encodeURIComponent(id)}`, cuerpo);
        recordarPaciente(guardado);
        avisar('Cambios guardados.');
        contenedor.querySelector('.ficha').outerHTML = fichaPacienteHtml(guardado, { acciones });
      });
    } catch (error) {
      avisar(error.message, 'error');
    }
  });

  const botonArchivar = contenedor.querySelector('[data-archivar]');
  if (!botonArchivar) return;

  botonArchivar.addEventListener('click', () => {
    const capa = abrirModal('Dar de baja al paciente', `
      <p class="text-gray-800 mb-4">${esc(paciente.nombres)} ${esc(paciente.apellidos)} dejará de recibir citas y datos clínicos nuevos. Su historial se cierra, pero no se borra: queda disponible para consulta.</p>
      <div class="space-y-4">
        <label class="block">
          <span class="${ETIQUETA}">Estado final *</span>
          <select data-estado class="${CAMPO_TEXTO}">
            <option value="Archivado">Archivado (traslado o fallecimiento)</option>
            <option value="Inactivo">Inactivo (otra causa administrativa)</option>
          </select>
        </label>
        <label class="block">
          <span class="${ETIQUETA}">Motivo *</span>
          <textarea data-motivo rows="3" maxlength="255" placeholder="Por ejemplo: traslado al Hospital Regional" class="${CAMPO_TEXTO}"></textarea>
        </label>
      </div>
      ${pieModalHtml('Dar de baja', { peligro: true })}`);
    capa.querySelector('[data-cancelar]').addEventListener('click', cerrarModal);
    capa.querySelector('[data-guardar]').addEventListener('click', async (evento) => {
      const cuerpo = {
        estado: capa.querySelector('[data-estado]').value,
        motivo: capa.querySelector('[data-motivo]').value.trim(),
      };
      if (!cuerpo.motivo) {
        avisar('Escribe el motivo de la baja.', 'advertencia');
        capa.querySelector('[data-motivo]').focus();
        return;
      }
      try {
        await conCarga(evento.currentTarget, async () => {
          await api.crear(`/api/pacientes/${encodeURIComponent(id)}/archivar`, cuerpo);
          cerrarModal();
          avisar('Paciente dado de baja.');
          await detallePaciente(contenedor, id);
        });
      } catch (error) {
        avisar(error.message, 'error');
      }
    });
  });
}
