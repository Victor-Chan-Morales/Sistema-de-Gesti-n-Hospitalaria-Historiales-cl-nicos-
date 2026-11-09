// Puerto propio del Laboratorio Clínico (ports/repositoriosEspecializados.js).
//
// Referenciación: la orden y sus resultados son colecciones distintas porque un paciente acumula
// cientos de exámenes y cada resultado tiene una estructura distinta según el tipo de examen.
// Dentro de la orden se embeben solo sus exámenes solicitados (pocos y siempre leídos con ella).
// Guardar un resultado y actualizar el estado de su orden es una transacción multi-documento.

const {
  NoEncontrado, ReglaNegocio, RegistroDuplicado, DatosInvalidos,
} = require('../../../domain/errores');
const laboratorio = require('../../../domain/laboratorio');
const { comoTexto, escaparRegex, registroAuditoria } = require('../nosql-comun/utilidades');
const { esIdValido, aOid, nuevoOid, idReferencia, aContrato } = require('./repositorios');

const tipoExamenAContrato = (t) => aContrato(t, 'id_tipo_examen');
const resultadoAContrato = (r) => aContrato(r, 'id_resultado');

function ordenAContrato(orden, resultados = []) {
  return {
    ...aContrato(orden, 'id_orden_laboratorio'),
    resultados: resultados.map(resultadoAContrato),
  };
}

