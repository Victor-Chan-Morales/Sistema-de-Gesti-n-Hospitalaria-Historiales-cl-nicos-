const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { initializeApp, deleteApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { RegistroDuplicado, DatosInvalidos, MotorNoDisponible, ErrorDominio } = require('../../../domain/errores');

const esperaMotorMs = () => Number(process.env.ESPERA_MOTOR_MS) || 2000;
const VIGENCIA_DISPONIBILIDAD_MS = 10000;
const INTENTOS_TRANSACCION = 10;

// Códigos gRPC: 3 INVALID_ARGUMENT, 4 DEADLINE_EXCEEDED, 6 ALREADY_EXISTS, 7 PERMISSION_DENIED,
// 14 UNAVAILABLE, 16 UNAUTHENTICATED.
const SIN_CONEXION = new Set([4, 7, 14, 16]);
const MENSAJE_SIN_CONEXION = /could not (reach|load the default credentials)|unable to read the credential file|ECONNREFUSED|deadline exceeded|unavailable/i;

function crearTraductor(etiqueta) {
  return (error) => {
    if (error instanceof ErrorDominio) return error;
    if (error?.code === 6) return new RegistroDuplicado('Ya existe un registro con esos datos.');
    if (error?.code === 3) return new DatosInvalidos('Los datos no cumplen las restricciones del modelo.');
    if (SIN_CONEXION.has(error?.code) || MENSAJE_SIN_CONEXION.test(error?.message ?? '')) {
      console.error(`[firebase] ${error.code ?? ''} ${error.message}`);
      return new MotorNoDisponible(etiqueta);
    }
    return error;
  };
}

let contadorApps = 0;

// El archivo debe existir y ser un JSON con la clave privada de la cuenta de servicio.
function archivoDeCredencialesValido(ruta) {
  try {
    const cuenta = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    return Boolean(cuenta.private_key && cuenta.client_email);
  } catch {
    return false;
  }
}

function crearConexion(configuracion, etiqueta) {
  const opciones = { projectId: configuracion.projectId };
  // Con el emulador (FIRESTORE_EMULATOR_HOST) no hacen falta credenciales. Con un proyecto real,
  // se toman de GOOGLE_APPLICATION_CREDENTIALS, que apunta a un archivo fuera del repositorio.
  // Si ese archivo falta, no se indicó o no es legible, el SDK falla más tarde con una promesa sin
  // atender, que puede tumbar el servidor: se comprueba antes y el motor responde como no
  // disponible (503).
  const emulador = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const rutaCredenciales = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const credencialesValidas = emulador || (Boolean(rutaCredenciales) && archivoDeCredencialesValido(rutaCredenciales));
  if (!emulador && credencialesValidas) opciones.credential = applicationDefault();
  // Un nombre propio por conexión permite abrir y cerrar adaptadores (pruebas) sin chocar.
  const app = initializeApp(opciones, `pediatrico-${process.pid}-${++contadorApps}`);
  const db = getFirestore(app);
  // Un campo undefined no debe romper la escritura: se omite.
  db.settings({ ignoreUndefinedProperties: true });

  const traducirError = crearTraductor(etiqueta);

  // Firestore reintenta mucho tiempo si el servicio no responde. Antes de operar se comprueba
  // la conexión con un límite corto, para responder 503 de inmediato en lugar de colgar la
  // petición. No se corta una transacción ya iniciada: podría confirmarse después de avisar el error.
  let ultimaComprobacion = 0;
  async function asegurarDisponible() {
    if (!credencialesValidas) {
      console.error(rutaCredenciales
        ? `[firebase] No se puede leer el archivo de credenciales indicado en GOOGLE_APPLICATION_CREDENTIALS: ${rutaCredenciales}`
        : '[firebase] Falta GOOGLE_APPLICATION_CREDENTIALS (o FIRESTORE_EMULATOR_HOST para el emulador).');
      throw new MotorNoDisponible(etiqueta);
    }
    if (Date.now() - ultimaComprobacion < VIGENCIA_DISPONIBILIDAD_MS) return;
    let temporizador;
    const lectura = db.collection('_salud').doc('ping').get();
    lectura.catch(() => {}); // si pierde la carrera, su fallo posterior no debe quedar sin atender
    const limite = new Promise((_, rechazar) => {
      temporizador = setTimeout(() => rechazar(new MotorNoDisponible(etiqueta)), esperaMotorMs());
    });
    try {
      await Promise.race([lectura, limite]);
      ultimaComprobacion = Date.now();
    } finally {
      clearTimeout(temporizador);
    }
  }

  return {
    db,
    traducirError,
    asegurarDisponible,
    cerrar: () => deleteApp(app),
    // Transacción de Firestore: todas las lecturas antes que las escrituras, y reintento
    // automático si otra transacción modifica los mismos documentos.
    transaccion: (trabajo) => db.runTransaction(trabajo, { maxAttempts: INTENTOS_TRANSACCION }),
  };
}

const configuracionDesdeEntorno = () => ({
  projectId: process.env.FIREBASE_PROJECT_ID || 'demo-red-hospitales',
});

// Clave de un documento de unicidad. Firestore no tiene índices únicos: se crea un documento
// cuyo ID es la clave y se comprueba su existencia dentro de la transacción.
const claveUnica = (tipo, valor) => `${tipo}_${createHash('sha256').update(String(valor)).digest('hex')}`;

module.exports = { crearConexion, configuracionDesdeEntorno, claveUnica };
