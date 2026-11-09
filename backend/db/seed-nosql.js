// Datos de prueba de MongoDB (Laboratorio Clínico) y Firebase (Centro Médico Pediátrico).
// Se puede ejecutar varias veces sin duplicar. Uso:
//   npm run seed:nosql            # ambos motores
//   npm run seed:nosql -- mongo   # solo MongoDB
//   npm run seed:nosql -- firebase
// Los nombres de usuario deben ser únicos entre TODAS las instituciones, porque el login
// busca en todos los motores. Convención: <rol>.<institución>.
//
// Los escenarios (citas, consultas, órdenes, controles, vacunas) se crean con los mismos casos de
// uso que usa la API, así pasan las mismas reglas de negocio y validaciones. Cada escenario se
// omite si el paciente ya tiene datos de ese tipo, para que volver a ejecutar el seeder no duplique.

require('../src/config/env');
const { createHash } = require('node:crypto');
const credenciales = require('../src/adapters/seguridad/credencialesBcrypt');
const mongo = require('../src/adapters/persistence/mongo/conexion');
const { asegurarIndices } = require('../src/adapters/persistence/mongo/indices');
const adaptadorMongo = require('../src/adapters/persistence/mongo');
const firebase = require('../src/adapters/persistence/firebase/conexion');
const adaptadorFirebase = require('../src/adapters/persistence/firebase');
const casosPacientes = require('../src/application/pacientes');
const casosCitas = require('../src/application/citas');
const casosConsultas = require('../src/application/consultas');
const casosLaboratorio = require('../src/application/laboratorio');
const casosPediatria = require('../src/application/pediatria');
const { hoy } = require('../src/domain/fechas');

// Mismos catálogos que db/seed.js: las recetas y alergias deben existir en todos los motores.
const DIAGNOSTICOS = [
  { codigo_clinico: 'J06.9', nombre_diagnostico: 'Infección aguda de las vías respiratorias superiores' },
  { codigo_clinico: 'I10', nombre_diagnostico: 'Hipertensión esencial' },
  { codigo_clinico: 'E11.9', nombre_diagnostico: 'Diabetes mellitus tipo 2' },
  { codigo_clinico: 'K02.9', nombre_diagnostico: 'Caries dental' },
  { codigo_clinico: 'K05.1', nombre_diagnostico: 'Gingivitis crónica' },
];

const MEDICAMENTOS = [
  { nombre: 'Amoxicilina', principio_activo: 'Penicilina', presentacion: 'Cápsula', concentracion: '500 mg' },
  { nombre: 'Ibuprofeno', principio_activo: 'Ibuprofeno', presentacion: 'Tableta', concentracion: '400 mg' },
  { nombre: 'Acetaminofén', principio_activo: 'Paracetamol', presentacion: 'Tableta', concentracion: '500 mg' },
  { nombre: 'Lidocaína', principio_activo: 'Lidocaína', presentacion: 'Solución inyectable', concentracion: '2 %' },
];

const ALERGIAS = [
  { sustancia: 'Penicilina', tipo_alergia: 'Medicamentosa' },
  { sustancia: 'Ibuprofeno', tipo_alergia: 'Medicamentosa' },
  { sustancia: 'Látex', tipo_alergia: 'Otra' },
  { sustancia: 'Maní', tipo_alergia: 'Alimentaria' },
];

const TIPOS_EXAMEN = [
  { nombre: 'Hematología completa', descripcion: 'Conteo de células sanguíneas.', tipo_muestra: 'Sangre', estado: 'Activo' },
  { nombre: 'Glucosa en ayunas', descripcion: 'Nivel de glucosa en sangre.', tipo_muestra: 'Sangre', estado: 'Activo' },
  { nombre: 'Examen general de orina', descripcion: 'Análisis físico, químico y microscópico.', tipo_muestra: 'Orina', estado: 'Activo' },
  { nombre: 'Coproanálisis', descripcion: 'Análisis de heces.', tipo_muestra: 'Heces', estado: 'Activo' },
  { nombre: 'Cultivo de garganta', descripcion: 'Búsqueda de bacterias en la faringe.', tipo_muestra: 'Otra', estado: 'Activo' },
];

