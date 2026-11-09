const { NoEncontrado, ReglaNegocio, RegistroDuplicado, ConsultaDuplicada, ConflictoHorario } = require('../../../domain/errores');
const { ahora, hoy } = require('../../../domain/fechas');
const { ROLES_PROFESIONALES } = require('../../../domain/roles');
const { esIdValido, idReferencia, envolverRepositorios } = require('../sql-comun/mapeadores');

const COLUMNAS_PACIENTE = [
  'nombres', 'apellidos', 'dpi_o_documento', 'fecha_nacimiento', 'sexo', 'direccion',
  'estado_civil', 'ocupacion', 'tipo_sangre',
];
const COLUMNAS_USUARIO = 'id_usuario, id_institucion, nombres, apellidos, usuario, rol, estado';
const SELECT_PACIENTE = `
  SELECT p.*, h.id_historial, h.codigo_historial
  FROM Paciente p LEFT JOIN Historial_Clinico h ON h.id_paciente = p.id_paciente`;

const elegir = (origen, columnas) => {
  const destino = {};
  for (const c of columnas) if (origen[c] !== undefined) destino[c] = origen[c];
  return destino;
};

const escaparLike = (texto) => `%${texto.replace(/[\\%_]/g, '\\$&')}%`;

function auditar(cx, actor, accion, entidad, idEntidad) {
  return cx.insertar('Auditoria', {
    id_usuario: actor.id_usuario,
    accion,
    entidad,
    id_entidad: String(idEntidad),
    fecha_hora: ahora(),
  });
}

// --- Agenda: choques de horario ---

const MENSAJE_CITA_PROFESIONAL = 'El profesional ya tiene una cita programada a esa misma hora.';
const MENSAJE_CITA_PACIENTE = 'El paciente ya tiene una cita programada a esa misma hora.';
const MENSAJE_CONSULTA_PROFESIONAL = 'El profesional ya tiene una consulta registrada a esa misma hora.';
const MENSAJE_CONSULTA_PACIENTE = 'El paciente ya tiene una consulta registrada a esa misma hora.';

// Bloquea la fila del profesional: dos atenciones suyas se validan una después de otra.
// Orden fijo de bloqueos en todo el adaptador: primero el paciente, luego el profesional.
async function bloquearProfesional(cx, idProfesional) {
  if (!esIdValido(idProfesional)) return;
  await cx.unica('SELECT id_usuario FROM Usuario WHERE id_usuario = ? FOR UPDATE', [idProfesional]);
}

async function bloquearAgenda(cx, idPaciente, idProfesional) {
  await cx.unica('SELECT id_paciente FROM Paciente WHERE id_paciente = ? FOR UPDATE', [idPaciente]);
  await bloquearProfesional(cx, idProfesional);
}

// Regla: un profesional, o un paciente, no puede tener dos citas Programadas a la misma hora.
async function exigirHorarioCitaLibre(cx, { idCita, idPaciente, idProfesional, fechaHora }) {
  const choque = await cx.unica(
    `SELECT id_usuario_profesional FROM Cita
     WHERE estado = 'Programada' AND fecha_hora = ? AND id_cita <> ?
       AND (id_usuario_profesional = ? OR id_paciente = ?)
     LIMIT 1`,
    [fechaHora, idCita ?? 0, idProfesional, idPaciente],
  );
  if (!choque) return;
  const delProfesional = String(choque.id_usuario_profesional) === String(idProfesional);
  throw new ConflictoHorario(delProfesional ? MENSAJE_CITA_PROFESIONAL : MENSAJE_CITA_PACIENTE);
}

// Regla: un profesional, o un paciente, no puede tener dos consultas a la misma hora.
async function exigirHorarioConsultaLibre(cx, { idHistorial, idProfesional, fechaHora }) {
  const choque = await cx.unica(
    `SELECT id_usuario_profesional FROM Consulta
     WHERE estado <> 'Anulada' AND fecha_hora = ?
       AND (id_usuario_profesional = ? OR id_historial = ?)
     LIMIT 1`,
    [fechaHora, idProfesional, idHistorial],
  );
  if (!choque) return;
  const delProfesional = String(choque.id_usuario_profesional) === String(idProfesional);
  throw new ConflictoHorario(delProfesional ? MENSAJE_CONSULTA_PROFESIONAL : MENSAJE_CONSULTA_PACIENTE);
}

