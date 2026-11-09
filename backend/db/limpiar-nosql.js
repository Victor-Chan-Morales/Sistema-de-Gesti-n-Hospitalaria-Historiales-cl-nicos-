// Borra los datos de MongoDB (Laboratorio) y Firestore (Pediátrico) para empezar de cero.
// Sin --confirmar solo muestra qué se borraría. Después se vuelve a sembrar con npm run seed:nosql. Uso:
//   npm run limpiar:nosql                          # muestra qué se borraría, en ambos motores
//   npm run limpiar:nosql -- mongo --confirmar     # borra solo la base de MongoDB
//   npm run limpiar:nosql -- firebase --confirmar  # borra solo las colecciones de Firestore
//   npm run limpiar:nosql -- --confirmar           # borra ambos
// MongoDB: elimina únicamente la base indicada en MONGO_DATABASE, nunca otras bases del clúster.
// Firestore: elimina todas las colecciones del proyecto de FIREBASE_PROJECT_ID.

require('../src/config/env');
const mongo = require('../src/adapters/persistence/mongo/conexion');
const firebase = require('../src/adapters/persistence/firebase/conexion');

async function limpiarMongo(confirmar) {
  const configuracion = mongo.configuracionDesdeEntorno();
  const cn = mongo.crearConexion(configuracion, 'Laboratorio Clínico');
  try {
    const db = cn.db();
    const colecciones = (await db.listCollections().toArray()).map((c) => c.name);
    console.log(`MongoDB: base "${configuracion.baseDeDatos}" con ${colecciones.length} colecciones: ${colecciones.join(', ') || '(vacía)'}`);
    if (!confirmar) return console.log('MongoDB: no se borró nada (falta --confirmar).');
    await db.dropDatabase();
    console.log(`MongoDB: base "${configuracion.baseDeDatos}" eliminada.`);
  } catch (error) {
    throw cn.traducirError(error);
  } finally {
    await cn.cerrar();
  }
}

async function limpiarFirebase(confirmar) {
  const configuracion = firebase.configuracionDesdeEntorno();
  const cn = firebase.crearConexion(configuracion, 'Centro Médico Pediátrico');
  try {
    await cn.asegurarDisponible();
    const colecciones = await cn.db.listCollections();
    console.log(`Firestore: proyecto "${configuracion.projectId}" con ${colecciones.length} colecciones: ${colecciones.map((c) => c.id).join(', ') || '(vacío)'}`);
    if (!confirmar) return console.log('Firestore: no se borró nada (falta --confirmar).');
    for (const coleccion of colecciones) await cn.db.recursiveDelete(coleccion);
    console.log('Firestore: colecciones eliminadas.');
  } catch (error) {
    throw cn.traducirError(error);
  } finally {
    await cn.cerrar();
  }
}

const LIMPIADORES = { mongo: limpiarMongo, firebase: limpiarFirebase };

async function principal() {
  const argumentos = process.argv.slice(2);
  const confirmar = argumentos.includes('--confirmar');
  const pedidos = argumentos.filter((a) => !a.startsWith('--'));
  const motores = pedidos.length > 0 ? pedidos : Object.keys(LIMPIADORES);
  const desconocidos = motores.filter((m) => !LIMPIADORES[m]);
  if (desconocidos.length > 0) throw new Error(`Motor desconocido: ${desconocidos.join(', ')}. Usa mongo o firebase.`);

  // Un motor caído no impide limpiar el otro.
  for (const motor of motores) {
    try {
      await LIMPIADORES[motor](confirmar);
    } catch (error) {
      console.error(`${motor}: la limpieza falló: ${error.message}`);
      process.exitCode = 1;
    }
  }
  if (confirmar) console.log('Para volver a cargar los datos de prueba: npm run seed:nosql');
}

principal().catch((error) => {
  console.error(`La limpieza falló: ${error.message}`);
  process.exitCode = 1;
});