const VACUNAS = [
  { nombre: 'BCG', enfermedad_prevenida: 'Tuberculosis', numero_dosis_requeridas: 1, descripcion: 'Al nacer.', estado: 'Activa' },
  { nombre: 'Pentavalente', enfermedad_prevenida: 'Difteria, tétanos, tos ferina, hepatitis B y Hib', numero_dosis_requeridas: 3, descripcion: '2, 4 y 6 meses.', estado: 'Activa' },
  { nombre: 'Polio', enfermedad_prevenida: 'Poliomielitis', numero_dosis_requeridas: 3, descripcion: '2, 4 y 6 meses.', estado: 'Activa' },
  { nombre: 'SPR', enfermedad_prevenida: 'Sarampión, paperas y rubéola', numero_dosis_requeridas: 2, descripcion: '12 meses y refuerzo.', estado: 'Activa' },
  { nombre: 'Rotavirus', enfermedad_prevenida: 'Gastroenteritis por rotavirus', numero_dosis_requeridas: 2, descripcion: '2 y 4 meses.', estado: 'Activa' },
  { nombre: 'Influenza', enfermedad_prevenida: 'Influenza estacional', numero_dosis_requeridas: 1, descripcion: 'Anual desde los 6 meses.', estado: 'Activa' },
];

const aniosAtras = (anios, mesDia) => `${new Date().getFullYear() - anios}-${mesDia}`;

// Fecha 'YYYY-MM-DD' desplazada N días, en hora local (igual que el resto del sistema).
function fechaDesplazada(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const dd = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}
const fechaHoraFutura = (dias, hora) => `${fechaDesplazada(dias)}T${hora}`;

const adulto = (prefijo) => ({
  nombres: 'Ana Lucía',
  apellidos: 'Pérez García',
  dpi_o_documento: `${prefijo}-1000000000101`,
  fecha_nacimiento: '1988-04-12',
  sexo: 'F',
  tipo_sangre: 'O+',
  telefonos: [{ numero: '5555-0101', tipo: 'Celular' }],
  correos: [{ correo: 'ana.perez@example.com' }],
  contactos_emergencia: [{
    nombres: 'Carlos', apellidos: 'Pérez', parentesco: 'Hermano', telefonos: [{ numero: '5555-0102', tipo: 'Celular' }],
  }],
  representantes: [],
});

// Paciente que se archiva en el seed: sirve para probar que no recibe citas nuevas.
const adultoArchivado = (prefijo) => ({
  nombres: 'Jorge',
  apellidos: 'Méndez Ruiz',
  dpi_o_documento: `${prefijo}-1000000000202`,
  fecha_nacimiento: '1975-02-10',
  sexo: 'M',
  tipo_sangre: 'A+',
  telefonos: [{ numero: '5555-0104', tipo: 'Casa' }],
  correos: [],
  contactos_emergencia: [],
  representantes: [],
});

const menor = (prefijo, numero, nombres, apellidos, fechaNacimiento, sexo) => ({
  nombres,
  apellidos,
  dpi_o_documento: `${prefijo}-MENOR-000${numero}`,
  fecha_nacimiento: fechaNacimiento,
  sexo,
  telefonos: [],
  correos: [],
  contactos_emergencia: [],
  representantes: [{
    nombres: 'Sofía',
    apellidos: 'Díaz',
    parentesco: 'Madre',
    telefonos: [{ numero: '5555-0103', tipo: 'Celular' }],
    correos: [{ correo: 'sofia.diaz@example.com' }],
  }],
});