// --- Colecciones del paciente ---

async function insertarTelefonos(cx, tabla, columnaDueno, idDueno, telefonos = []) {
  for (const { numero, tipo } of telefonos) {
    await cx.insertar(tabla, { [columnaDueno]: idDueno, numero, tipo });
  }
}

async function insertarCorreos(cx, tabla, columnaDueno, idDueno, correos = []) {
  for (const { correo } of correos) {
    await cx.insertar(tabla, { [columnaDueno]: idDueno, correo });
  }
}

async function insertarContactos(cx, idPaciente, contactos = []) {
  for (const contacto of contactos) {
    const { nombres, apellidos, parentesco, direccion, telefonos } = contacto;
    const id = await cx.insertar(
      'Contacto_Emergencia',
      { id_paciente: idPaciente, nombres, apellidos, parentesco, direccion },
      'id_contacto',
    );
    await insertarTelefonos(cx, 'Telefono_Contacto', 'id_contacto', id, telefonos);
  }
}

async function insertarRepresentantes(cx, idPaciente, representantes = []) {
  for (const representante of representantes) {
    const { nombres, apellidos, dpi, parentesco, direccion, telefonos, correos } = representante;
    const id = await cx.insertar(
      'Representante_Encargado',
      { id_paciente: idPaciente, nombres, apellidos, dpi, parentesco, direccion },
      'id_representante',
    );
    await insertarTelefonos(cx, 'Telefono_Representante', 'id_representante', id, telefonos);
    await insertarCorreos(cx, 'Correo_Representante', 'id_representante', id, correos);
  }
}

async function borrarContactos(cx, idPaciente) {
  await cx.ejecutar(
    `DELETE FROM Telefono_Contacto WHERE id_contacto IN
       (SELECT id_contacto FROM Contacto_Emergencia WHERE id_paciente = ?)`,
    [idPaciente],
  );
  await cx.ejecutar('DELETE FROM Contacto_Emergencia WHERE id_paciente = ?', [idPaciente]);
}

async function borrarRepresentantes(cx, idPaciente) {
  for (const tabla of ['Telefono_Representante', 'Correo_Representante']) {
    await cx.ejecutar(
      `DELETE FROM ${tabla} WHERE id_representante IN
         (SELECT id_representante FROM Representante_Encargado WHERE id_paciente = ?)`,
      [idPaciente],
    );
  }
  await cx.ejecutar('DELETE FROM Representante_Encargado WHERE id_paciente = ?', [idPaciente]);
}

async function cargarPaciente(cx, idPaciente) {
  const paciente = await cx.unica(`${SELECT_PACIENTE} WHERE p.id_paciente = ?`, [idPaciente]);
  if (!paciente) return null;

  paciente.telefonos = await cx.q('SELECT numero, tipo FROM Telefono_Paciente WHERE id_paciente = ? ORDER BY id_telefono_pac', [idPaciente]);
  paciente.correos = await cx.q('SELECT correo FROM Correo_Paciente WHERE id_paciente = ? ORDER BY id_correo_pac', [idPaciente]);

  paciente.contactos_emergencia = await cx.q('SELECT * FROM Contacto_Emergencia WHERE id_paciente = ? ORDER BY id_contacto', [idPaciente]);
  for (const contacto of paciente.contactos_emergencia) {
    contacto.telefonos = await cx.q('SELECT numero, tipo FROM Telefono_Contacto WHERE id_contacto = ? ORDER BY id_telefono_cont', [contacto.id_contacto]);
  }

  paciente.representantes = await cx.q('SELECT * FROM Representante_Encargado WHERE id_paciente = ? ORDER BY id_representante', [idPaciente]);
  for (const representante of paciente.representantes) {
    representante.telefonos = await cx.q('SELECT numero, tipo FROM Telefono_Representante WHERE id_representante = ? ORDER BY id_telefono_rep', [representante.id_representante]);
    representante.correos = await cx.q('SELECT correo FROM Correo_Representante WHERE id_representante = ? ORDER BY id_correo_rep', [representante.id_representante]);
  }
  return paciente;
}

// --- Detalle de la consulta ---

async function insertarDiagnostico(cx, idConsulta, d) {
  await cx.insertar('Diagnostico_Consulta', {
    id_consulta: idConsulta,
    id_catalogo_diag: idReferencia(d.id_catalogo_diag, 'id_catalogo_diag'),
    tipo: d.tipo,
    fecha_registro: d.fecha_registro,
    observaciones: d.observaciones,
  });
}

