// Adaptador de MongoDB (Laboratorio Clínico): contrato común del puerto.
//
// Modelo (ver docs/04-modelo-documental.md): REFERENCIACIÓN entre entidades que crecen sin
// límite (pacientes, historiales, consultas, órdenes y resultados, cada una en su colección) y
// EMBEBIDO solo para lo pequeño y acotado que siempre se lee junto con su dueño (teléfonos,
// contactos, alergias y antecedentes del historial; signos, diagnósticos, tratamientos y recetas
// de la consulta).
//
// Convenciones: los IDs se guardan como ObjectId y salen como string; las fechas se guardan en el
// formato del contrato ('YYYY-MM-DD' y 'YYYY-MM-DDTHH:MM:SS'), así que no hay Date que convertir.

const { ObjectId } = require('mongodb');
const {
  NoEncontrado, ReglaNegocio, RegistroDuplicado, ConsultaDuplicada, DatosInvalidos,
} = require('../../../domain/errores');
const { ahora, hoy } = require('../../../domain/fechas');
const { ROLES_PROFESIONALES } = require('../../../domain/roles');
const {
  COLUMNAS_PACIENTE, elegir, comoTexto, comoIdInstitucion, aTextoInstitucion, escaparRegex, registroAuditoria,
} = require('../nosql-comun/utilidades');

// --- IDs y conversión ---

const ES_OBJECT_ID = /^[0-9a-f]{24}$/i;

// Un ID con formato inválido equivale a "no existe", nunca a un error del driver.
const esIdValido = (id) => typeof id === 'string' && ES_OBJECT_ID.test(id);
const aOid = (id) => new ObjectId(id);
const nuevoOid = () => new ObjectId();

// ID enviado como referencia en el cuerpo de una petición.
function idReferencia(id, campo) {
  if (id === undefined || id === null) return null;
  if (!esIdValido(String(id))) throw new DatosInvalidos(`${campo} hace referencia a un registro inexistente.`);
  return aOid(String(id));
}

const esOid = (valor) => valor?._bsontype === 'ObjectId';

function convertir(valor) {
  if (esOid(valor)) return String(valor);
  if (Array.isArray(valor)) return valor.map(convertir);
  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, convertir(v)]));
  }
  return valor;
}

// Documento de Mongo => entidad del contrato. `_id` pasa a la columna de ID que usa el contrato
// y se descartan los campos internos (version).
function aContrato(documento, columnaId) {
  if (!documento) return null;
  const { _id, version, ...resto } = documento;
  const entidad = columnaId ? { [columnaId]: String(_id) } : {};
  for (const [campo, valor] of Object.entries(resto)) entidad[campo] = convertir(valor);
  return entidad;
}

const CAMPOS_USUARIO = ['id_institucion', 'nombres', 'apellidos', 'usuario', 'rol', 'estado'];
const usuarioAContrato = (u, conHash = false) => {
  if (!u) return null;
  const salida = { id_usuario: String(u._id), ...Object.fromEntries(CAMPOS_USUARIO.map((c) => [c, convertir(u[c] ?? null)])) };
  salida.id_institucion = salida.id_institucion === null ? null : String(salida.id_institucion);
  if (conHash) salida.contrasena_hash = u.contrasena_hash;
  return salida;
};

const pacienteAContrato = (p) => aContrato(p, 'id_paciente');

const CAMPOS_HISTORIAL = [
  'id_paciente', 'id_institucion', 'codigo_historial', 'fecha_apertura', 'estado',
  'fecha_cierre', 'motivo_cierre', 'observaciones',
];
const historialAContrato = (h) => aTextoInstitucion({
  id_historial: String(h._id),
  ...Object.fromEntries(CAMPOS_HISTORIAL.map((c) => [c, convertir(h[c] ?? null)])),
});

const consultaAContrato = (c) => aContrato(c, 'id_consulta');

// --- Colecciones del paciente (embebidas) ---