const DESTINOS = {
  mongo: {
    motor: 'MongoDB',
    id_institucion: 3,
    nombre: 'Laboratorio Clínico',
    prefijo: 'LC',
    usuarios: [
      ['admin.laboratorio', 'Héctor', 'Paz', 'Administrador'],
      ['secretaria.laboratorio', 'Irma', 'Soto', 'Secretaria'],
      // Un médico de laboratorio registra consultas; el laboratorista, órdenes y resultados.
      ['medico.laboratorio', 'Elena', 'Vargas', 'Médico'],
      ['laboratorista.laboratorio', 'Julia', 'Barrios', 'Laboratorista'],
    ],
    pacientes: (prefijo) => [
      adulto(prefijo),
      menor(prefijo, 1, 'Mateo', 'López Díaz', aniosAtras(8, '09-30'), 'M'),
      adultoArchivado(prefijo),
    ],
  },
  firebase: {
    motor: 'Firebase',
    id_institucion: 4,
    nombre: 'Centro Médico Pediátrico',
    prefijo: 'CP',
    usuarios: [
      ['admin.pediatrico', 'Karla', 'Navas', 'Administrador'],
      ['secretaria.pediatrico', 'Luisa', 'Cruz', 'Secretaria'],
      // Un pediatra es un usuario con rol Médico (ver domain/roles.js).
      ['pediatra.pediatrico', 'Marcos', 'Orellana', 'Médico'],
    ],
    pacientes: (prefijo) => [
      menor(prefijo, 1, 'Mateo', 'López Díaz', aniosAtras(8, '09-30'), 'M'),
      menor(prefijo, 2, 'Valeria', 'Gómez Díaz', aniosAtras(2, '03-15'), 'F'),
      menor(prefijo, 3, 'Tomás', 'Herrera Ruiz', aniosAtras(5, '04-02'), 'M'),
    ],
  },
};

const datosDePaciente = (paciente, destino) => ({
  ...paciente,
  id_institucion: destino.id_institucion,
  codigo_historial: `HC-${destino.id_institucion}-${paciente.dpi_o_documento}`,
  fecha_registro: hoy(),
});

const usuarioDoc = ([usuario, nombres, apellidos, rol], destino, hash) => ({
  id_institucion: destino.id_institucion,
  nombres,
  apellidos,
  usuario,
  contrasena_hash: hash,
  rol,
  estado: 'Activo',
  fecha_creacion: hoy(),
});

// --- Ayudas comunes a los escenarios ---

async function actorDe(adaptador, usuario, destino) {
  const u = await adaptador.usuarios.buscarPorNombre(usuario);
  if (!u) throw new Error(`Falta el usuario de prueba ${usuario}`);
  return { id_usuario: u.id_usuario, id_institucion: destino.id_institucion, rol: u.rol };
}

async function idPacientePorDpi(adaptador, dpi) {
  const { elementos } = await adaptador.pacientes.buscar({ texto: dpi, limite: 50, desplazamiento: 0 });
  const paciente = elementos.find((p) => p.dpi_o_documento === dpi);
  if (!paciente) throw new Error(`No existe el paciente de prueba ${dpi}`);
  return paciente.id_paciente;
}

// Busca el ID de un registro de catálogo por el valor de un campo (p. ej., el código del diagnóstico).
function idEnCatalogo(lista, campo, valor, campoId) {
  const fila = lista.find((x) => x[campo] === valor);
  if (!fila) throw new Error(`Falta en el catálogo de prueba: ${valor}`);
  return fila[campoId];
}

// --- Escenarios de MongoDB (Laboratorio Clínico) ---