function crearLaboratorio(cn) {
  const col = (nombre) => cn.db().collection(nombre);
  // Mismo criterio que el resto de MongoDB: los IDs de auditoría son ObjectId.
  const auditar = (sesion, actor, accion, entidad, id) =>
    col('auditoria').insertOne(registroAuditoria(actor, accion, entidad, id, { comoId: aOid }), { session: sesion });

  const resultadosDe = (idsOrden, sesion) => col('resultados_laboratorio')
    .find({ id_orden_laboratorio: { $in: idsOrden } }, { session: sesion })
    .sort({ fecha_resultado: 1, _id: 1 })
    .toArray();

  async function cargarOrden(id, sesion) {
    const orden = await col('ordenes_laboratorio').findOne({ _id: id }, { session: sesion });
    if (!orden) return null;
    return ordenAContrato(orden, await resultadosDe([id], sesion));
  }

  const examenes = {
    async listarTipos({ texto } = {}) {
      const filtro = { estado: 'Activo' };
      if (texto) filtro.nombre = { $regex: escaparRegex(texto), $options: 'i' };
      return (await col('tipos_examen').find(filtro).sort({ nombre: 1 }).toArray()).map(tipoExamenAContrato);
    },

    crearOrden: (datos, actor, { desde, hasta }) => cn.transaccion(async (sesion) => {
      if (!esIdValido(datos.id_paciente)) throw new NoEncontrado('El paciente no existe.');
      // Serializa órdenes simultáneas del mismo paciente (mismo mecanismo que las consultas).
      const historial = await col('historiales').findOneAndUpdate(
        { id_paciente: aOid(datos.id_paciente) }, { $inc: { version: 1 } }, { session: sesion },
      );
      if (!historial) throw new NoEncontrado('El paciente no existe.');

      const ids = datos.examenes.map((id) => idReferencia(id, 'examenes'));
      const tipos = await col('tipos_examen').find({ _id: { $in: ids }, estado: 'Activo' }, { session: sesion }).toArray();
      if (tipos.length !== ids.length) throw new DatosInvalidos('examenes hace referencia a un examen inexistente o inactivo.');

      const idsOrdenados = ids.map(String).sort();
      const identica = await col('ordenes_laboratorio').findOne({
        id_historial: historial._id,
        estado: { $ne: 'Cancelada' },
        fecha_orden: { $gte: desde, $lte: hasta },
        prioridad: datos.prioridad,
        observaciones: datos.observaciones ?? null,
        'examenes.id_tipo_examen': { $all: ids },
        examenes: { $size: ids.length },
      }, { session: sesion, projection: { _id: 1 } });
      if (identica) throw new RegistroDuplicado('Ya se registró una orden idéntica hace un momento.');

      const orden = {
        _id: nuevoOid(),
        id_historial: historial._id,
        id_paciente: aOid(datos.id_paciente),
        id_usuario_solicitante: datos.id_usuario_solicitante ? idReferencia(datos.id_usuario_solicitante, 'id_usuario_solicitante') : null,
        fecha_orden: datos.fecha_orden,
        prioridad: datos.prioridad,
        estado: 'Pendiente',
        observaciones: datos.observaciones ?? null,
        examenes: idsOrdenados.map((id) => {
          const tipo = tipos.find((t) => String(t._id) === id);
          return { id_tipo_examen: tipo._id, nombre: tipo.nombre, tipo_muestra: tipo.tipo_muestra ?? null };
        }),
      };
      await col('ordenes_laboratorio').insertOne(orden, { session: sesion });
      await auditar(sesion, actor, 'CREAR', 'Orden_Laboratorio', orden._id);
      return ordenAContrato(orden);
    }),

    async obtenerOrden(id) {
      return esIdValido(id) ? cargarOrden(aOid(id)) : null;
    },

    async listarOrdenes({ id_paciente: idPaciente, estado } = {}) {
      const filtro = {};
      if (idPaciente) {
        if (!esIdValido(String(idPaciente))) return [];
        filtro.id_paciente = aOid(String(idPaciente));
      }
      if (estado) filtro.estado = comoTexto(estado);
      const ordenes = await col('ordenes_laboratorio').find(filtro).sort({ fecha_orden: -1, _id: -1 }).toArray();
      const resultados = ordenes.length > 0 ? await resultadosDe(ordenes.map((o) => o._id)) : [];
      return ordenes.map((o) => ordenAContrato(o, resultados.filter((r) => String(r.id_orden_laboratorio) === String(o._id))));
    },

    async cambiarEstadoOrden(id, estado, actor) {
      if (!esIdValido(id)) throw new NoEncontrado('La orden no existe.');
      return cn.transaccion(async (sesion) => {
        const { matchedCount } = await col('ordenes_laboratorio').updateOne(
          { _id: aOid(id) }, { $set: { estado } }, { session: sesion },
        );
        if (matchedCount === 0) throw new NoEncontrado('La orden no existe.');
        await auditar(sesion, actor, `ESTADO_${estado.toUpperCase().replace(' ', '_')}`, 'Orden_Laboratorio', id);
        return cargarOrden(aOid(id), sesion);
      });
    },

    async registrarResultado(id, datos, actor) {
      if (!esIdValido(id)) throw new NoEncontrado('La orden no existe.');
      return cn.transaccion(async (sesion) => {
        const orden = await col('ordenes_laboratorio').findOne({ _id: aOid(id) }, { session: sesion });
        if (!orden) throw new NoEncontrado('La orden no existe.');
        // La comprobación y la escritura van en la misma transacción: una orden cancelada
        // concurrentemente no recibe el resultado.
        laboratorio.exigirOrdenAbierta(orden);
        const idTipo = idReferencia(datos.id_tipo_examen, 'id_tipo_examen');
        if (!orden.examenes.some((e) => String(e.id_tipo_examen) === String(idTipo))) {
          throw new ReglaNegocio('El examen no forma parte de la orden.');
        }

        const resultado = {
          _id: nuevoOid(),
          id_orden_laboratorio: orden._id,
          id_tipo_examen: idTipo,
          id_historial: orden.id_historial,
          id_paciente: orden.id_paciente,
          fecha_toma_muestra: datos.fecha_toma_muestra ?? null,
          fecha_resultado: datos.fecha_resultado,
          resultado_general: datos.resultado_general ?? null,
          // Estructura variable según el examen: una lista de parámetros propia de cada tipo.
          valores_detallados: (datos.valores_detallados ?? []).map((v) => ({
            parametro: v.parametro,
            valor: v.valor,
            unidad: v.unidad ?? null,
            rango_referencia: v.rango_referencia ?? null,
          })),
          observaciones: datos.observaciones ?? null,
          id_usuario_laboratorista: aOid(actor.id_usuario),
        };
        try {
          await col('resultados_laboratorio').insertOne(resultado, { session: sesion });
        } catch (error) {
          if (error?.code === 11000) throw new RegistroDuplicado('Ese examen ya tiene un resultado registrado.');
          throw error;
        }

        const registrados = await col('resultados_laboratorio').countDocuments({ id_orden_laboratorio: orden._id }, { session: sesion });
        const estado = registrados >= orden.examenes.length ? 'Finalizada' : 'En proceso';
        await col('ordenes_laboratorio').updateOne({ _id: orden._id }, { $set: { estado } }, { session: sesion });
        await auditar(sesion, actor, 'CREAR', 'Resultado_Laboratorio', resultado._id);
        return cargarOrden(orden._id, sesion);
      });
    },
  };

  return { examenes };
}

module.exports = { crearLaboratorio };