const telefonos = (lista = []) => lista.map(({ numero, tipo }) => ({ numero, tipo: tipo ?? null }));
const correos = (lista = []) => lista.map(({ correo }) => ({ correo }));

const contactos = (lista = []) => lista.map((c) => ({
  id_contacto: nuevoOid(),
  nombres: c.nombres,
  apellidos: c.apellidos,
  parentesco: c.parentesco ?? null,
  direccion: c.direccion ?? null,
  telefonos: telefonos(c.telefonos),
}));

const representantes = (lista = []) => lista.map((r) => ({
  id_representante: nuevoOid(),
  nombres: r.nombres,
  apellidos: r.apellidos,
  dpi: r.dpi ?? null,
  parentesco: r.parentesco ?? null,
  direccion: r.direccion ?? null,
  telefonos: telefonos(r.telefonos),
  correos: correos(r.correos),
}));

function escalaresPaciente(datos) {
  const salida = {};
  for (const campo of COLUMNAS_PACIENTE) salida[campo] = datos[campo] ?? null;
  return salida;
}

// --- Detalle de la consulta (embebido) ---

async function resolverDiagnosticos(db, sesion, diagnosticos = []) {
  const resueltos = [];
  for (const d of diagnosticos) {
    const id = idReferencia(d.id_catalogo_diag, 'id_catalogo_diag');
    const catalogo = id && await db.collection('catalogo_diagnostico').findOne({ _id: id }, { session: sesion });
    if (!catalogo) throw new DatosInvalidos('id_catalogo_diag hace referencia a un registro inexistente.');
    resueltos.push({
      id_catalogo_diag: id,
      codigo_clinico: catalogo.codigo_clinico,
      nombre_diagnostico: catalogo.nombre_diagnostico,
      tipo: d.tipo ?? null,
      fecha_registro: d.fecha_registro ?? null,
      observaciones: d.observaciones ?? null,
    });
  }
  return resueltos;
}

const tratamientoDoc = (t) => ({
  id_tratamiento: nuevoOid(),
  descripcion: t.descripcion,
  fecha_inicio: t.fecha_inicio ?? null,
  fecha_fin: t.fecha_fin ?? null,
  indicaciones: t.indicaciones ?? null,
  estado: t.estado ?? null,
});

async function resolverReceta(db, sesion, receta) {
  const detalles = [];
  for (const d of receta.detalles) {
    const id = idReferencia(d.id_medicamento, 'id_medicamento');
    const medicamento = id && await db.collection('medicamentos').findOne({ _id: id }, { session: sesion });
    if (!medicamento) throw new DatosInvalidos('id_medicamento hace referencia a un registro inexistente.');
    detalles.push({
      id_detalle_receta: nuevoOid(),
      id_medicamento: id,
      nombre_medicamento: medicamento.nombre,
      dosis: d.dosis,
      frecuencia: d.frecuencia,
      via_administracion: d.via_administracion ?? null,
      duracion: d.duracion ?? null,
      indicaciones_especificas: d.indicaciones_especificas ?? null,
    });
  }
  return {
    id_receta: nuevoOid(),
    fecha_receta: receta.fecha_receta ?? null,
    indicaciones_generales: receta.indicaciones_generales ?? null,
    detalles,
  };
}

// --- Repositorios ---