async function escenariosLaboratorio(adaptador, destino) {
  const admin = await actorDe(adaptador, 'admin.laboratorio', destino);
  const secretaria = await actorDe(adaptador, 'secretaria.laboratorio', destino);
  const medico = await actorDe(adaptador, 'medico.laboratorio', destino);
  const laboratorista = await actorDe(adaptador, 'laboratorista.laboratorio', destino);

  const ana = await idPacientePorDpi(adaptador, 'LC-1000000000101');
  const jorge = await idPacientePorDpi(adaptador, 'LC-1000000000202');

  const alergias = await adaptador.catalogos.alergias();
  const diagnosticos = await adaptador.catalogos.diagnosticos({});
  const medicamentos = await adaptador.catalogos.medicamentos({});
  const tipos = await adaptador.examenes.listarTipos({});
  const idAlergia = (sustancia) => idEnCatalogo(alergias, 'sustancia', sustancia, 'id_catalogo_alergia');
  const idDiagnostico = (codigo) => idEnCatalogo(diagnosticos, 'codigo_clinico', codigo, 'id_catalogo_diag');
  const idMedicamento = (nombre) => idEnCatalogo(medicamentos, 'nombre', nombre, 'id_medicamento');
  const idTipo = (nombre) => idEnCatalogo(tipos, 'nombre', nombre, 'id_tipo_examen');

  // Ana: alergia, antecedente, citas (una programada y una cancelada), consulta y órdenes.
  if ((await adaptador.historiales.listarAlergias(ana)).length === 0) {
    await casosPacientes.agregarAlergia(adaptador, medico, ana, {
      id_catalogo_alergia: idAlergia('Penicilina'), reaccion: 'Urticaria', nivel_gravedad: 'Moderada',
    });
  }
  if ((await adaptador.historiales.obtenerCompleto(ana)).antecedentes.length === 0) {
    await casosPacientes.agregarAntecedente(adaptador, medico, ana, {
      tipo_antecedente: 'Personal', descripcion: 'Asma leve en la infancia', estado: 'Controlado',
    });
  }
  if ((await adaptador.citas.listar({ id_paciente: ana })).length === 0) {
    await casosCitas.crearCita(adaptador, secretaria, {
      id_paciente: ana, id_usuario_profesional: medico.id_usuario,
      fecha_hora: fechaHoraFutura(7, '09:00:00'), motivo_consulta: 'Control de rutina',
    });
    const cancelada = await casosCitas.crearCita(adaptador, secretaria, {
      id_paciente: ana, id_usuario_profesional: medico.id_usuario,
      fecha_hora: fechaHoraFutura(8, '10:30:00'), motivo_consulta: 'Revisión de exámenes',
    });
    await casosCitas.actualizarCita(adaptador, secretaria, cancelada.id_cita, { estado: 'Cancelada' });
  }
  if ((await adaptador.historiales.obtenerCompleto(ana)).consultas.length === 0) {
    await casosConsultas.registrarAtencion(adaptador, medico, {
      id_paciente: ana,
      motivo_consulta: 'Dolor de garganta y fiebre',
      sintomas: 'Odinofagia y fiebre de dos días de evolución',
      examen_fisico: 'Faringe eritematosa sin exudado',
      notas_clinicas: 'Cuadro viral probable',
      estado: 'Finalizada',
      signos_vitales: { presion_arterial: '118/76', temperatura: 38.2, frecuencia_cardiaca: 92, peso: 62.5, talla: 165, saturacion_oxigeno: 98 },
      diagnosticos: [{ id_catalogo_diag: idDiagnostico('J06.9'), tipo: 'Definitivo' }],
      receta: {
        indicaciones_generales: 'Reposo y líquidos abundantes',
        detalles: [{ id_medicamento: idMedicamento('Acetaminofén'), dosis: '500 mg', frecuencia: 'Cada 8 horas', duracion: '3 días' }],
      },
    });
  }
  if ((await adaptador.examenes.listarOrdenes({ id_paciente: ana })).length === 0) {
    // Orden urgente con dos exámenes: uno con resultado (queda en proceso).
    const urgente = await casosLaboratorio.crearOrden(adaptador, laboratorista, {
      id_paciente: ana, prioridad: 'Urgente', observaciones: 'Control de anemia',
      examenes: [{ id_tipo_examen: idTipo('Hematología completa') }, { id_tipo_examen: idTipo('Glucosa en ayunas') }],
    });
    await casosLaboratorio.registrarResultado(adaptador, laboratorista, urgente.id_orden_laboratorio, {
      id_tipo_examen: idTipo('Hematología completa'), fecha_toma_muestra: hoy(), resultado_general: 'Normal',
      valores_detallados: [{ parametro: 'Hemoglobina', valor: '13.5', unidad: 'g/dL', rango_referencia: '12-16' }],
    });
    // Orden normal con un examen: con resultado queda finalizada.
    const finalizada = await casosLaboratorio.crearOrden(adaptador, laboratorista, {
      id_paciente: ana, prioridad: 'Normal', examenes: [{ id_tipo_examen: idTipo('Coproanálisis') }],
    });
    await casosLaboratorio.registrarResultado(adaptador, laboratorista, finalizada.id_orden_laboratorio, {
      id_tipo_examen: idTipo('Coproanálisis'), fecha_toma_muestra: hoy(), resultado_general: 'Sin parásitos',
      valores_detallados: [{ parametro: 'Parásitos', valor: 'Negativo' }],
    });
    // Orden cancelada antes de tomar la muestra.
    const cancelada = await casosLaboratorio.crearOrden(adaptador, laboratorista, {
      id_paciente: ana, prioridad: 'Normal', examenes: [{ id_tipo_examen: idTipo('Cultivo de garganta') }],
    });
    await casosLaboratorio.cambiarEstadoOrden(adaptador, laboratorista, cancelada.id_orden_laboratorio, { estado: 'Cancelada' });
  }

  // Jorge se archiva: su estado 'Archivado' debe impedir citas nuevas.
  if ((await adaptador.pacientes.obtener(jorge)).estado === 'Activo') {
    await casosPacientes.archivarPaciente(adaptador, admin, jorge, {
      estado: 'Archivado', motivo: 'Traslado a otra institución',
    });
  }
  return { diagnosticos: diagnosticos.length, tipos: tipos.length, medicamentos: medicamentos.length };
}

