const { MongoClient } = require('mongodb');
const { RegistroDuplicado, DatosInvalidos, MotorNoDisponible, ErrorDominio } = require('../../../domain/errores');

// Espera máxima para alcanzar el motor. En la nube (Atlas) la primera conexión tarda más: sube ESPERA_MOTOR_MS.
const esperaMotorMs = () => Number(process.env.ESPERA_MOTOR_MS) || 2000;

const ERRORES_DE_RED = new Set([
  'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError',
  'MongoNotConnectedError', 'MongoTopologyClosedError', 'MongoPoolClearedError',
]);
// Códigos del servidor que indican un nodo caído, sin primario o sin autorización de conexión.
const CODIGOS_NO_DISPONIBLE = new Set([6, 7, 13, 18, 89, 91, 9001, 10107, 11600, 11602, 13435, 13436]);

function crearTraductor(etiqueta) {
  return (error) => {
    if (error instanceof ErrorDominio) return error;
    if (error?.code === 11000) return new RegistroDuplicado('Ya existe un registro con esos datos.');
    if (error?.code === 121) return new DatosInvalidos('Los datos no cumplen las restricciones del modelo.');
    if (ERRORES_DE_RED.has(error?.name) || CODIGOS_NO_DISPONIBLE.has(error?.code)) {
      console.error(`[mongo] ${error.name} ${error.message}`);
      return new MotorNoDisponible(etiqueta);
    }
    return error;
  };
}

function crearConexion(configuracion, etiqueta) {
  const cliente = new MongoClient(configuracion.uri, {
    serverSelectionTimeoutMS: esperaMotorMs(),
    connectTimeoutMS: esperaMotorMs(),
    // Un campo undefined no debe guardarse como null ni sobrescribir un valor existente.
    ignoreUndefined: true,
  });
  // Sin este manejador, un error de monitoreo del driver tumba el proceso.
  cliente.on('error', (error) => console.error(`[mongo] ${error.message}`));

  const db = () => cliente.db(configuracion.baseDeDatos);

  return {
    db,
    traducirError: crearTraductor(etiqueta),
    cerrar: () => cliente.close(),

    // Transacción multi-documento (requiere replica set). withTransaction reintenta sola los
    // conflictos de escritura transitorios; cualquier otro error revierte todo y se propaga.
    async transaccion(trabajo) {
      const sesion = cliente.startSession();
      let resultado;
      try {
        await sesion.withTransaction(async () => {
          resultado = await trabajo(sesion);
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
        return resultado;
      } finally {
        await sesion.endSession();
      }
    },
  };
}

const configuracionDesdeEntorno = () => ({
  uri: process.env.MONGO_URI || 'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true',
  baseDeDatos: process.env.MONGO_DATABASE || 'laboratorio_clinico',
});

module.exports = { crearConexion, configuracionDesdeEntorno };