function crearRepositorios(cn) {
  const db = cn.db;
  const col = (nombre) => db().collection(nombre);

  const auditar = (sesion, actor, accion, entidad, idEntidad) =>
    col('auditoria').insertOne(registroAuditoria(actor, accion, entidad, idEntidad), { session: sesion });

  async function exigirHistorial(idPaciente, sesion) {
    const historial = esIdValido(idPaciente)
      ? await col('historiales').findOne({ id_paciente: aOid(idPaciente) }, { session: sesion })
      : null;
    if (!historial) throw new NoEncontrado('El paciente no existe.');
    return historial;
  }

  const usuarios = {
    // Una cadena fuerza igualdad: un objeto como { $ne: null } nunca llega a ser un operador.
    async buscarPorNombre(usuario) {
      if (typeof usuario !== 'string') return null;
      return usuarioAContrato(await col('usuarios').findOne({ usuario }), true);
    },
    async obtener(id) {
      return esIdValido(id) ? usuarioAContrato(await col('usuarios').findOne({ _id: aOid(id) })) : null;
    },
    async registrarAcceso(id, fechaHora) {
      if (esIdValido(id)) await col('usuarios').updateOne({ _id: aOid(id) }, { $set: { ultimo_acceso: fechaHora } });
    },
    async listarProfesionales() {
      const lista = await col('usuarios')
        .find({ estado: 'Activo', rol: { $in: ROLES_PROFESIONALES } })
        .sort({ apellidos: 1, nombres: 1 })
        .toArray();
      return lista.map((u) => usuarioAContrato(u));
    },
  };

  const pacientes = {
    crear: (datos, actor) => cn.transaccion(async (sesion) => {
      const idPaciente = nuevoOid();
      const idHistorial = nuevoOid();
      const paciente = {
        _id: idPaciente,
        ...escalaresPaciente(datos),
        fecha_registro: datos.fecha_registro,
        estado: 'Activo',
        motivo_baja: null,
        telefonos: telefonos(datos.telefonos),
        correos: correos(datos.correos),
        contactos_emergencia: contactos(datos.contactos_emergencia),
        representantes: representantes(datos.representantes),
        id_historial: idHistorial,
        codigo_historial: datos.codigo_historial,
      };
      // La unicidad del documento la garantiza el índice único parcial.
      await col('pacientes').insertOne(paciente, { session: sesion });
      await col('historiales').insertOne({
        _id: idHistorial,
        id_paciente: idPaciente,
        id_institucion: comoIdInstitucion(datos.id_institucion),
        codigo_historial: datos.codigo_historial,
        fecha_apertura: datos.fecha_registro,
        estado: 'Activo',
        fecha_cierre: null,
        motivo_cierre: null,
        observaciones: null,
        antecedentes: [],
        alergias: [],
        // Se incrementa para serializar escrituras concurrentes sobre un mismo historial.
        version: 0,
      }, { session: sesion });
      await auditar(sesion, actor, 'CREAR', 'Paciente', idPaciente);
      return pacienteAContrato(paciente);
    }),

    async obtener(id) {
      return esIdValido(id) ? pacienteAContrato(await col('pacientes').findOne({ _id: aOid(id) })) : null;
    },

    async buscar({ texto, estado, limite, desplazamiento }) {
      const filtro = {};
      if (texto) {
        const regex = { $regex: escaparRegex(texto), $options: 'i' };
        filtro.$or = [{ nombres: regex }, { apellidos: regex }, { dpi_o_documento: regex }];
      }
      if (estado) filtro.estado = comoTexto(estado);
      const [total, elementos] = await Promise.all([
        col('pacientes').countDocuments(filtro),
        col('pacientes').find(filtro).sort({ apellidos: 1, nombres: 1, _id: 1 }).skip(desplazamiento).limit(limite).toArray(),
      ]);
      return { elementos: elementos.map(pacienteAContrato), total };
    },

    async actualizar(id, cambios, actor) {
      if (!esIdValido(id)) throw new NoEncontrado('El paciente no existe.');
      return cn.transaccion(async (sesion) => {
        const set = elegir(cambios, COLUMNAS_PACIENTE);
        if (cambios.telefonos) set.telefonos = telefonos(cambios.telefonos);
        if (cambios.correos) set.correos = correos(cambios.correos);
        if (cambios.contactos_emergencia) set.contactos_emergencia = contactos(cambios.contactos_emergencia);
        if (cambios.representantes) set.representantes = representantes(cambios.representantes);

        const filtro = { _id: aOid(id) };
        // $set vacío no es válido en MongoDB: sin cambios solo se verifica que exista.
        const paciente = Object.keys(set).length > 0
          ? await col('pacientes').findOneAndUpdate(filtro, { $set: set }, { returnDocument: 'after', session: sesion })
          : await col('pacientes').findOne(filtro, { session: sesion });
        if (!paciente) throw new NoEncontrado('El paciente no existe.');
        await auditar(sesion, actor, 'ACTUALIZAR', 'Paciente', id);
        return pacienteAContrato(paciente);
      });
    },

    async archivar(id, { estado, motivo, fecha }, actor) {
      if (!esIdValido(id)) throw new NoEncontrado('El paciente no existe.');
      return cn.transaccion(async (sesion) => {
        const paciente = await col('pacientes').findOneAndUpdate(
          { _id: aOid(id) },
          { $set: { estado, motivo_baja: motivo } },
          { returnDocument: 'after', session: sesion },
        );
        if (!paciente) throw new NoEncontrado('El paciente no existe.');
        await col('historiales').updateOne(
          { id_paciente: aOid(id) },
          { $set: { estado: 'Archivado', fecha_cierre: fecha, motivo_cierre: motivo } },
          { session: sesion },
        );
        await auditar(sesion, actor, 'ARCHIVAR', 'Paciente', id);
        return pacienteAContrato(paciente);
      });
    },
  };

  const subdocumentoAContrato = (a) => aContrato(a);
  const ordenarAlergias = (lista) => [...lista].sort((a, b) => a.sustancia.localeCompare(b.sustancia, 'es'));

  const historiales = {
    async obtenerCompleto(idPaciente) {
      if (!esIdValido(idPaciente)) return null;
      const historial = await col('historiales').findOne({ id_paciente: aOid(idPaciente) });
      if (!historial) return null;
      const consultas = await col('consultas').find({ id_historial: historial._id }).sort({ fecha_hora: -1, _id: -1 }).toArray();
      const antecedentes = [...historial.antecedentes].sort(
        (a, b) => (b.fecha_registro ?? '').localeCompare(a.fecha_registro ?? '') || String(b.id_antecedente).localeCompare(String(a.id_antecedente)),
      );
      return {
        historial: historialAContrato(historial),
        antecedentes: antecedentes.map(subdocumentoAContrato),
        alergias: ordenarAlergias(historial.alergias).map(subdocumentoAContrato),
        consultas: consultas.map(consultaAContrato),
      };
    },

    async listarAlergias(idPaciente) {
      const historial = await exigirHistorial(idPaciente);
      return ordenarAlergias(historial.alergias).map(subdocumentoAContrato);
    },

    agregarAlergia: (idPaciente, datos, actor) => cn.transaccion(async (sesion) => {
      const historial = await exigirHistorial(idPaciente, sesion);
      const idAlergia = idReferencia(datos.id_catalogo_alergia, 'id_catalogo_alergia');
      const catalogo = idAlergia && await col('catalogo_alergia').findOne({ _id: idAlergia }, { session: sesion });
      if (!catalogo) throw new DatosInvalidos('id_catalogo_alergia hace referencia a un registro inexistente.');

      const alergia = {
        id_catalogo_alergia: idAlergia,
        sustancia: catalogo.sustancia,
        tipo_alergia: catalogo.tipo_alergia,
        reaccion: datos.reaccion ?? null,
        nivel_gravedad: datos.nivel_gravedad ?? null,
        fecha_registro: datos.fecha_registro ?? null,
        observaciones: datos.observaciones ?? null,
      };
      // El filtro $ne hace atómica la comprobación de "no repetir alergia".
      const { modifiedCount } = await col('historiales').updateOne(
        { _id: historial._id, 'alergias.id_catalogo_alergia': { $ne: idAlergia } },
        { $push: { alergias: alergia }, $inc: { version: 1 } },
        { session: sesion },
      );
      if (modifiedCount === 0) throw new RegistroDuplicado('Ya existe un registro con esos datos.');
      await auditar(sesion, actor, 'CREAR', 'Historial_Alergia', `${historial._id}-${idAlergia}`);
      return subdocumentoAContrato(alergia);
    }),

    agregarAntecedente: (idPaciente, datos, actor) => cn.transaccion(async (sesion) => {
      const historial = await exigirHistorial(idPaciente, sesion);
      const antecedente = {
        id_antecedente: nuevoOid(),
        tipo_antecedente: datos.tipo_antecedente,
        descripcion: datos.descripcion,
        fecha_registro: datos.fecha_registro ?? null,
        estado: datos.estado ?? null,
        observaciones: datos.observaciones ?? null,
      };
      await col('historiales').updateOne(
        { _id: historial._id },
        { $push: { antecedentes: antecedente }, $inc: { version: 1 } },
        { session: sesion },
      );
      await auditar(sesion, actor, 'CREAR', 'Antecedente_Medico', antecedente.id_antecedente);
      return subdocumentoAContrato(antecedente);
    }),
  };

  const citaAContrato = (c) => aTextoInstitucion(aContrato(c, 'id_cita'));

  const citas = {
    crear: (datos, actor) => cn.transaccion(async (sesion) => {
      const idPaciente = idReferencia(datos.id_paciente, 'id_paciente');
      const idProfesional = idReferencia(datos.id_usuario_profesional, 'id_usuario_profesional');
      // En una transacción las operaciones se hacen una a una, no en paralelo.
      const paciente = idPaciente && await col('pacientes').findOne({ _id: idPaciente }, { session: sesion, projection: { _id: 1 } });
      const profesional = idProfesional && await col('usuarios').findOne({ _id: idProfesional }, { session: sesion, projection: { _id: 1 } });
      if (!paciente) throw new DatosInvalidos('id_paciente hace referencia a un registro inexistente.');
      if (!profesional) throw new DatosInvalidos('id_usuario_profesional hace referencia a un registro inexistente.');

      const cita = {
        _id: nuevoOid(),
        id_paciente: idPaciente,
        id_institucion: comoIdInstitucion(datos.id_institucion),
        id_usuario_profesional: idProfesional,
        fecha_hora: datos.fecha_hora,
        motivo_consulta: datos.motivo_consulta ?? null,
        estado: 'Programada',
        observaciones: datos.observaciones ?? null,
        fecha_creacion: hoy(),
      };
      try {
        await col('citas').insertOne(cita, { session: sesion });
      } catch (error) {
        if (error?.code === 11000) throw new RegistroDuplicado('El paciente ya tiene una cita idéntica programada.');
        throw error;
      }
      await auditar(sesion, actor, 'CREAR', 'Cita', cita._id);
      return citaAContrato(cita);
    }),

    async obtener(id) {
      return esIdValido(id) ? citaAContrato(await col('citas').findOne({ _id: aOid(id) })) : null;
    },

    async listar(filtros) {
      const filtro = {};
      for (const campo of ['id_paciente', 'id_usuario_profesional']) {
        if (filtros[campo]) {
          if (!esIdValido(String(filtros[campo]))) return [];
          filtro[campo] = aOid(String(filtros[campo]));
        }
      }
      if (filtros.estado) filtro.estado = comoTexto(filtros.estado);
      if (filtros.desde || filtros.hasta) {
        filtro.fecha_hora = {};
        if (filtros.desde) filtro.fecha_hora.$gte = comoTexto(filtros.desde);
        if (filtros.hasta) filtro.fecha_hora.$lte = comoTexto(filtros.hasta);
      }
      return (await col('citas').find(filtro).sort({ fecha_hora: 1, _id: 1 }).toArray()).map(citaAContrato);
    },

    async actualizar(id, cambios, actor) {
      if (!esIdValido(id)) throw new NoEncontrado('La cita no existe.');
      return cn.transaccion(async (sesion) => {
        const set = elegir(cambios, ['fecha_hora', 'motivo_consulta', 'observaciones', 'estado']);
        if (cambios.id_usuario_profesional !== undefined) {
          set.id_usuario_profesional = idReferencia(cambios.id_usuario_profesional, 'id_usuario_profesional');
        }
        const filtro = { _id: aOid(id) };
        const cita = Object.keys(set).length > 0
          ? await col('citas').findOneAndUpdate(filtro, { $set: set }, { returnDocument: 'after', session: sesion })
          : await col('citas').findOne(filtro, { session: sesion });
        if (!cita) throw new NoEncontrado('La cita no existe.');
        await auditar(sesion, actor, 'ACTUALIZAR', 'Cita', id);
        return citaAContrato(cita);
      });
    },
  };

  const consultas = {
    registrarAtencion: (datos, actor, { desde, hasta }) => cn.transaccion(async (sesion) => {
      if (!esIdValido(datos.id_paciente)) throw new NoEncontrado('El paciente no existe.');
      // Escribir primero en el historial serializa los envíos simultáneos: el segundo choca,
      // la transacción se reintenta y entonces ya ve la consulta del primero.
      const historial = await col('historiales').findOneAndUpdate(
        { id_paciente: aOid(datos.id_paciente) },
        { $inc: { version: 1 } },
        { session: sesion },
      );
      if (!historial) throw new NoEncontrado('El paciente no existe.');

      const duplicada = await col('consultas').findOne({
        id_historial: historial._id,
        id_usuario_profesional: aOid(actor.id_usuario),
        estado: { $ne: 'Anulada' },
        fecha_hora: { $gte: desde, $lte: hasta },
        // La igualdad con null también cubre los campos ausentes.
        motivo_consulta: datos.motivo_consulta ?? null,
        sintomas: datos.sintomas ?? null,
        notas_clinicas: datos.notas_clinicas ?? null,
      }, { session: sesion, projection: { _id: 1 } });
      if (duplicada) throw new ConsultaDuplicada();

      // Todo se resuelve y valida antes de escribir: una referencia inexistente revierte la unidad.
      const diagnosticos = await resolverDiagnosticos(db(), sesion, datos.diagnosticos);
      const receta = datos.receta ? await resolverReceta(db(), sesion, datos.receta) : null;

      if (datos.id_cita) {
        const idCita = idReferencia(datos.id_cita, 'id_cita');
        const { modifiedCount } = await col('citas').updateOne(
          { _id: idCita, id_paciente: aOid(datos.id_paciente), estado: 'Programada' },
          { $set: { estado: 'Atendida' } },
          { session: sesion },
        );
        if (modifiedCount === 0) throw new ReglaNegocio('La cita no está programada para este paciente.');
      }

      const consulta = {
        _id: nuevoOid(),
        id_historial: historial._id,
        id_paciente: aOid(datos.id_paciente),
        id_cita: datos.id_cita ? aOid(datos.id_cita) : null,
        id_usuario_profesional: idReferencia(datos.id_usuario_profesional, 'id_usuario_profesional'),
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
      };
      await col('consultas').insertOne(consulta, { session: sesion });
      await auditar(sesion, actor, 'CREAR', 'Consulta', consulta._id);
      return consultaAContrato(consulta);
    }),

    async obtener(id) {
      return esIdValido(id) ? consultaAContrato(await col('consultas').findOne({ _id: aOid(id) })) : null;
    },

    async cambiarEstado(id, estado, actor) {
      if (!esIdValido(id)) throw new NoEncontrado('La consulta no existe.');
      return cn.transaccion(async (sesion) => {
        const consulta = await col('consultas').findOneAndUpdate(
          { _id: aOid(id) }, { $set: { estado } }, { returnDocument: 'after', session: sesion },
        );
        if (!consulta) throw new NoEncontrado('La consulta no existe.');
        await auditar(sesion, actor, `ESTADO_${estado.toUpperCase()}`, 'Consulta', id);
        return consultaAContrato(consulta);
      });
    },

    async agregarDiagnostico(id, datos, actor) {
      if (!esIdValido(id)) throw new NoEncontrado('La consulta no existe.');
      return cn.transaccion(async (sesion) => {
        const [diagnostico] = await resolverDiagnosticos(db(), sesion, [datos]);
        const { matchedCount, modifiedCount } = await col('consultas').updateOne(
          { _id: aOid(id), 'diagnosticos.id_catalogo_diag': { $ne: diagnostico.id_catalogo_diag } },
          { $push: { diagnosticos: diagnostico } },
          { session: sesion },
        );
        if (matchedCount === 0) {
          if (!await col('consultas').findOne({ _id: aOid(id) }, { session: sesion, projection: { _id: 1 } })) {
            throw new NoEncontrado('La consulta no existe.');
          }
          throw new RegistroDuplicado('Ya existe un registro con esos datos.');
        }
        if (modifiedCount === 0) throw new RegistroDuplicado('Ya existe un registro con esos datos.');
        await auditar(sesion, actor, 'CREAR', 'Diagnostico_Consulta', `${id}-${diagnostico.id_catalogo_diag}`);
        return consultaAContrato(await col('consultas').findOne({ _id: aOid(id) }, { session: sesion }));
      });
    },

    async agregarTratamiento(id, datos, actor) {
      if (!esIdValido(id)) throw new NoEncontrado('La consulta no existe.');
      return cn.transaccion(async (sesion) => {
        const tratamiento = tratamientoDoc(datos);
        const consulta = await col('consultas').findOneAndUpdate(
          { _id: aOid(id) }, { $push: { tratamientos: tratamiento } }, { returnDocument: 'after', session: sesion },
        );
        if (!consulta) throw new NoEncontrado('La consulta no existe.');
        await auditar(sesion, actor, 'CREAR', 'Tratamiento', tratamiento.id_tratamiento);
        return consultaAContrato(consulta);
      });
    },

    async agregarReceta(id, datos, actor) {
      if (!esIdValido(id)) throw new NoEncontrado('La consulta no existe.');
      return cn.transaccion(async (sesion) => {
        const receta = await resolverReceta(db(), sesion, datos);
        const consulta = await col('consultas').findOneAndUpdate(
          { _id: aOid(id) }, { $push: { recetas: receta } }, { returnDocument: 'after', session: sesion },
        );
        if (!consulta) throw new NoEncontrado('La consulta no existe.');
        await auditar(sesion, actor, 'CREAR', 'Receta', receta.id_receta);
        return consultaAContrato(consulta);
      });
    },
  };

  const catalogos = {
    async diagnosticos({ texto } = {}) {
      const filtro = {};
      if (texto) {
        const regex = { $regex: escaparRegex(texto), $options: 'i' };
        filtro.$or = [{ nombre_diagnostico: regex }, { codigo_clinico: regex }];
      }
      const lista = await col('catalogo_diagnostico').find(filtro).sort({ nombre_diagnostico: 1 }).toArray();
      return lista.map((d) => aContrato(d, 'id_catalogo_diag'));
    },

    async medicamentos({ ids } = {}) {
      if (ids) {
        const validos = ids.filter((id) => esIdValido(String(id))).map((id) => aOid(String(id)));
        if (validos.length === 0) return [];
        return (await col('medicamentos').find({ _id: { $in: validos } }).toArray()).map((m) => aContrato(m, 'id_medicamento'));
      }
      return (await col('medicamentos').find({ estado: 'Activo' }).sort({ nombre: 1 }).toArray())
        .map((m) => aContrato(m, 'id_medicamento'));
    },

    async alergias() {
      return (await col('catalogo_alergia').find().sort({ sustancia: 1 }).toArray())
        .map((a) => aContrato(a, 'id_catalogo_alergia'));
    },
  };

  const salud = {
    async verificar() {
      await db().command({ ping: 1 });
    },
  };

  return { usuarios, pacientes, historiales, citas, consultas, catalogos, salud, cerrar: cn.cerrar };
}

module.exports = {
  crearRepositorios, esIdValido, aOid, nuevoOid, idReferencia, aContrato, convertir,
};