// --- Escenarios de Firebase (Centro Médico Pediátrico) ---

async function escenariosPediatria(adaptador, destino) {
  const admin = await actorDe(adaptador, 'admin.pediatrico', destino);
  const secretaria = await actorDe(adaptador, 'secretaria.pediatrico', destino);
  const pediatra = await actorDe(adaptador, 'pediatra.pediatrico', destino);

  const mateo = await idPacientePorDpi(adaptador, 'CP-MENOR-0001');
  const valeria = await idPacientePorDpi(adaptador, 'CP-MENOR-0002');
  const tomas = await idPacientePorDpi(adaptador, 'CP-MENOR-0003');

  const alergias = await adaptador.catalogos.alergias();
  const diagnosticos = await adaptador.catalogos.diagnosticos({});
  const medicamentos = await adaptador.catalogos.medicamentos({});
  const vacunas = await adaptador.seguimiento.listarVacunas();
  const idAlergia = (sustancia) => idEnCatalogo(alergias, 'sustancia', sustancia, 'id_catalogo_alergia');
  const idDiagnostico = (codigo) => idEnCatalogo(diagnosticos, 'codigo_clinico', codigo, 'id_catalogo_diag');
  const idMedicamento = (nombre) => idEnCatalogo(medicamentos, 'nombre', nombre, 'id_medicamento');
  const idVacuna = (nombre) => idEnCatalogo(vacunas, 'nombre', nombre, 'id_vacuna');

  // Mateo: control de crecimiento, vacuna y una consulta por fiebre.
  if ((await adaptador.seguimiento.listarControles(mateo)).length === 0) {
    await casosPediatria.agregarControl(adaptador, pediatra, mateo, {
      peso: 26.5, talla: 128, perimetro_cefalico: 52.5, observaciones: 'Crecimiento adecuado',
    });
  }
  if ((await adaptador.seguimiento.listarRegistroVacunas(mateo)).length === 0) {
    await casosPediatria.registrarVacuna(adaptador, pediatra, mateo, {
      id_vacuna: idVacuna('Influenza'), numero_dosis: 'Primera', lote: 'INF-2026-A',
      centro_aplicacion: 'Centro Médico Pediátrico', proxima_dosis: fechaDesplazada(365),
    });
  }
  if ((await adaptador.historiales.obtenerCompleto(mateo)).consultas.length === 0) {
    await casosConsultas.registrarAtencion(adaptador, pediatra, {
      id_paciente: mateo,
      motivo_consulta: 'Fiebre y tos',
      sintomas: 'Fiebre de 38.5 °C y tos seca',
      examen_fisico: 'Garganta eritematosa',
      notas_clinicas: 'Cuadro viral; hidratación y control en 48 horas',
      estado: 'Finalizada',
      signos_vitales: { temperatura: 38.5, frecuencia_cardiaca: 100, peso: 26.5, talla: 128 },
      diagnosticos: [{ id_catalogo_diag: idDiagnostico('J06.9'), tipo: 'Definitivo' }],
      receta: {
        detalles: [{ id_medicamento: idMedicamento('Ibuprofeno'), dosis: '200 mg', frecuencia: 'Cada 8 horas si hay fiebre', duracion: '3 días' }],
      },
    });
  }

  // Valeria: alergia, antecedente, control, vacuna y dos citas (una cancelada).
  if ((await adaptador.historiales.listarAlergias(valeria)).length === 0) {
    await casosPacientes.agregarAlergia(adaptador, pediatra, valeria, {
      id_catalogo_alergia: idAlergia('Maní'), reaccion: 'Urticaria y vómitos', nivel_gravedad: 'Grave',
    });
  }
  if ((await adaptador.historiales.obtenerCompleto(valeria)).antecedentes.length === 0) {
    await casosPacientes.agregarAntecedente(adaptador, pediatra, valeria, {
      tipo_antecedente: 'Hereditario', descripcion: 'Asma en la madre', estado: 'Activo',
    });
  }
  if ((await adaptador.seguimiento.listarControles(valeria)).length === 0) {
    await casosPediatria.agregarControl(adaptador, pediatra, valeria, {
      peso: 12.4, talla: 86, perimetro_cefalico: 47.2, observaciones: 'Sin observaciones',
    });
  }
  if ((await adaptador.seguimiento.listarRegistroVacunas(valeria)).length === 0) {
    await casosPediatria.registrarVacuna(adaptador, pediatra, valeria, {
      id_vacuna: idVacuna('Pentavalente'), numero_dosis: 'Primera', lote: 'PNT-2026-B',
      centro_aplicacion: 'Centro Médico Pediátrico', proxima_dosis: fechaDesplazada(60),
    });
  }
  if ((await adaptador.citas.listar({ id_paciente: valeria })).length === 0) {
    await casosCitas.crearCita(adaptador, secretaria, {
      id_paciente: valeria, id_usuario_profesional: pediatra.id_usuario,
      fecha_hora: fechaHoraFutura(5, '14:00:00'), motivo_consulta: 'Control de crecimiento',
    });
    const cancelada = await casosCitas.crearCita(adaptador, secretaria, {
      id_paciente: valeria, id_usuario_profesional: pediatra.id_usuario,
      fecha_hora: fechaHoraFutura(6, '15:00:00'), motivo_consulta: 'Vacunación',
    });
    await casosCitas.actualizarCita(adaptador, secretaria, cancelada.id_cita, { estado: 'Cancelada' });
  }

  // Tomás se archiva: no debe recibir citas nuevas.
  if ((await adaptador.pacientes.obtener(tomas)).estado === 'Activo') {
    await casosPacientes.archivarPaciente(adaptador, admin, tomas, {
      estado: 'Archivado', motivo: 'Alta del programa de seguimiento',
    });
  }
  return { diagnosticos: diagnosticos.length, vacunas: vacunas.length };
}