function insertarTratamiento(cx, idConsulta, t) {
  return cx.insertar('Tratamiento', {
    id_consulta: idConsulta,
    descripcion: t.descripcion,
    fecha_inicio: t.fecha_inicio,
    fecha_fin: t.fecha_fin,
    indicaciones: t.indicaciones,
    estado: t.estado,
  }, 'id_tratamiento');
}

async function insertarReceta(cx, idConsulta, receta) {
  const idReceta = await cx.insertar('Receta', {
    id_consulta: idConsulta,
    fecha_receta: receta.fecha_receta,
    indicaciones_generales: receta.indicaciones_generales,
  }, 'id_receta');
  for (const d of receta.detalles) {
    await cx.insertar('Detalle_Receta', {
      id_receta: idReceta,
      id_medicamento: idReferencia(d.id_medicamento, 'id_medicamento'),
      dosis: d.dosis,
      frecuencia: d.frecuencia,
      via_administracion: d.via_administracion,
      duracion: d.duracion,
      indicaciones_especificas: d.indicaciones_especificas,
    });
  }
  return idReceta;
}

async function cargarConsulta(cx, idConsulta) {
  const consulta = await cx.unica(
    `SELECT c.*, h.id_paciente FROM Consulta c
     JOIN Historial_Clinico h ON h.id_historial = c.id_historial
     WHERE c.id_consulta = ?`,
    [idConsulta],
  );
  if (!consulta) return null;

  consulta.signos_vitales = await cx.unica('SELECT * FROM Signos_Vitales WHERE id_consulta = ?', [idConsulta]);
  consulta.diagnosticos = await cx.q(
    `SELECT d.*, c.codigo_clinico, c.nombre_diagnostico FROM Diagnostico_Consulta d
     JOIN Catalogo_Diagnostico c ON c.id_catalogo_diag = d.id_catalogo_diag
     WHERE d.id_consulta = ? ORDER BY d.id_catalogo_diag`,
    [idConsulta],
  );
  consulta.tratamientos = await cx.q('SELECT * FROM Tratamiento WHERE id_consulta = ? ORDER BY id_tratamiento', [idConsulta]);
  consulta.recetas = await cx.q('SELECT * FROM Receta WHERE id_consulta = ? ORDER BY id_receta', [idConsulta]);
  for (const receta of consulta.recetas) {
    receta.detalles = await cx.q(
      `SELECT d.*, m.nombre AS nombre_medicamento FROM Detalle_Receta d
       JOIN Medicamento m ON m.id_medicamento = d.id_medicamento
       WHERE d.id_receta = ? ORDER BY d.id_detalle_receta`,
      [receta.id_receta],
    );
  }
  return consulta;
}

const listarAlergiasDeHistorial = (cx, idHistorial) => cx.q(
  `SELECT a.*, c.sustancia, c.tipo_alergia FROM Historial_Alergia a
   JOIN Catalogo_Alergia c ON c.id_catalogo_alergia = a.id_catalogo_alergia
   WHERE a.id_historial = ? ORDER BY c.sustancia`,
  [idHistorial],
);

async function exigirHistorial(cx, idPaciente) {
  const historial = esIdValido(idPaciente)
    ? await cx.unica('SELECT id_historial FROM Historial_Clinico WHERE id_paciente = ?', [idPaciente])
    : null;
  if (!historial) throw new NoEncontrado('El paciente no existe.');
  return historial.id_historial;
}

function exigirId(id, mensaje) {
  if (!esIdValido(id)) throw new NoEncontrado(mensaje);
}

// --- Repositorios ---

