// Adaptador de Firebase (Centro Médico Pediátrico, Firestore): contrato común del puerto.
//
// Modelo (ver docs/04-modelo-documental.md): EMBEBIDO mediante subcolecciones. Lo que se consulta
// siempre junto con el paciente cuelga de su documento: pacientes/{id}/alergias, /antecedentes,
// /controles_crecimiento y /registro_vacunas. Los teléfonos, contactos y representantes van
// dentro del propio documento del paciente. Las citas y las consultas son colecciones de primer
// nivel porque se buscan por su ID o por profesional, sin conocer al paciente.
//
// Firestore no tiene claves foráneas, índices únicos ni búsqueda por subcadena, así que:
//   - la unicidad usa documentos-clave (indices_unicos) comprobados dentro de la transacción;
//   - las referencias se verifican leyendo el documento al que apuntan;
//   - las búsquedas por texto y los filtros combinados se completan en memoria, lo que es
//     razonable para el volumen de un centro pediátrico y evita índices compuestos.
//
// Todas las escrituras son transacciones: las lecturas van antes que las escrituras y, si otra
// transacción toca los mismos documentos, Firestore reintenta y se vuelven a evaluar las reglas.

const { FieldValue } = require('firebase-admin/firestore');
const {
  NoEncontrado, ReglaNegocio, RegistroDuplicado, ConsultaDuplicada, DatosInvalidos, ConflictoHorario,
} = require('../../../domain/errores');
const { hoy } = require('../../../domain/fechas');
const {
  COLUMNAS_PACIENTE, elegir, comoTexto, comoIdInstitucion, aTextoInstitucion, contiene, registroAuditoria, esProfesionalActivo,
  porCampo, porCampoDesc,
} = require('../nosql-comun/utilidades');
const { claveUnica } = require('./conexion');

// --- IDs y conversión ---

// Los IDs automáticos de Firestore tienen 20 caracteres alfanuméricos. Validarlos evita
// también que un ID con '/' se interprete como otra ruta.
const esIdValido = (id) => typeof id === 'string' && /^[A-Za-z0-9]{20}$/.test(id);

// Se descartan los campos internos, que empiezan por "_" (marcas de orden, versión).
function limpiar(valor) {
  if (Array.isArray(valor)) return valor.map(limpiar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).filter(([k]) => !k.startsWith('_') && k !== 'version').map(([k, v]) => [k, limpiar(v)]),
    );
  }
  return valor;
}

const aContrato = (id, columnaId, datos) => ({ [columnaId]: id, ...limpiar(datos) });
const marcaDeCreacion = () => new Date().toISOString();

const CAMPOS_USUARIO = ['id_institucion', 'nombres', 'apellidos', 'usuario', 'rol', 'estado'];
function usuarioAContrato(snap, conHash = false) {
  const d = snap.data();
  const salida = { id_usuario: snap.id, ...Object.fromEntries(CAMPOS_USUARIO.map((c) => [c, d[c] ?? null])) };
  salida.id_institucion = salida.id_institucion === null ? null : String(salida.id_institucion);
  if (conHash) salida.contrasena_hash = d.contrasena_hash;
  return salida;
}

function pacienteAContrato(snap) {
  const { historial, ...datos } = snap.data();
  return {
    ...aContrato(snap.id, 'id_paciente', datos),
    id_historial: historial.id_historial,
    codigo_historial: historial.codigo_historial,
  };
}

const CAMPOS_HISTORIAL = [
  'id_historial', 'id_institucion', 'codigo_historial', 'fecha_apertura', 'estado',
  'fecha_cierre', 'motivo_cierre', 'observaciones',
];
const historialAContrato = (idPaciente, historial) => aTextoInstitucion({
  id_historial: historial.id_historial,
  id_paciente: idPaciente,
  ...Object.fromEntries(CAMPOS_HISTORIAL.slice(1).map((c) => [c, historial[c] ?? null])),
});

// --- Colecciones embebidas del paciente ---

const telefonos = (lista = []) => lista.map(({ numero, tipo }) => ({ numero, tipo: tipo ?? null }));
const correos = (lista = []) => lista.map(({ correo }) => ({ correo }));

function crearGeneradorDeIds(db) {
  return () => db.collection('_ids').doc().id;
}

// --- Repositorios ---