// --- Siembra por motor ---

async function sembrarMongo(destino, hash) {
  const cn = mongo.crearConexion(mongo.configuracionDesdeEntorno(), destino.nombre);
  const adaptador = adaptadorMongo.crearAdaptador(destino.nombre);
  try {
    const db = cn.db();
    await asegurarIndices(db);

    const asegurar = (coleccion, clave, documento) =>
      db.collection(coleccion).updateOne({ [clave]: documento[clave] }, { $setOnInsert: documento }, { upsert: true });

    for (const u of destino.usuarios) await asegurar('usuarios', 'usuario', usuarioDoc(u, destino, hash));
    for (const fila of DIAGNOSTICOS) await asegurar('catalogo_diagnostico', 'codigo_clinico', fila);
    for (const fila of MEDICAMENTOS) await asegurar('medicamentos', 'nombre', { ...fila, estado: 'Activo' });
    for (const fila of ALERGIAS) await asegurar('catalogo_alergia', 'sustancia', fila);
    for (const fila of TIPOS_EXAMEN) await asegurar('tipos_examen', 'nombre', fila);

    const administrador = await actorDe(adaptador, destino.usuarios[0][0], destino);
    for (const paciente of destino.pacientes(destino.prefijo)) {
      if (!await db.collection('pacientes').findOne({ dpi_o_documento: paciente.dpi_o_documento })) {
        await adaptador.pacientes.crear(datosDePaciente(paciente, destino), administrador);
      }
    }
    await escenariosLaboratorio(adaptador, destino);
  } finally {
    await adaptador.cerrar();
    await cn.cerrar();
  }
}

