// Datos de prueba de MongoDB (Laboratorio Clínico) y Firebase (Centro Médico Pediátrico).
// Se puede ejecutar varias veces sin duplicar. Uso:
//   npm run seed:nosql            # ambos motores
//   npm run seed:nosql -- mongo   # solo MongoDB
//   npm run seed:nosql -- firebase
// Los nombres de usuario deben ser únicos entre TODAS las instituciones, porque el login
// busca en todos los motores. Convención: <rol>.<institución>.

require('../src/config/env');
const { createHash } = require('node:crypto');
const credenciales = require('../src/adapters/seguridad/credencialesBcrypt');
const mongo = require('../src/adapters/persistence/mongo/conexion');
const { asegurarIndices } = require('../src/adapters/persistence/mongo/indices');
const { crearRepositorios: crearReposMongo } = require('../src/adapters/persistence/mongo/repositorios');
const firebase = require('../src/adapters/persistence/firebase/conexion');
const { crearRepositorios: crearReposFirebase } = require('../src/adapters/persistence/firebase/repositorios');
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
      ['laboratorista.laboratorio', 'Julia', 'Barrios', 'Laboratorista'],
    ],
    pacientes: (prefijo) => [adulto(prefijo), menor(prefijo, 1, 'Mateo', 'López Díaz', aniosAtras(8, '09-30'), 'M')],
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

async function sembrarMongo(destino, hash) {
  const cn = mongo.crearConexion(mongo.configuracionDesdeEntorno(), destino.nombre);
  const repos = crearReposMongo(cn);
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

    const administrador = await repos.usuarios.buscarPorNombre(destino.usuarios[0][0]);
    const actor = { id_usuario: administrador.id_usuario, id_institucion: destino.id_institucion, rol: administrador.rol };
    for (const paciente of destino.pacientes(destino.prefijo)) {
      if (!await db.collection('pacientes').findOne({ dpi_o_documento: paciente.dpi_o_documento })) {
        await repos.pacientes.crear(datosDePaciente(paciente, destino), actor);
      }
    }
  } finally {
    await cn.cerrar();
  }
}

// IDs estables: volver a ejecutar el seeder no crea documentos nuevos.
const idEstable = (tipo, clave) => createHash('sha256').update(`${tipo}|${clave}`).digest('hex').slice(0, 20);

async function sembrarFirebase(destino, hash) {
  const cn = firebase.crearConexion(firebase.configuracionDesdeEntorno(), destino.nombre);
  const { repositorios } = crearReposFirebase(cn);
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

    const administrador = await repositorios.usuarios.buscarPorNombre(destino.usuarios[0][0]);
    const actor = { id_usuario: administrador.id_usuario, id_institucion: destino.id_institucion, rol: administrador.rol };
    for (const paciente of destino.pacientes(destino.prefijo)) {
      const marca = cn.db.collection('indices_unicos').doc(firebase.claveUnica('dpi', paciente.dpi_o_documento));
      if (!(await marca.get()).exists) {
        await repositorios.pacientes.crear(datosDePaciente(paciente, destino), actor);
      }
    }
  } finally {
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
