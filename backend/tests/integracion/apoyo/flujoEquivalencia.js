// Flujo de referencia que se ejecuta en cada motor para comparar sus respuestas JSON.
// Lo usan equivalencia.test.js (PostgreSQL y MySQL) y equivalencia-motores.test.js (los cuatro).

const { randomUUID } = require('node:crypto');
const pacientes = require('../../../src/application/pacientes');
const citas = require('../../../src/application/citas');
const consultas = require('../../../src/application/consultas');
const dto = require('../../../src/dto/respuestas');

// IDs y valores generados cambian entre motores: se reemplazan, conservando su tipo.
function normalizar(valor, clave) {
  if (Array.isArray(valor)) return valor.map((v) => normalizar(v));
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, normalizar(v, k)]));
  }
  if (clave?.startsWith('id_') && valor !== null) return `<${typeof valor}>`;
  if (['codigo_historial', 'dpi_o_documento', 'fecha_hora', 'id_institucion'].includes(clave)) return `<${typeof valor}>`;
  return valor;
}

// Horas propias de cada ejecución: no se puede repetir la misma hora con el mismo profesional.
// La cita va en el futuro; la consulta, en el pasado (no se registran consultas futuras).
// Todos los motores de una misma ejecución usan las mismas horas, para comparar JSON idénticos.
const horaEntre = (inicio, fin) => new Date(inicio + Math.random() * (fin - inicio)).toISOString().slice(0, 19);
const horasDeEjecucion = () => ({
  cita: horaEntre(Date.UTC(3000, 0, 1), Date.UTC(3001, 0, 1)),
  consulta: horaEntre(Date.UTC(2000, 0, 1), Date.UTC(2025, 0, 1)),
});

async function flujoCompleto(repos, actor, marca, horas = horasDeEjecucion()) {
  const paciente = await pacientes.registrarPaciente(repos, actor, {
    nombres: 'Equivalencia',
    apellidos: `Motor ${marca}`,
    dpi_o_documento: `EQ-${marca}-${randomUUID().slice(0, 8)}`,
    fecha_nacimiento: '1985-12-31',
    sexo: 'M',
    tipo_sangre: 'AB-',
    telefonos: [{ numero: '5555-0000', tipo: 'Casa' }],
    contactos_emergencia: [{ nombres: 'Uno', apellidos: 'Dos', telefonos: [{ numero: '1', tipo: 'Celular' }] }],
  });
  // La cita la atiende quien registra la consulta: una cita solo se liga a su propio profesional.
  const cita = await citas.crearCita(repos, actor, {
    id_paciente: paciente.id_paciente,
    id_usuario_profesional: actor.id_usuario,
    fecha_hora: horas.cita,
    motivo_consulta: 'Control',
  });

  const diagnosticos = await repos.catalogos.diagnosticos({ texto: 'caries' });
  const medicamentos = await repos.catalogos.medicamentos();
  const alergias = await repos.catalogos.alergias();
  const penicilina = alergias.find((a) => a.sustancia === 'Penicilina');
  const amoxicilina = medicamentos.find((m) => m.nombre === 'Amoxicilina');

  const alergia = await pacientes.agregarAlergia(repos, actor, paciente.id_paciente, {
    id_catalogo_alergia: penicilina.id_catalogo_alergia, nivel_gravedad: 'Leve',
  });
  const atencion = await consultas.registrarAtencion(repos, actor, {
    id_paciente: paciente.id_paciente,
    id_cita: cita.id_cita,
    fecha_hora: horas.consulta,
    motivo_consulta: 'Dolor con acentuación: ñandú',
    sintomas: 'Síntomas',
    signos_vitales: { presion_arterial: '110/70', temperatura: 36.75, peso: 70.5, talla: 175, saturacion_oxigeno: 98 },
    diagnosticos: [{ id_catalogo_diag: diagnosticos[0].id_catalogo_diag, tipo: 'Definitivo' }],
    tratamientos: [{ descripcion: 'Tratamiento', fecha_inicio: '2030-01-01', fecha_fin: '2030-01-10' }],
    receta: { indicaciones_generales: 'Con comida', detalles: [{ id_medicamento: amoxicilina.id_medicamento, dosis: '1', frecuencia: '8h' }] },
  });
  const archivado = await pacientes.archivarPaciente(repos, actor, paciente.id_paciente, { estado: 'Inactivo', motivo: 'Traslado' });
  const historial = await pacientes.obtenerHistorialCompleto(repos, paciente.id_paciente);

  return normalizar({
    paciente: dto.pacienteDto(paciente),
    alergia: dto.alergiaDto(alergia),
    cita: dto.citaDto(await repos.citas.obtener(cita.id_cita)),
    atencion: { consulta: dto.consultaDto(atencion.consulta), advertencias: atencion.advertencias },
    archivado: dto.pacienteDto(archivado),
    historial: dto.historialCompletoDto(historial),
  });
}

module.exports = { normalizar, flujoCompleto, horasDeEjecucion };
