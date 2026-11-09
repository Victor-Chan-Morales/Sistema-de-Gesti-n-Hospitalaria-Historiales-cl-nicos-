// Implementación completa del puerto en memoria. Sirve para probar el núcleo sin Docker,
// y como ejemplo mínimo de lo que debe hacer un adaptador: pasa la misma suite de contrato.

const {
  NoEncontrado, ReglaNegocio, RegistroDuplicado, ConsultaDuplicada, DatosInvalidos, ConflictoHorario,
} = require('../../../src/domain/errores');
const { hoy } = require('../../../src/domain/fechas');
const { ROLES_PROFESIONALES } = require('../../../src/domain/roles');

const copia = (valor) => (valor === undefined ? undefined : structuredClone(valor));

function crearRepoMemoria() {
  let secuencia = 0;
  const nuevoId = () => String(++secuencia);

  const bd = {
    usuarios: new Map(),
    pacientes: new Map(),
    historiales: new Map(), // por id_paciente
    citas: new Map(),
    consultas: new Map(),
    diagnosticos: new Map(),
    medicamentos: new Map(),
    alergias: new Map(),
    auditoria: [],
  };

  const agregarFila = (mapa, columnaId, fila) => {
    const id = nuevoId();
    mapa.set(id, { [columnaId]: id, ...fila });
    return id;
  };

  [['Administrador', 'admin.prueba'], ['Secretaria', 'secretaria.prueba'], ['Médico', 'medico.prueba']]
    .forEach(([rol, usuario]) => agregarFila(bd.usuarios, 'id_usuario', {
      id_institucion: '1', nombres: rol, apellidos: 'Prueba', usuario, contrasena_hash: 'hash', rol, estado: 'Activo',
    }));
  agregarFila(bd.diagnosticos, 'id_catalogo_diag', { codigo_clinico: 'J06.9', nombre_diagnostico: 'Infección respiratoria', descripcion: null });
  agregarFila(bd.diagnosticos, 'id_catalogo_diag', { codigo_clinico: 'I10', nombre_diagnostico: 'Hipertensión', descripcion: null });
  agregarFila(bd.medicamentos, 'id_medicamento', { nombre: 'Amoxicilina', principio_activo: 'Penicilina', presentacion: 'Cápsula', concentracion: '500 mg', estado: 'Activo' });
  agregarFila(bd.medicamentos, 'id_medicamento', { nombre: 'Ibuprofeno', principio_activo: 'Ibuprofeno', presentacion: 'Tableta', concentracion: '400 mg', estado: 'Activo' });
  agregarFila(bd.alergias, 'id_catalogo_alergia', { sustancia: 'Penicilina', tipo_alergia: 'Medicamentosa' });
  agregarFila(bd.alergias, 'id_catalogo_alergia', { sustancia: 'Látex', tipo_alergia: 'Otra' });

  const auditar = (actor, accion, entidad, id) => {
    bd.auditoria.push({ id_usuario: actor.id_usuario, accion, entidad, id_entidad: String(id) });
  };

  const exigir = (mapa, id, mensaje) => {
    const fila = mapa.get(String(id));
    if (!fila) throw new NoEncontrado(mensaje);
    return fila;
  };

  const vista = (paciente) => {
    if (!paciente) return null;
    const h = bd.historiales.get(paciente.id_paciente);
    return copia({ ...paciente, id_historial: h?.id_historial ?? null, codigo_historial: h?.codigo_historial ?? null });
  };

  const exigirReferencia = (mapa, id, campo) => {
    if (!mapa.has(String(id))) throw new DatosInvalidos(`${campo} hace referencia a un registro inexistente.`);
  };

  const diagnosticoCompleto = (d) => {
    exigirReferencia(bd.diagnosticos, d.id_catalogo_diag, 'id_catalogo_diag');
    const catalogo = bd.diagnosticos.get(d.id_catalogo_diag);
    return { ...d, codigo_clinico: catalogo.codigo_clinico, nombre_diagnostico: catalogo.nombre_diagnostico };
  };

  const recetaCompleta = (r) => ({
    ...r,
    id_receta: nuevoId(),
    detalles: r.detalles.map((d) => {
      exigirReferencia(bd.medicamentos, d.id_medicamento, 'id_medicamento');
      return { ...d, id_detalle_receta: nuevoId(), nombre_medicamento: bd.medicamentos.get(d.id_medicamento).nombre };
    }),
  });

  // Choques de horario, igual que en los adaptadores: un profesional o un paciente no pueden
  // tener dos citas Programadas (o dos consultas no anuladas) a la misma hora.
  const exigirHorarioCitaLibre = (idCita, idPaciente, idProfesional, fechaHora) => {
    const choque = [...bd.citas.values()].find((c) => c.id_cita !== idCita && c.estado === 'Programada'
      && c.fecha_hora === fechaHora
      && (c.id_usuario_profesional === idProfesional || c.id_paciente === idPaciente));
    if (!choque) return;
    throw new ConflictoHorario(choque.id_usuario_profesional === idProfesional
      ? 'El profesional ya tiene una cita programada a esa misma hora.'
      : 'El paciente ya tiene una cita programada a esa misma hora.');
  };

  const exigirHorarioConsultaLibre = (idPaciente, idHistorial, idProfesional, fechaHora) => {
    const choque = [...bd.consultas.values()].find((c) => c.estado !== 'Anulada' && c.fecha_hora === fechaHora
      && (c.id_usuario_profesional === idProfesional || c.id_historial === idHistorial));
    if (!choque) return;
    throw new ConflictoHorario(choque.id_usuario_profesional === idProfesional
      ? 'El profesional ya tiene una consulta registrada a esa misma hora.'
      : 'El paciente ya tiene una consulta registrada a esa misma hora.');
  };

  const repos = {
    usuarios: {
      buscarPorNombre: async (usuario) => copia([...bd.usuarios.values()].find((u) => u.usuario === usuario)) ?? null,
      async obtener(id) {
        const usuario = copia(bd.usuarios.get(String(id)));
        if (!usuario) return null;
        delete usuario.contrasena_hash;
        return usuario;
      },
      async registrarAcceso(id, fechaHora) {
        bd.usuarios.get(String(id)).ultimo_acceso = fechaHora;
      },
      listarProfesionales: async () => copia([...bd.usuarios.values()]
        .filter((u) => u.estado === 'Activo' && ROLES_PROFESIONALES.includes(u.rol))),
    },

    pacientes: {
      async crear(datos, actor) {
        const { id_institucion, codigo_historial, fecha_registro, ...paciente } = copia(datos);
        const dpi = paciente.dpi_o_documento;
        if (dpi && [...bd.pacientes.values()].some((p) => p.dpi_o_documento === dpi)) {
          throw new RegistroDuplicado('Ya existe un registro con esos datos.');
        }
        const id = nuevoId();
        bd.pacientes.set(id, {
          id_paciente: id, direccion: null, estado_civil: null, ocupacion: null, tipo_sangre: null, sexo: null,
          dpi_o_documento: null, ...paciente, fecha_registro, estado: 'Activo', motivo_baja: null,
        });
        bd.historiales.set(id, {
          historial: {
            id_historial: nuevoId(), id_paciente: id, id_institucion: String(id_institucion), codigo_historial,
            fecha_apertura: fecha_registro, estado: 'Activo', fecha_cierre: null, motivo_cierre: null, observaciones: null,
          },
          antecedentes: [],
          alergias: [],
        });
        Object.assign(bd.historiales.get(id), bd.historiales.get(id).historial);
        auditar(actor, 'CREAR', 'Paciente', id);
        return vista(bd.pacientes.get(id));
      },
      obtener: async (id) => vista(bd.pacientes.get(String(id))),
      async buscar({ texto, estado, limite, desplazamiento }) {
        const t = texto?.toLowerCase();
        const coincidencias = [...bd.pacientes.values()].filter((p) =>
          (!estado || p.estado === estado)
          && (!t || [p.nombres, p.apellidos, p.dpi_o_documento].some((v) => v?.toLowerCase().includes(t))));
        return {
          elementos: coincidencias.slice(desplazamiento, desplazamiento + limite).map(vista),
          total: coincidencias.length,
        };
      },
      async actualizar(id, cambios, actor) {
        const paciente = exigir(bd.pacientes, id, 'El paciente no existe.');
        Object.assign(paciente, copia(cambios));
        auditar(actor, 'ACTUALIZAR', 'Paciente', id);
        return vista(paciente);
      },
      async archivar(id, { estado, motivo, fecha }, actor) {
        const paciente = exigir(bd.pacientes, id, 'El paciente no existe.');
        Object.assign(paciente, { estado, motivo_baja: motivo });
        Object.assign(bd.historiales.get(String(id)).historial, { estado: 'Archivado', fecha_cierre: fecha, motivo_cierre: motivo });
        auditar(actor, 'ARCHIVAR', 'Paciente', id);
        return vista(paciente);
      },
    },

    historiales: {
      async obtenerCompleto(idPaciente) {
        const h = bd.historiales.get(String(idPaciente));
        if (!h) return null;
        const consultas = [...bd.consultas.values()]
          .filter((c) => c.id_historial === h.id_historial)
          .sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora) || Number(b.id_consulta) - Number(a.id_consulta));
        return copia({ historial: h.historial, antecedentes: h.antecedentes, alergias: h.alergias, consultas });
      },
      async listarAlergias(idPaciente) {
        const h = bd.historiales.get(String(idPaciente));
        if (!h) throw new NoEncontrado('El paciente no existe.');
        return copia(h.alergias);
      },
      async agregarAlergia(idPaciente, datos, actor) {
        const h = bd.historiales.get(String(idPaciente));
        if (!h) throw new NoEncontrado('El paciente no existe.');
        exigirReferencia(bd.alergias, datos.id_catalogo_alergia, 'id_catalogo_alergia');
        if (h.alergias.some((a) => a.id_catalogo_alergia === datos.id_catalogo_alergia)) {
          throw new RegistroDuplicado('Ya existe un registro con esos datos.');
        }
        const { sustancia, tipo_alergia } = bd.alergias.get(datos.id_catalogo_alergia);
        const alergia = { reaccion: null, nivel_gravedad: null, observaciones: null, ...copia(datos), sustancia, tipo_alergia };
        h.alergias.push(alergia);
        auditar(actor, 'CREAR', 'Historial_Alergia', datos.id_catalogo_alergia);
        return copia(alergia);
      },
      async agregarAntecedente(idPaciente, datos, actor) {
        const h = bd.historiales.get(String(idPaciente));
        if (!h) throw new NoEncontrado('El paciente no existe.');
        const antecedente = { id_antecedente: nuevoId(), estado: null, observaciones: null, ...copia(datos) };
        h.antecedentes.unshift(antecedente);
        auditar(actor, 'CREAR', 'Antecedente_Medico', antecedente.id_antecedente);
        return copia(antecedente);
      },
    },

    citas: {
      async crear(datos, actor) {
        const duplicada = [...bd.citas.values()].some((c) => c.id_paciente === datos.id_paciente
          && c.id_usuario_profesional === datos.id_usuario_profesional
          && c.fecha_hora === datos.fecha_hora && c.estado === 'Programada');
        if (duplicada) throw new RegistroDuplicado('El paciente ya tiene una cita idéntica programada.');
        exigirHorarioCitaLibre(null, datos.id_paciente, datos.id_usuario_profesional, datos.fecha_hora);
        const id = agregarFila(bd.citas, 'id_cita', {
          motivo_consulta: null, observaciones: null, ...copia(datos),
          id_institucion: String(datos.id_institucion), estado: 'Programada', fecha_creacion: hoy(),
        });
        auditar(actor, 'CREAR', 'Cita', id);
        return copia(bd.citas.get(id));
      },
      obtener: async (id) => copia(bd.citas.get(String(id))) ?? null,
      listar: async (f) => copia([...bd.citas.values()]
        .filter((c) => (!f.id_paciente || c.id_paciente === f.id_paciente)
          && (!f.id_usuario_profesional || c.id_usuario_profesional === f.id_usuario_profesional)
          && (!f.estado || c.estado === f.estado)
          && (!f.desde || c.fecha_hora >= f.desde)
          && (!f.hasta || c.fecha_hora <= f.hasta))
        .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))),
      async actualizar(id, cambios, actor) {
        const cita = exigir(bd.citas, id, 'La cita no existe.');
        const resultante = { ...cita, ...copia(cambios) };
        if (resultante.estado === 'Programada' && (cambios.fecha_hora !== undefined || cambios.id_usuario_profesional !== undefined)) {
          exigirHorarioCitaLibre(String(id), resultante.id_paciente, resultante.id_usuario_profesional, resultante.fecha_hora);
        }
        Object.assign(cita, copia(cambios));
        auditar(actor, 'ACTUALIZAR', 'Cita', id);
        return copia(cita);
      },
    },

    consultas: {
      async registrarAtencion(datos, actor, { desde, hasta }) {
        const h = bd.historiales.get(String(datos.id_paciente));
        if (!h) throw new NoEncontrado('El paciente no existe.');

        const duplicada = [...bd.consultas.values()].some((c) => c.id_historial === h.id_historial
          && c.id_usuario_profesional === actor.id_usuario && c.estado !== 'Anulada'
          && c.fecha_hora >= desde && c.fecha_hora <= hasta
          && c.motivo_consulta === (datos.motivo_consulta ?? null)
          && c.sintomas === (datos.sintomas ?? null)
          && c.notas_clinicas === (datos.notas_clinicas ?? null));
        if (duplicada) throw new ConsultaDuplicada();
        exigirHorarioConsultaLibre(String(datos.id_paciente), h.id_historial, datos.id_usuario_profesional, datos.fecha_hora);

        // Se construye todo antes de guardar: si algo falla, no queda nada a medias.
        const diagnosticos = (datos.diagnosticos ?? []).map(diagnosticoCompleto);
        const receta = datos.receta ? recetaCompleta(datos.receta) : null;
        if (datos.id_cita) {
          const cita = bd.citas.get(String(datos.id_cita));
          if (!cita || cita.id_paciente !== datos.id_paciente || cita.estado !== 'Programada') {
            throw new ReglaNegocio('La cita no está programada para este paciente.');
          }
          cita.estado = 'Atendida';
        }

        const id = agregarFila(bd.consultas, 'id_consulta', {
          id_historial: h.id_historial,
          id_paciente: String(datos.id_paciente),
          id_cita: datos.id_cita ?? null,
          id_usuario_profesional: datos.id_usuario_profesional,
          fecha_hora: datos.fecha_hora,
          motivo_consulta: datos.motivo_consulta ?? null,
          sintomas: datos.sintomas ?? null,
          examen_fisico: datos.examen_fisico ?? null,
          notas_clinicas: datos.notas_clinicas ?? null,
          estado: datos.estado,
          signos_vitales: copia(datos.signos_vitales) ?? null,
          diagnosticos,
          tratamientos: (datos.tratamientos ?? []).map((t) => ({ id_tratamiento: nuevoId(), ...copia(t) })),
          recetas: receta ? [receta] : [],
        });
        auditar(actor, 'CREAR', 'Consulta', id);
        return copia(bd.consultas.get(id));
      },
      obtener: async (id) => copia(bd.consultas.get(String(id))) ?? null,
      async cambiarEstado(id, estado, actor) {
        const consulta = exigir(bd.consultas, id, 'La consulta no existe.');
        consulta.estado = estado;
        auditar(actor, `ESTADO_${estado.toUpperCase()}`, 'Consulta', id);
        return copia(consulta);
      },
      async agregarDiagnostico(id, datos, actor) {
        const consulta = exigir(bd.consultas, id, 'La consulta no existe.');
        if (consulta.diagnosticos.some((d) => d.id_catalogo_diag === datos.id_catalogo_diag)) {
          throw new RegistroDuplicado('Ya existe un registro con esos datos.');
        }
        consulta.diagnosticos.push(diagnosticoCompleto(copia(datos)));
        auditar(actor, 'CREAR', 'Diagnostico_Consulta', id);
        return copia(consulta);
      },
      async agregarTratamiento(id, datos, actor) {
        const consulta = exigir(bd.consultas, id, 'La consulta no existe.');
        consulta.tratamientos.push({ id_tratamiento: nuevoId(), ...copia(datos) });
        auditar(actor, 'CREAR', 'Tratamiento', id);
        return copia(consulta);
      },
      async agregarReceta(id, datos, actor) {
        const consulta = exigir(bd.consultas, id, 'La consulta no existe.');
        consulta.recetas.push(recetaCompleta(copia(datos)));
        auditar(actor, 'CREAR', 'Receta', id);
        return copia(consulta);
      },
    },

    catalogos: {
      diagnosticos: async ({ texto } = {}) => copia([...bd.diagnosticos.values()]
        .filter((d) => !texto || d.nombre_diagnostico.toLowerCase().includes(texto.toLowerCase()))),
      medicamentos: async ({ ids } = {}) => copia([...bd.medicamentos.values()]
        .filter((m) => (ids ? ids.includes(m.id_medicamento) : m.estado === 'Activo'))),
      alergias: async () => copia([...bd.alergias.values()]),
    },

    salud: { verificar: async () => {} },
    cerrar: async () => {},
    bd,
  };

  return repos;
}

module.exports = { crearRepoMemoria };