function crearRepositorios(cn) {
  const db = cn.db;
  const nuevoId = crearGeneradorDeIds(db);
  const col = (nombre) => db.collection(nombre);
  const refPaciente = (id) => col('pacientes').doc(id);

  const contactos = (lista = []) => lista.map((c) => ({
    id_contacto: nuevoId(),
    nombres: c.nombres,
    apellidos: c.apellidos,
    parentesco: c.parentesco ?? null,
    direccion: c.direccion ?? null,
    telefonos: telefonos(c.telefonos),
  }));

  const representantes = (lista = []) => lista.map((r) => ({
    id_representante: nuevoId(),
    nombres: r.nombres,
    apellidos: r.apellidos,
    dpi: r.dpi ?? null,
    parentesco: r.parentesco ?? null,
    direccion: r.direccion ?? null,
    telefonos: telefonos(r.telefonos),
    correos: correos(r.correos),
  }));

  const auditar = (tx, actor, accion, entidad, idEntidad, idDetalle = null) =>
    tx.create(col('auditoria').doc(), registroAuditoria(actor, accion, entidad, idEntidad, { idDetalle }));

  // Lee el documento de un paciente dentro de la transacción; NoEncontrado si no existe.
  async function exigirPaciente(tx, idPaciente) {
    if (!esIdValido(idPaciente)) throw new NoEncontrado('El paciente no existe.');
    const snap = await tx.get(refPaciente(idPaciente));
    if (!snap.exists) throw new NoEncontrado('El paciente no existe.');
    return snap;
  }

  // Referencias del cuerpo de una petición: un ID inexistente es DatosInvalidos.
  async function exigirReferencia(tx, coleccion, id, campo) {
    const snap = esIdValido(String(id)) ? await tx.get(col(coleccion).doc(String(id))) : null;
    if (!snap?.exists) throw new DatosInvalidos(`${campo} hace referencia a un registro inexistente.`);
    return snap;
  }

  const refUnico = (tipo, valor) => col('indices_unicos').doc(claveUnica(tipo, valor));

  // --- Agenda: choques de horario ---
  // Escribir el paciente y el profesional hace que dos atenciones simultáneas de cualquiera de
  // ellos choquen: Firestore reintenta a la perdedora, que entonces vuelve a leer los horarios.
  // Regla de orden: todas las lecturas de la transacción van antes que las escrituras.
  const MENSAJE_CITA_PROFESIONAL = 'El profesional ya tiene una cita programada a esa misma hora.';
  const MENSAJE_CITA_PACIENTE = 'El paciente ya tiene una cita programada a esa misma hora.';
  const MENSAJE_CONSULTA_PROFESIONAL = 'El profesional ya tiene una consulta registrada a esa misma hora.';
  const MENSAJE_CONSULTA_PACIENTE = 'El paciente ya tiene una consulta registrada a esa misma hora.';

  function bloquearAgenda(tx, idPaciente, idProfesional) {
    tx.update(refPaciente(String(idPaciente)), { version: FieldValue.increment(1) });
    tx.update(col('usuarios').doc(String(idProfesional)), { version: FieldValue.increment(1) });
  }

  // Regla: un profesional, o un paciente, no puede tener dos citas Programadas a la misma hora.
  async function exigirHorarioCitaLibre(tx, { idCita, idPaciente, idProfesional, fechaHora }) {
    const docs = (await tx.get(col('citas').where('fecha_hora', '==', fechaHora).where('estado', '==', 'Programada'))).docs;
    const choque = docs
      .filter((d) => d.id !== (idCita ? String(idCita) : null))
      .map((d) => d.data())
      .find((c) => String(c.id_usuario_profesional) === String(idProfesional) || String(c.id_paciente) === String(idPaciente));
    if (!choque) return;
    const delProfesional = String(choque.id_usuario_profesional) === String(idProfesional);
    throw new ConflictoHorario(delProfesional ? MENSAJE_CITA_PROFESIONAL : MENSAJE_CITA_PACIENTE);
  }

  // Regla: un profesional, o un paciente, no puede tener dos consultas a la misma hora.
  async function exigirHorarioConsultaLibre(tx, { idPaciente, idProfesional, fechaHora }) {
    const consultas = (await tx.get(col('consultas').where('fecha_hora', '==', fechaHora))).docs.map((d) => d.data());
    const choque = consultas
      .filter((c) => c.estado !== 'Anulada')
      .find((c) => String(c.id_usuario_profesional) === String(idProfesional) || String(c.id_paciente) === String(idPaciente));
    if (!choque) return;
    const delProfesional = String(choque.id_usuario_profesional) === String(idProfesional);
    throw new ConflictoHorario(delProfesional ? MENSAJE_CONSULTA_PROFESIONAL : MENSAJE_CONSULTA_PACIENTE);
  }


  async function exigirLibre(tx, refs, mensaje = 'Ya existe un registro con esos datos.') {
    if (refs.length === 0) return;
    const snaps = await tx.getAll(...refs);
    if (snaps.some((s) => s.exists)) throw new RegistroDuplicado(mensaje);
  }

  // --- usuarios ---

  const usuarios = {
    async buscarPorNombre(usuario) {
      if (typeof usuario !== 'string') return null;
      const { docs } = await col('usuarios').where('usuario', '==', usuario).limit(1).get();
      return docs.length ? usuarioAContrato(docs[0], true) : null;
    },
    async obtener(id) {
      if (!esIdValido(id)) return null;
      const snap = await col('usuarios').doc(id).get();
      return snap.exists ? usuarioAContrato(snap) : null;
    },
    async registrarAcceso(id, fechaHora) {
      if (!esIdValido(id)) return;
      await col('usuarios').doc(id).update({ ultimo_acceso: fechaHora }).catch((error) => {
        if (error?.code !== 5) throw error; // NOT_FOUND: el usuario ya no existe
      });
    },
    async listarProfesionales() {
      const { docs } = await col('usuarios').where('estado', '==', 'Activo').get();
      return docs.map((d) => usuarioAContrato(d)).filter(esProfesionalActivo)
        .sort(porCampo('apellidos', 'nombres'));
    },
  };

  // --- pacientes ---

  const escalares = (datos) => Object.fromEntries(COLUMNAS_PACIENTE.map((c) => [c, datos[c] ?? null]));

  const pacientes = {
    crear: (datos, actor) => cn.transaccion(async (tx) => {
      const id = nuevoId();
      const claves = [refUnico('historial', datos.codigo_historial)];
      if (datos.dpi_o_documento) claves.push(refUnico('dpi', datos.dpi_o_documento));
      await exigirLibre(tx, claves);

      const documento = {
        ...escalares(datos),
        fecha_registro: datos.fecha_registro,
        estado: 'Activo',
        motivo_baja: null,
        telefonos: telefonos(datos.telefonos),
        correos: correos(datos.correos),
        contactos_emergencia: contactos(datos.contactos_emergencia),
        representantes: representantes(datos.representantes),
        historial: {
          id_historial: nuevoId(),
          id_institucion: comoIdInstitucion(datos.id_institucion),
          codigo_historial: datos.codigo_historial,
          fecha_apertura: datos.fecha_registro,
          estado: 'Activo',
          fecha_cierre: null,
          motivo_cierre: null,
          observaciones: null,
        },
        // Serializa transacciones concurrentes sobre un mismo paciente (ver registrarAtencion).
        version: 0,
      };
      tx.create(refPaciente(id), documento);
      for (const ref of claves) tx.create(ref, { id_paciente: id });
      auditar(tx, actor, 'CREAR', 'Paciente', id);
      return pacienteAContrato({ id, data: () => documento });
    }),

    async obtener(id) {
      if (!esIdValido(id)) return null;
      const snap = await refPaciente(id).get();
      return snap.exists ? pacienteAContrato(snap) : null;
    },

    async buscar({ texto, estado, limite, desplazamiento }) {
      const { docs } = estado
        ? await col('pacientes').where('estado', '==', comoTexto(estado)).get()
        : await col('pacientes').get();
      const coincidencias = docs
        .map(pacienteAContrato)
        .filter((p) => !texto || [p.nombres, p.apellidos, p.dpi_o_documento].some((v) => contiene(v, texto)))
        .sort(porCampo('apellidos', 'nombres', 'id_paciente'));
      return {
        elementos: coincidencias.slice(desplazamiento, desplazamiento + limite),
        total: coincidencias.length,
      };
    },

    async actualizar(id, cambios, actor) {
      if (!esIdValido(id)) throw new NoEncontrado('El paciente no existe.');
      return cn.transaccion(async (tx) => {
        const snap = await exigirPaciente(tx, id);
        const actual = snap.data();
        const set = elegir(cambios, COLUMNAS_PACIENTE);
        if (cambios.telefonos) set.telefonos = telefonos(cambios.telefonos);
        if (cambios.correos) set.correos = correos(cambios.correos);
        if (cambios.contactos_emergencia) set.contactos_emergencia = contactos(cambios.contactos_emergencia);
        if (cambios.representantes) set.representantes = representantes(cambios.representantes);

        // Cambiar el documento de identidad mueve su clave de unicidad.
        const cambiaDpi = set.dpi_o_documento !== undefined && set.dpi_o_documento !== actual.dpi_o_documento;
        if (cambiaDpi && set.dpi_o_documento) await exigirLibre(tx, [refUnico('dpi', set.dpi_o_documento)]);

        if (Object.keys(set).length > 0) tx.update(refPaciente(id), set);
        if (cambiaDpi) {
          if (actual.dpi_o_documento) tx.delete(refUnico('dpi', actual.dpi_o_documento));
          if (set.dpi_o_documento) tx.create(refUnico('dpi', set.dpi_o_documento), { id_paciente: id });
        }
        auditar(tx, actor, 'ACTUALIZAR', 'Paciente', id);
        return pacienteAContrato({ id, data: () => ({ ...actual, ...set }) });
      });
    },

    async archivar(id, { estado, motivo, fecha }, actor) {
      if (!esIdValido(id)) throw new NoEncontrado('El paciente no existe.');
      return cn.transaccion(async (tx) => {
        const snap = await exigirPaciente(tx, id);
        const actual = snap.data();
        // Paciente e historial son el mismo documento: se cambian juntos.
        tx.update(refPaciente(id), {
          estado,
          motivo_baja: motivo,
          'historial.estado': 'Archivado',
          'historial.fecha_cierre': fecha,
          'historial.motivo_cierre': motivo,
        });
        auditar(tx, actor, 'ARCHIVAR', 'Paciente', id);
        return pacienteAContrato({
          id,
          data: () => ({
            ...actual,
            estado,
            motivo_baja: motivo,
            historial: { ...actual.historial, estado: 'Archivado', fecha_cierre: fecha, motivo_cierre: motivo },
          }),
        });
      });
    },
  };

  // --- historiales ---

  const alergiaAContrato = (snap) => limpiar(snap.data());
  const ordenarAlergias = (lista) => [...lista].sort((a, b) => a.sustancia.localeCompare(b.sustancia, 'es'));

  const historiales = {
    async obtenerCompleto(idPaciente) {
      if (!esIdValido(idPaciente)) return null;
      const ref = refPaciente(idPaciente);
      const snap = await ref.get();
      if (!snap.exists) return null;
      const [alergias, antecedentes, consultas] = await Promise.all([
        ref.collection('alergias').get(),
        ref.collection('antecedentes').get(),
        col('consultas').where('id_paciente', '==', idPaciente).get(),
      ]);
      return {
        historial: historialAContrato(idPaciente, snap.data().historial),
        antecedentes: antecedentes.docs
          .map((d) => d.data())
          .sort(porCampoDesc('fecha_registro', '_creada_en'))
          .map(limpiar),
        alergias: ordenarAlergias(alergias.docs.map(alergiaAContrato)),
        consultas: consultas.docs
          .map((d) => ({ id: d.id, datos: d.data() }))
          .sort((a, b) => porCampoDesc('fecha_hora', '_creada_en')(a.datos, b.datos))
          .map(({ id, datos }) => aContrato(id, 'id_consulta', datos)),
      };
    },

    async listarAlergias(idPaciente) {
      if (!esIdValido(idPaciente)) throw new NoEncontrado('El paciente no existe.');
      const ref = refPaciente(idPaciente);
      if (!(await ref.get()).exists) throw new NoEncontrado('El paciente no existe.');
      return ordenarAlergias((await ref.collection('alergias').get()).docs.map(alergiaAContrato));
    },

    agregarAlergia: (idPaciente, datos, actor) => cn.transaccion(async (tx) => {
      await exigirPaciente(tx, idPaciente);
      const catalogo = await exigirReferencia(tx, 'catalogo_alergia', datos.id_catalogo_alergia, 'id_catalogo_alergia');
      // El ID del documento es el del catálogo: una alergia por sustancia, sin repetir.
      const ref = refPaciente(idPaciente).collection('alergias').doc(catalogo.id);
      if ((await tx.get(ref)).exists) throw new RegistroDuplicado('Ya existe un registro con esos datos.');

      const alergia = {
        id_catalogo_alergia: catalogo.id,
        sustancia: catalogo.data().sustancia,
        tipo_alergia: catalogo.data().tipo_alergia,
        reaccion: datos.reaccion ?? null,
        nivel_gravedad: datos.nivel_gravedad ?? null,
        fecha_registro: datos.fecha_registro ?? null,
        observaciones: datos.observaciones ?? null,
      };
      tx.create(ref, alergia);
      auditar(tx, actor, 'CREAR', 'Historial_Alergia', idPaciente, catalogo.id);
      return alergia;
    }),

    agregarAntecedente: (idPaciente, datos, actor) => cn.transaccion(async (tx) => {
      await exigirPaciente(tx, idPaciente);
      const id = nuevoId();
      const antecedente = {
        id_antecedente: id,
        tipo_antecedente: datos.tipo_antecedente,
        descripcion: datos.descripcion,
        fecha_registro: datos.fecha_registro ?? null,
        estado: datos.estado ?? null,
        observaciones: datos.observaciones ?? null,
        _creada_en: marcaDeCreacion(),
      };
      tx.create(refPaciente(idPaciente).collection('antecedentes').doc(id), antecedente);
      auditar(tx, actor, 'CREAR', 'Antecedente_Medico', id);
      return limpiar(antecedente);
    }),
  };

  // --- citas ---

  const citaAContrato = (snap) => aTextoInstitucion(aContrato(snap.id, 'id_cita', snap.data()));
  const claveCita = (c) => `${c.id_paciente}|${c.id_usuario_profesional}|${c.fecha_hora}`;

  const citas = {
    crear: (datos, actor) => cn.transaccion(async (tx) => {
      await exigirReferencia(tx, 'pacientes', datos.id_paciente, 'id_paciente');
      await exigirReferencia(tx, 'usuarios', datos.id_usuario_profesional, 'id_usuario_profesional');

      const cita = {
        id_paciente: String(datos.id_paciente),
        id_institucion: comoIdInstitucion(datos.id_institucion),
        id_usuario_profesional: String(datos.id_usuario_profesional),
        fecha_hora: datos.fecha_hora,
        motivo_consulta: datos.motivo_consulta ?? null,
        estado: 'Programada',
        observaciones: datos.observaciones ?? null,
        fecha_creacion: hoy(),
      };
      // Una cita Programada idéntica ocupa una clave de unicidad; dos envíos simultáneos
      // compiten por ella y Firestore reintenta al perdedor, que entonces la encuentra tomada.
      const marca = refUnico('cita', claveCita(cita));
      await exigirLibre(tx, [marca], 'El paciente ya tiene una cita idéntica programada.');
      await exigirHorarioCitaLibre(tx, {
        idCita: null, idPaciente: datos.id_paciente, idProfesional: datos.id_usuario_profesional, fechaHora: datos.fecha_hora,
      });
      bloquearAgenda(tx, datos.id_paciente, datos.id_usuario_profesional);

      const id = nuevoId();
      tx.create(col('citas').doc(id), cita);
      tx.create(marca, { id_cita: id });
      auditar(tx, actor, 'CREAR', 'Cita', id);
      return aContrato(id, 'id_cita', cita);
    }),

    async obtener(id) {
      if (!esIdValido(id)) return null;
      const snap = await col('citas').doc(id).get();
      return snap.exists ? citaAContrato(snap) : null;
    },

    async listar(filtros) {
      let consulta = col('citas');
      // Un solo filtro por igualdad en el servidor; el resto en memoria evita índices compuestos.
      const idPaciente = filtros.id_paciente && String(filtros.id_paciente);
      const idProfesional = filtros.id_usuario_profesional && String(filtros.id_usuario_profesional);
      if (idPaciente && !esIdValido(idPaciente)) return [];
      if (idProfesional && !esIdValido(idProfesional)) return [];
      if (idPaciente) consulta = consulta.where('id_paciente', '==', idPaciente);
      else if (idProfesional) consulta = consulta.where('id_usuario_profesional', '==', idProfesional);

      return (await consulta.get()).docs.map(citaAContrato)
        .filter((c) => (!idProfesional || c.id_usuario_profesional === idProfesional)
          && (!filtros.estado || c.estado === comoTexto(filtros.estado))
          && (!filtros.desde || c.fecha_hora >= filtros.desde)
          && (!filtros.hasta || c.fecha_hora <= filtros.hasta))
        .sort(porCampo('fecha_hora', 'id_cita'));
    },

    async actualizar(id, cambios, actor) {
      if (!esIdValido(id)) throw new NoEncontrado('La cita no existe.');
      return cn.transaccion(async (tx) => {
        const ref = col('citas').doc(id);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new NoEncontrado('La cita no existe.');
        const actual = snap.data();

        const set = elegir(cambios, ['fecha_hora', 'motivo_consulta', 'observaciones', 'estado']);
        if (cambios.id_usuario_profesional !== undefined) {
          await exigirReferencia(tx, 'usuarios', cambios.id_usuario_profesional, 'id_usuario_profesional');
          set.id_usuario_profesional = String(cambios.id_usuario_profesional);
        }
        const nueva = { ...actual, ...set };

        // La clave de unicidad solo existe mientras la cita está Programada.
        const marcaAnterior = actual.estado === 'Programada' ? refUnico('cita', claveCita({ ...actual })) : null;
        const marcaNueva = nueva.estado === 'Programada' ? refUnico('cita', claveCita(nueva)) : null;
        const cambiaMarca = marcaAnterior?.path !== marcaNueva?.path;
        if (cambiaMarca && marcaNueva) {
          await exigirLibre(tx, [marcaNueva], 'El paciente ya tiene una cita idéntica programada.');
        }

        const reubica = nueva.estado === 'Programada'
          && (set.fecha_hora !== undefined || set.id_usuario_profesional !== undefined);
        if (reubica) {
          await exigirHorarioCitaLibre(tx, {
            idCita: id, idPaciente: actual.id_paciente, idProfesional: nueva.id_usuario_profesional, fechaHora: nueva.fecha_hora,
          });
          bloquearAgenda(tx, actual.id_paciente, nueva.id_usuario_profesional);
        }

        if (Object.keys(set).length > 0) tx.update(ref, set);
        if (cambiaMarca) {
          if (marcaAnterior) tx.delete(marcaAnterior);
          if (marcaNueva) tx.create(marcaNueva, { id_cita: id });
        }
        auditar(tx, actor, 'ACTUALIZAR', 'Cita', id);
        return aContrato(id, 'id_cita', nueva);
      });
    },
  };

  // --- consultas ---

  const consultaAContrato = (snap) => aContrato(snap.id, 'id_consulta', snap.data());

  async function resolverDiagnosticos(tx, diagnosticos = []) {
    const resueltos = [];
    for (const d of diagnosticos) {
      const catalogo = await exigirReferencia(tx, 'catalogo_diagnostico', d.id_catalogo_diag, 'id_catalogo_diag');
      resueltos.push({
        id_catalogo_diag: catalogo.id,
        codigo_clinico: catalogo.data().codigo_clinico,
        nombre_diagnostico: catalogo.data().nombre_diagnostico,
        tipo: d.tipo ?? null,
        fecha_registro: d.fecha_registro ?? null,
        observaciones: d.observaciones ?? null,
      });
    }
    return resueltos;
  }

  async function resolverReceta(tx, receta) {
    const detalles = [];
    for (const d of receta.detalles) {
      const medicamento = await exigirReferencia(tx, 'medicamentos', d.id_medicamento, 'id_medicamento');
      detalles.push({
        id_detalle_receta: nuevoId(),
        id_medicamento: medicamento.id,
        nombre_medicamento: medicamento.data().nombre,
        dosis: d.dosis,
        frecuencia: d.frecuencia,
        via_administracion: d.via_administracion ?? null,
        duracion: d.duracion ?? null,
        indicaciones_especificas: d.indicaciones_especificas ?? null,
      });
    }
    return {
      id_receta: nuevoId(),
      fecha_receta: receta.fecha_receta ?? null,
      indicaciones_generales: receta.indicaciones_generales ?? null,
      detalles,
    };
  }

  const tratamientoDoc = (t) => ({
    id_tratamiento: nuevoId(),
    descripcion: t.descripcion,
    fecha_inicio: t.fecha_inicio ?? null,
    fecha_fin: t.fecha_fin ?? null,
    indicaciones: t.indicaciones ?? null,
    estado: t.estado ?? null,
  });

  async function exigirConsulta(tx, id) {
    if (!esIdValido(id)) throw new NoEncontrado('La consulta no existe.');
    const snap = await tx.get(col('consultas').doc(id));
    if (!snap.exists) throw new NoEncontrado('La consulta no existe.');
    return snap;
  }

  const consultas = {
    registrarAtencion: (datos, actor, { desde, hasta }) => cn.transaccion(async (tx) => {
      const pacienteSnap = await exigirPaciente(tx, datos.id_paciente);
      const paciente = pacienteSnap.data();

      // Lecturas: duplicado, referencias y cita. Se leen todas antes de escribir.
      const previas = (await tx.get(col('consultas').where('id_paciente', '==', datos.id_paciente))).docs;
      const duplicada = previas.some((d) => {
        const c = d.data();
        return c.id_usuario_profesional === actor.id_usuario && c.estado !== 'Anulada'
          && c.fecha_hora >= desde && c.fecha_hora <= hasta
          && c.motivo_consulta === (datos.motivo_consulta ?? null)
          && c.sintomas === (datos.sintomas ?? null)
          && c.notas_clinicas === (datos.notas_clinicas ?? null);
      });
      if (duplicada) throw new ConsultaDuplicada();
      await exigirHorarioConsultaLibre(tx, {
        idPaciente: datos.id_paciente, idProfesional: datos.id_usuario_profesional, fechaHora: datos.fecha_hora,
      });

      const diagnosticos = await resolverDiagnosticos(tx, datos.diagnosticos);
      const receta = datos.receta ? await resolverReceta(tx, datos.receta) : null;

      let refCita = null;
      let citaAtendida = null;
      if (datos.id_cita) {
        const citaSnap = esIdValido(String(datos.id_cita)) ? await tx.get(col('citas').doc(String(datos.id_cita))) : null;
        if (!citaSnap?.exists) throw new DatosInvalidos('id_cita hace referencia a un registro inexistente.');
        const cita = citaSnap.data();
        if (cita.id_paciente !== datos.id_paciente || cita.estado !== 'Programada') {
          throw new ReglaNegocio('La cita no está programada para este paciente.');
        }
        refCita = citaSnap.ref;
        citaAtendida = cita;
      }

      // Escrituras: la consulta y todo lo que la acompaña, o nada.
      const id = nuevoId();
      const consulta = {
        id_historial: paciente.historial.id_historial,
        id_paciente: datos.id_paciente,
        id_cita: datos.id_cita ? String(datos.id_cita) : null,
        id_usuario_profesional: datos.id_usuario_profesional,
        fecha_hora: datos.fecha_hora,
        motivo_consulta: datos.motivo_consulta ?? null,
        sintomas: datos.sintomas ?? null,
        examen_fisico: datos.examen_fisico ?? null,
        notas_clinicas: datos.notas_clinicas ?? null,
        estado: datos.estado,
        signos_vitales: datos.signos_vitales ? { ...datos.signos_vitales } : null,
        diagnosticos,
        tratamientos: (datos.tratamientos ?? []).map(tratamientoDoc),
        recetas: receta ? [receta] : [],
        _creada_en: marcaDeCreacion(),
      };
      // Escribir el paciente hace que dos consultas simultáneas choquen: Firestore reintenta
      // la perdedora y esta vuelve a evaluar el duplicado con la consulta ya confirmada.
      tx.update(pacienteSnap.ref, { version: FieldValue.increment(1) });
      tx.update(col('usuarios').doc(String(datos.id_usuario_profesional)), { version: FieldValue.increment(1) });
      tx.create(col('consultas').doc(id), consulta);
      if (refCita) {
        tx.update(refCita, { estado: 'Atendida' });
        // La cita deja de estar Programada: libera su clave de unicidad.
        tx.delete(refUnico('cita', claveCita(citaAtendida)));
      }
      auditar(tx, actor, 'CREAR', 'Consulta', id);
      return aContrato(id, 'id_consulta', consulta);
    }),

    async obtener(id) {
      if (!esIdValido(id)) return null;
      const snap = await col('consultas').doc(id).get();
      return snap.exists ? consultaAContrato(snap) : null;
    },

    async cambiarEstado(id, estado, actor) {
      return cn.transaccion(async (tx) => {
        const snap = await exigirConsulta(tx, id);
        tx.update(snap.ref, { estado });
        auditar(tx, actor, `ESTADO_${estado.toUpperCase()}`, 'Consulta', id);
        return aContrato(id, 'id_consulta', { ...snap.data(), estado });
      });
    },

    async agregarDiagnostico(id, datos, actor) {
      return cn.transaccion(async (tx) => {
        const snap = await exigirConsulta(tx, id);
        const [diagnostico] = await resolverDiagnosticos(tx, [datos]);
        const actual = snap.data();
        if (actual.diagnosticos.some((d) => d.id_catalogo_diag === diagnostico.id_catalogo_diag)) {
          throw new RegistroDuplicado('Ya existe un registro con esos datos.');
        }
        const diagnosticos = [...actual.diagnosticos, diagnostico];
        tx.update(snap.ref, { diagnosticos });
        auditar(tx, actor, 'CREAR', 'Diagnostico_Consulta', id, diagnostico.id_catalogo_diag);
        return aContrato(id, 'id_consulta', { ...actual, diagnosticos });
      });
    },

    async agregarTratamiento(id, datos, actor) {
      return cn.transaccion(async (tx) => {
        const snap = await exigirConsulta(tx, id);
        const tratamiento = tratamientoDoc(datos);
        const actual = snap.data();
        const tratamientos = [...actual.tratamientos, tratamiento];
        tx.update(snap.ref, { tratamientos });
        auditar(tx, actor, 'CREAR', 'Tratamiento', tratamiento.id_tratamiento);
        return aContrato(id, 'id_consulta', { ...actual, tratamientos });
      });
    },

    async agregarReceta(id, datos, actor) {
      return cn.transaccion(async (tx) => {
        const snap = await exigirConsulta(tx, id);
        const receta = await resolverReceta(tx, datos);
        const actual = snap.data();
        const recetas = [...actual.recetas, receta];
        tx.update(snap.ref, { recetas });
        auditar(tx, actor, 'CREAR', 'Receta', receta.id_receta);
        return aContrato(id, 'id_consulta', { ...actual, recetas });
      });
    },
  };

  // --- catálogos (pequeños: se leen completos y se filtran en memoria) ---

  const catalogos = {
    async diagnosticos({ texto } = {}) {
      const { docs } = await col('catalogo_diagnostico').get();
      return docs.map((d) => aContrato(d.id, 'id_catalogo_diag', d.data()))
        .filter((d) => !texto || contiene(d.nombre_diagnostico, texto) || contiene(d.codigo_clinico, texto))
        .sort(porCampo('nombre_diagnostico'));
    },

    async medicamentos({ ids } = {}) {
      if (ids) {
        const validos = [...new Set(ids.map(String).filter(esIdValido))];
        if (validos.length === 0) return [];
        const snaps = await db.getAll(...validos.map((id) => col('medicamentos').doc(id)));
        return snaps.filter((s) => s.exists).map((s) => aContrato(s.id, 'id_medicamento', s.data()));
      }
      const { docs } = await col('medicamentos').where('estado', '==', 'Activo').get();
      return docs.map((d) => aContrato(d.id, 'id_medicamento', d.data())).sort(porCampo('nombre'));
    },

    async alergias() {
      const { docs } = await col('catalogo_alergia').get();
      return docs.map((d) => aContrato(d.id, 'id_catalogo_alergia', d.data())).sort(porCampo('sustancia'));
    },
  };

  const salud = {
    async verificar() {
      await col('_salud').doc('ping').get();
    },
  };

  return {
    repositorios: { usuarios, pacientes, historiales, citas, consultas, catalogos, salud },
    herramientas: { col, refPaciente, nuevoId, auditar, exigirPaciente, exigirReferencia, esIdValido },
  };
}

module.exports = { crearRepositorios, esIdValido };
