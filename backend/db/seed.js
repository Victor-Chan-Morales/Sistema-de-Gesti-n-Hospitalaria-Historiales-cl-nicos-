// Datos de prueba de PostgreSQL y MySQL. Se puede ejecutar varias veces sin duplicar.
// Los nombres de usuario deben ser únicos entre TODAS las instituciones, porque el login
// busca en todos los motores. Convención: <rol>.<institución>.

require('../src/config/env');
const credenciales = require('../src/adapters/seguridad/credencialesBcrypt');
const postgres = require('../src/adapters/persistence/postgres/conexion');
const mysql = require('../src/adapters/persistence/mysql/conexion');
const { crearRepositorios: crearReposPostgres } = require('../src/adapters/persistence/postgres/repositorios');
const { crearRepositorios: crearReposMysql } = require('../src/adapters/persistence/mysql/repositorios');
const { hoy } = require('../src/domain/fechas');

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

const pacientesDe = (prefijo) => [
  {
    nombres: 'Ana Lucía',
    apellidos: 'Pérez García',
    dpi_o_documento: `${prefijo}-1000000000101`,
    fecha_nacimiento: '1988-04-12',
    sexo: 'F',
    tipo_sangre: 'O+',
    telefonos: [{ numero: '5555-0101', tipo: 'Celular' }],
    correos: [{ correo: 'ana.perez@example.com' }],
    contactos_emergencia: [{
      nombres: 'Carlos',
      apellidos: 'Pérez',
      parentesco: 'Hermano',
      telefonos: [{ numero: '5555-0102', tipo: 'Celular' }],
    }],
    representantes: [],
  },
  {
    nombres: 'Mateo',
    apellidos: 'López Díaz',
    dpi_o_documento: `${prefijo}-MENOR-0001`,
    fecha_nacimiento: `${new Date().getFullYear() - 8}-09-30`,
    sexo: 'M',
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
  },
];

const INSTITUCIONES = [
  {
    motor: 'PostgreSQL',
    modulo: postgres,
    crearRepos: crearReposPostgres,
    marcador: '$1',
    institucion: { id_institucion: 1, nombre: 'Hospital General', tipo_institucion: 'Hospital General', estado: 'Activa' },
    prefijo: 'HG',
    usuarios: [
      ['admin.hospital', 'Andrea', 'Ramírez', 'Administrador'],
      ['secretaria.hospital', 'Beatriz', 'Morales', 'Secretaria'],
      ['medico.hospital', 'Daniel', 'Castillo', 'Médico'],
    ],
  },
  {
    motor: 'MySQL',
    modulo: mysql,
    crearRepos: crearReposMysql,
    marcador: '?',
    institucion: { id_institucion: 2, nombre: 'Clínica Odontológica', tipo_institucion: 'Clínica Odontológica', estado: 'Activa' },
    prefijo: 'CO',
    usuarios: [
      ['admin.clinica', 'Elena', 'Santos', 'Administrador'],
      ['secretaria.clinica', 'Fernanda', 'Rojas', 'Secretaria'],
      ['odontologo.clinica', 'Gabriel', 'Mejía', 'Odontólogo'],
    ],
  },
];

async function sembrar(definicion, hashContrasena) {
  const { motor, modulo, crearRepos, marcador, institucion, prefijo, usuarios } = definicion;
  const cn = modulo.crearConexion(modulo.configuracionDesdeEntorno(), motor);
  const repos = crearRepos(cn);

  async function asegurar(tabla, columnaClave, fila, columnaId) {
    const existente = await cn.unica(
      `SELECT ${columnaClave} AS clave FROM ${tabla} WHERE ${columnaClave} = ${marcador}`,
      [fila[columnaClave]],
    );
    if (!existente) await cn.insertar(tabla, fila, columnaId);
  }

  try {
    await asegurar('Institucion', 'id_institucion', institucion, 'id_institucion');

    for (const [usuario, nombres, apellidos, rol] of usuarios) {
      await asegurar('Usuario', 'usuario', {
        id_institucion: institucion.id_institucion,
        nombres,
        apellidos,
        usuario,
        contrasena_hash: hashContrasena,
        rol,
        estado: 'Activo',
        fecha_creacion: hoy(),
      }, 'id_usuario');
    }

    for (const fila of DIAGNOSTICOS) await asegurar('Catalogo_Diagnostico', 'codigo_clinico', fila, 'id_catalogo_diag');
    for (const fila of MEDICAMENTOS) await asegurar('Medicamento', 'nombre', { ...fila, estado: 'Activo' }, 'id_medicamento');
    for (const fila of ALERGIAS) await asegurar('Catalogo_Alergia', 'sustancia', fila, 'id_catalogo_alergia');

    const administrador = await repos.usuarios.buscarPorNombre(usuarios[0][0]);
    const actor = { id_usuario: administrador.id_usuario, id_institucion: institucion.id_institucion, rol: administrador.rol };
    for (const paciente of pacientesDe(prefijo)) {
      const yaExiste = await cn.unica(
        `SELECT id_paciente FROM Paciente WHERE dpi_o_documento = ${marcador}`,
        [paciente.dpi_o_documento],
      );
      if (!yaExiste) {
        await repos.pacientes.crear({
          ...paciente,
          id_institucion: institucion.id_institucion,
          codigo_historial: `HC-${institucion.id_institucion}-${paciente.dpi_o_documento}`,
          fecha_registro: hoy(),
        }, actor);
      }
    }
    console.log(`${motor}: datos de prueba listos (${institucion.nombre}).`);
  } finally {
    await cn.cerrar();
  }
}

async function principal() {
  const contrasena = process.env.SEED_CONTRASENA;
  if (!contrasena) throw new Error('Define SEED_CONTRASENA en .env antes de ejecutar el seeder.');
  const hash = await credenciales.hashear(contrasena);
  for (const definicion of INSTITUCIONES) await sembrar(definicion, hash);
}

principal().catch((error) => {
  console.error(`El seeder falló: ${error.message}`);
  process.exitCode = 1;
});