// IDs estables: volver a ejecutar el seeder no crea documentos nuevos.
const idEstable = (tipo, clave) => createHash('sha256').update(`${tipo}|${clave}`).digest('hex').slice(0, 20);

async function sembrarFirebase(destino, hash) {
  const cn = firebase.crearConexion(firebase.configuracionDesdeEntorno(), destino.nombre);
  const adaptador = adaptadorFirebase.crearAdaptador(destino.nombre);
  try {
    // Falla con un mensaje claro si faltan las credenciales o Firestore no responde.
    await cn.asegurarDisponible();
    const crearSiFalta = async (coleccion, clave, documento) => {
      const ref = cn.db.collection(coleccion).doc(idEstable(coleccion, clave));
      if (!(await ref.get()).exists) await ref.create(documento);
    };

    for (const u of destino.usuarios) await crearSiFalta('usuarios', u[0], usuarioDoc(u, destino, hash));
    for (const fila of DIAGNOSTICOS) await crearSiFalta('catalogo_diagnostico', fila.codigo_clinico, fila);
    for (const fila of MEDICAMENTOS) await crearSiFalta('medicamentos', fila.nombre, { ...fila, estado: 'Activo' });
    for (const fila of ALERGIAS) await crearSiFalta('catalogo_alergia', fila.sustancia, fila);
    for (const fila of VACUNAS) await crearSiFalta('vacunas', fila.nombre, fila);

    const administrador = await actorDe(adaptador, destino.usuarios[0][0], destino);
    for (const paciente of destino.pacientes(destino.prefijo)) {
      const marca = cn.db.collection('indices_unicos').doc(firebase.claveUnica('dpi', paciente.dpi_o_documento));
      if (!(await marca.get()).exists) {
        await adaptador.pacientes.crear(datosDePaciente(paciente, destino), administrador);
      }
    }
    await escenariosPediatria(adaptador, destino);
  } finally {
    await adaptador.cerrar();
    await cn.cerrar();
  }
}

const SEMBRADORES = { mongo: sembrarMongo, firebase: sembrarFirebase };

async function principal() {
  const contrasena = process.env.SEED_CONTRASENA;
  if (!contrasena) throw new Error('Define SEED_CONTRASENA en .env antes de ejecutar el seeder.');

  const pedidos = process.argv.slice(2);
  const motores = pedidos.length > 0 ? pedidos : Object.keys(SEMBRADORES);
  const desconocidos = motores.filter((m) => !SEMBRADORES[m]);
  if (desconocidos.length > 0) throw new Error(`Motor desconocido: ${desconocidos.join(', ')}. Usa mongo o firebase.`);

  const hash = await credenciales.hashear(contrasena);
  // Un motor caído no impide sembrar el otro.
  for (const motor of motores) {
    const destino = DESTINOS[motor];
    try {
      await SEMBRADORES[motor](destino, hash);
      console.log(`${destino.motor}: datos de prueba listos (${destino.nombre}).`);
    } catch (error) {
      console.error(`${destino.motor}: el seeder falló: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

principal().catch((error) => {
  console.error(`El seeder falló: ${error.message}`);
  process.exitCode = 1;
});