function crearRepositorios(cn) {
  const usuarios = {
    buscarPorNombre: (usuario) => cn.unica(
      `SELECT ${COLUMNAS_USUARIO}, contrasena_hash FROM Usuario WHERE usuario = ?`,
      [usuario],
    ),
    obtener: async (id) => (esIdValido(id)
      ? cn.unica(`SELECT ${COLUMNAS_USUARIO} FROM Usuario WHERE id_usuario = ?`, [id])
      : null),
    registrarAcceso: async (id, fechaHora) => {
      await cn.actualizar('Usuario', { ultimo_acceso: fechaHora }, 'id_usuario', id);
    },
    listarProfesionales: () => cn.q(
      `SELECT ${COLUMNAS_USUARIO} FROM Usuario
       WHERE estado = 'Activo' AND rol IN (?) ORDER BY apellidos, nombres`,
      [ROLES_PROFESIONALES],
    ),
  };

  const pacientes = {
    crear: (datos, actor) => cn.transaccion(async (cx) => {
      const id = await cx.insertar('Paciente', {
        ...elegir(datos, COLUMNAS_PACIENTE),
        fecha_registro: datos.fecha_registro,
        estado: 'Activo',
      }, 'id_paciente');
      await insertarTelefonos(cx, 'Telefono_Paciente', 'id_paciente', id, datos.telefonos);
      await insertarCorreos(cx, 'Correo_Paciente', 'id_paciente', id, datos.correos);
      await insertarContactos(cx, id, datos.contactos_emergencia);
      await insertarRepresentantes(cx, id, datos.representantes);
      await cx.insertar('Historial_Clinico', {
        id_paciente: id,
        id_institucion: datos.id_institucion,
        codigo_historial: datos.codigo_historial,
        fecha_apertura: datos.fecha_registro,
        estado: 'Activo',
      }, 'id_historial');
      await auditar(cx, actor, 'CREAR', 'Paciente', id);
      return cargarPaciente(cx, id);
    }),

    obtener: async (id) => (esIdValido(id) ? cargarPaciente(cn, id) : null),

    async buscar({ texto, estado, limite, desplazamiento }) {
      const parametros = [];
      const p = (valor) => {
        parametros.push(valor);
        return '?';
      };
      const condiciones = [];
      if (texto) {
        const like = escaparLike(texto);
        condiciones.push(`(p.nombres LIKE ${p(like)} OR p.apellidos LIKE ${p(like)} OR p.dpi_o_documento LIKE ${p(like)})`);
      }
      if (estado) condiciones.push(`p.estado = ${p(estado)}`);
      const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

      const { total } = await cn.unica(`SELECT COUNT(*) AS total FROM Paciente p ${where}`, parametros);
      const elementos = await cn.q(
        `${SELECT_PACIENTE} ${where} ORDER BY p.apellidos, p.nombres, p.id_paciente
         LIMIT ${p(limite)} OFFSET ${p(desplazamiento)}`,
        parametros,
      );
      return { elementos, total: Number(total) };
    },

    actualizar: async (id, cambios, actor) => {
      exigirId(id, 'El paciente no existe.');
      return cn.transaccion(async (cx) => {
        if (!await cx.unica('SELECT id_paciente FROM Paciente WHERE id_paciente = ? FOR UPDATE', [id])) {
          throw new NoEncontrado('El paciente no existe.');
        }
        const escalares = elegir(cambios, COLUMNAS_PACIENTE);
        if (Object.keys(escalares).length > 0) {
          await cx.actualizar('Paciente', escalares, 'id_paciente', id);
        }
        if (cambios.telefonos) {
          await cx.ejecutar('DELETE FROM Telefono_Paciente WHERE id_paciente = ?', [id]);
          await insertarTelefonos(cx, 'Telefono_Paciente', 'id_paciente', id, cambios.telefonos);
        }
        if (cambios.correos) {
          await cx.ejecutar('DELETE FROM Correo_Paciente WHERE id_paciente = ?', [id]);
          await insertarCorreos(cx, 'Correo_Paciente', 'id_paciente', id, cambios.correos);
        }
        if (cambios.contactos_emergencia) {
          await borrarContactos(cx, id);
          await insertarContactos(cx, id, cambios.contactos_emergencia);
        }
        if (cambios.representantes) {
          await borrarRepresentantes(cx, id);
          await insertarRepresentantes(cx, id, cambios.representantes);
        }
        await auditar(cx, actor, 'ACTUALIZAR', 'Paciente', id);
        return cargarPaciente(cx, id);
      });
    },

    archivar: async (id, { estado, motivo, fecha }, actor) => {
      exigirId(id, 'El paciente no existe.');
      return cn.transaccion(async (cx) => {
        const filas = await cx.actualizar('Paciente', { estado, motivo_baja: motivo }, 'id_paciente', id);
        if (filas === 0) throw new NoEncontrado('El paciente no existe.');
        await cx.actualizar('Historial_Clinico', {
          estado: 'Archivado',
          fecha_cierre: fecha,
          motivo_cierre: motivo,
        }, 'id_paciente', id);
        await auditar(cx, actor, 'ARCHIVAR', 'Paciente', id);
        return cargarPaciente(cx, id);
      });
    },
  };

  const historiales = {
    async obtenerCompleto(idPaciente) {
      if (!esIdValido(idPaciente)) return null;
      const historial = await cn.unica('SELECT * FROM Historial_Clinico WHERE id_paciente = ?', [idPaciente]);
      if (!historial) return null;

      const consultas = await cn.q(
        'SELECT id_consulta FROM Consulta WHERE id_historial = ? ORDER BY fecha_hora DESC, id_consulta DESC',
        [historial.id_historial],
      );
      return {
        historial,
        antecedentes: await cn.q(
          'SELECT * FROM Antecedente_Medico WHERE id_historial = ? ORDER BY fecha_registro DESC, id_antecedente DESC',
          [historial.id_historial],
        ),
        alergias: await listarAlergiasDeHistorial(cn, historial.id_historial),
        consultas: await Promise.all(consultas.map((c) => cargarConsulta(cn, c.id_consulta))),
      };
    },

    listarAlergias: async (idPaciente) => (
      listarAlergiasDeHistorial(cn, await exigirHistorial(cn, idPaciente))
    ),

    agregarAlergia: (idPaciente, datos, actor) => cn.transaccion(async (cx) => {
      const idHistorial = await exigirHistorial(cx, idPaciente);
      const idAlergia = idReferencia(datos.id_catalogo_alergia, 'id_catalogo_alergia');
      await cx.insertar('Historial_Alergia', {
        id_historial: idHistorial,
        id_catalogo_alergia: idAlergia,
        reaccion: datos.reaccion,
        nivel_gravedad: datos.nivel_gravedad,
        fecha_registro: datos.fecha_registro,
        observaciones: datos.observaciones,
      });
      await auditar(cx, actor, 'CREAR', 'Historial_Alergia', `${idHistorial}-${idAlergia}`);
      const alergias = await listarAlergiasDeHistorial(cx, idHistorial);
      return alergias.find((a) => a.id_catalogo_alergia === String(idAlergia));
    }),

    agregarAntecedente: (idPaciente, datos, actor) => cn.transaccion(async (cx) => {
      const idHistorial = await exigirHistorial(cx, idPaciente);
      const id = await cx.insertar('Antecedente_Medico', {
        id_historial: idHistorial,
        tipo_antecedente: datos.tipo_antecedente,
        descripcion: datos.descripcion,
        fecha_registro: datos.fecha_registro,
        estado: datos.estado,
        observaciones: datos.observaciones,
      }, 'id_antecedente');
      await auditar(cx, actor, 'CREAR', 'Antecedente_Medico', id);
      return cx.unica('SELECT * FROM Antecedente_Medico WHERE id_antecedente = ?', [id]);
    }),
  };

  const citas = {
    crear: (datos, actor) => cn.transaccion(async (cx) => {
      const idPaciente = idReferencia(datos.id_paciente, 'id_paciente');
      const idProfesional = idReferencia(datos.id_usuario_profesional, 'id_usuario_profesional');
      // El bloqueo serializa envíos simultáneos para el mismo paciente.
      await cx.unica('SELECT id_paciente FROM Paciente WHERE id_paciente = ? FOR UPDATE', [idPaciente]);
      const duplicada = await cx.unica(
        `SELECT id_cita FROM Cita WHERE id_paciente = ? AND id_usuario_profesional = ?
         AND fecha_hora = ? AND estado = 'Programada'`,
        [idPaciente, idProfesional, datos.fecha_hora],
      );
      if (duplicada) throw new RegistroDuplicado('El paciente ya tiene una cita idéntica programada.');
      await bloquearProfesional(cx, idProfesional);
      await exigirHorarioCitaLibre(cx, {
        idCita: null, idPaciente, idProfesional, fechaHora: datos.fecha_hora,
      });

      const id = await cx.insertar('Cita', {
        id_paciente: idPaciente,
        id_institucion: datos.id_institucion,
        id_usuario_profesional: idProfesional,
        fecha_hora: datos.fecha_hora,
        motivo_consulta: datos.motivo_consulta,
        estado: 'Programada',
        observaciones: datos.observaciones,
        fecha_creacion: hoy(),
      }, 'id_cita');
      await auditar(cx, actor, 'CREAR', 'Cita', id);
      return cx.unica('SELECT * FROM Cita WHERE id_cita = ?', [id]);
    }),

    obtener: async (id) => (esIdValido(id) ? cn.unica('SELECT * FROM Cita WHERE id_cita = ?', [id]) : null),

    async listar(filtros) {
      const parametros = [];
      const p = (valor) => {
        parametros.push(valor);
        return '?';
      };
      const condiciones = [];
      for (const campo of ['id_paciente', 'id_usuario_profesional']) {
        if (filtros[campo]) {
          if (!esIdValido(filtros[campo])) return [];
          condiciones.push(`${campo} = ${p(filtros[campo])}`);
        }
      }
      if (filtros.estado) condiciones.push(`estado = ${p(filtros.estado)}`);
      if (filtros.desde) condiciones.push(`fecha_hora >= ${p(filtros.desde)}`);
      if (filtros.hasta) condiciones.push(`fecha_hora <= ${p(filtros.hasta)}`);
      const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
      return cn.q(`SELECT * FROM Cita ${where} ORDER BY fecha_hora, id_cita`, parametros);
    },

    actualizar: async (id, cambios, actor) => {
      exigirId(id, 'La cita no existe.');
      return cn.transaccion(async (cx) => {
        const valores = elegir(cambios, [
          'id_usuario_profesional', 'fecha_hora', 'motivo_consulta', 'observaciones', 'estado',
        ]);
        const actual = await cx.unica('SELECT * FROM Cita WHERE id_cita = ?', [id]);
        if (!actual) throw new NoEncontrado('La cita no existe.');
        const resultante = { ...actual, ...valores };
        if (resultante.estado === 'Programada'
          && (valores.fecha_hora !== undefined || valores.id_usuario_profesional !== undefined)) {
          await bloquearAgenda(cx, actual.id_paciente, resultante.id_usuario_profesional);
          await exigirHorarioCitaLibre(cx, {
            idCita: id,
            idPaciente: actual.id_paciente,
            idProfesional: resultante.id_usuario_profesional,
            fechaHora: resultante.fecha_hora,
          });
        }
        if (Object.keys(valores).length > 0) await cx.actualizar('Cita', valores, 'id_cita', id);
        await auditar(cx, actor, 'ACTUALIZAR', 'Cita', id);
        const cita = await cx.unica('SELECT * FROM Cita WHERE id_cita = ?', [id]);
        if (!cita) throw new NoEncontrado('La cita no existe.');
        return cita;
      });
    },
  };

  const consultas = {
    registrarAtencion: (datos, actor, { desde, hasta }) => cn.transaccion(async (cx) => {
      if (!esIdValido(datos.id_paciente)) throw new NoEncontrado('El paciente no existe.');
      // El bloqueo serializa envíos simultáneos: el segundo espera y luego ve la consulta del primero.
      const historial = await cx.unica(
        'SELECT id_historial FROM Historial_Clinico WHERE id_paciente = ? FOR UPDATE',
        [datos.id_paciente],
      );
      if (!historial) throw new NoEncontrado('El paciente no existe.');
      const idHistorial = historial.id_historial;

      const duplicada = await cx.unica(
        `SELECT id_consulta FROM Consulta
         WHERE id_historial = ? AND id_usuario_profesional = ? AND estado <> 'Anulada'
           AND fecha_hora BETWEEN ? AND ?
           AND motivo_consulta <=> ?
           AND sintomas <=> ?
           AND notas_clinicas <=> ?
         LIMIT 1`,
        [
          idHistorial, actor.id_usuario, desde, hasta,
          datos.motivo_consulta ?? null, datos.sintomas ?? null, datos.notas_clinicas ?? null,
        ],
      );
      if (duplicada) throw new ConsultaDuplicada();
      await bloquearProfesional(cx, datos.id_usuario_profesional);
      await exigirHorarioConsultaLibre(cx, {
        idHistorial, idProfesional: datos.id_usuario_profesional, fechaHora: datos.fecha_hora,
      });

      const idConsulta = await cx.insertar('Consulta', {
        id_historial: idHistorial,
        id_cita: idReferencia(datos.id_cita, 'id_cita'),
        id_usuario_profesional: datos.id_usuario_profesional,
        fecha_hora: datos.fecha_hora,
        motivo_consulta: datos.motivo_consulta,
        sintomas: datos.sintomas,
        examen_fisico: datos.examen_fisico,
        notas_clinicas: datos.notas_clinicas,
        estado: datos.estado,
      }, 'id_consulta');

      if (datos.signos_vitales) {
        await cx.insertar('Signos_Vitales', { id_consulta: idConsulta, ...datos.signos_vitales });
      }
      for (const diagnostico of datos.diagnosticos ?? []) await insertarDiagnostico(cx, idConsulta, diagnostico);
      for (const tratamiento of datos.tratamientos ?? []) await insertarTratamiento(cx, idConsulta, tratamiento);
      if (datos.receta) await insertarReceta(cx, idConsulta, datos.receta);

      if (datos.id_cita) {
        const filas = await cx.ejecutar(
          `UPDATE Cita SET estado = 'Atendida'
           WHERE id_cita = ? AND id_paciente = ? AND estado = 'Programada'`,
          [datos.id_cita, datos.id_paciente],
        );
        if (filas === 0) throw new ReglaNegocio('La cita no está programada para este paciente.');
      }

      await auditar(cx, actor, 'CREAR', 'Consulta', idConsulta);
      return cargarConsulta(cx, idConsulta);
    }),

    obtener: async (id) => (esIdValido(id) ? cargarConsulta(cn, id) : null),

    cambiarEstado: async (id, estado, actor) => {
      exigirId(id, 'La consulta no existe.');
      return cn.transaccion(async (cx) => {
        const filas = await cx.actualizar('Consulta', { estado }, 'id_consulta', id);
        if (filas === 0) throw new NoEncontrado('La consulta no existe.');
        await auditar(cx, actor, `ESTADO_${estado.toUpperCase()}`, 'Consulta', id);
        return cargarConsulta(cx, id);
      });
    },

    agregarDiagnostico: async (id, datos, actor) => {
      exigirId(id, 'La consulta no existe.');
      return cn.transaccion(async (cx) => {
        await insertarDiagnostico(cx, id, datos);
        await auditar(cx, actor, 'CREAR', 'Diagnostico_Consulta', `${id}-${datos.id_catalogo_diag}`);
        return cargarConsulta(cx, id);
      });
    },

    agregarTratamiento: async (id, datos, actor) => {
      exigirId(id, 'La consulta no existe.');
      return cn.transaccion(async (cx) => {
        const idTratamiento = await insertarTratamiento(cx, id, datos);
        await auditar(cx, actor, 'CREAR', 'Tratamiento', idTratamiento);
        return cargarConsulta(cx, id);
      });
    },

    agregarReceta: async (id, datos, actor) => {
      exigirId(id, 'La consulta no existe.');
      return cn.transaccion(async (cx) => {
        const idReceta = await insertarReceta(cx, id, datos);
        await auditar(cx, actor, 'CREAR', 'Receta', idReceta);
        return cargarConsulta(cx, id);
      });
    },
  };

  const catalogos = {
    diagnosticos: ({ texto } = {}) => (texto
      ? cn.q(
        `SELECT * FROM Catalogo_Diagnostico
         WHERE nombre_diagnostico LIKE ? OR codigo_clinico LIKE ? ORDER BY nombre_diagnostico`,
        [escaparLike(texto), escaparLike(texto)],
      )
      : cn.q('SELECT * FROM Catalogo_Diagnostico ORDER BY nombre_diagnostico')),

    async medicamentos({ ids } = {}) {
      if (ids) {
        const validos = ids.filter(esIdValido);
        return validos.length === 0 ? [] : cn.q(
          'SELECT * FROM Medicamento WHERE id_medicamento IN (?)',
          [validos],
        );
      }
      return cn.q("SELECT * FROM Medicamento WHERE estado = 'Activo' ORDER BY nombre");
    },

    alergias: () => cn.q('SELECT * FROM Catalogo_Alergia ORDER BY sustancia'),
  };

  const salud = {
    verificar: async () => {
      await cn.q('SELECT 1 AS ok');
    },
  };

  return {
    ...envolverRepositorios(
      { usuarios, pacientes, historiales, citas, consultas, catalogos, salud },
      cn.traducirError,
    ),
    cerrar: cn.cerrar,
  };
}

module.exports = { crearRepositorios };
