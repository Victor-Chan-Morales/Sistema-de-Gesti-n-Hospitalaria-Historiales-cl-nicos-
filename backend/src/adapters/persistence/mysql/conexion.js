const mysql = require('mysql2/promise');
const { RegistroDuplicado, DatosInvalidos, MotorNoDisponible } = require('../../../domain/errores');
const { mapearFila } = require('../sql-comun/mapeadores');

const TIMEOUT_CONEXION_MS = 2000;

const ERRORES_DE_DATOS = new Set([
  'ER_DATA_TOO_LONG',
  'ER_BAD_NULL_ERROR',
  'ER_TRUNCATED_WRONG_VALUE',
  'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD',
  'WARN_DATA_TRUNCATED',
  'ER_WARN_DATA_OUT_OF_RANGE',
  'ER_CHECK_CONSTRAINT_VIOLATED',
]);
const ERRORES_DE_CONEXION = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'ER_CON_COUNT_ERROR',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
  'ER_SERVER_SHUTDOWN',
]);
const ES_ERROR_DE_RED = /^(ECONN|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|EPIPE|EAI_)/;

function crearTraductor(etiqueta) {
  return (error) => {
    const codigo = error.code ?? '';
    if (codigo === 'ER_DUP_ENTRY') return new RegistroDuplicado('Ya existe un registro con esos datos.');
    if (codigo === 'ER_NO_REFERENCED_ROW_2') {
      return new DatosInvalidos('Los datos hacen referencia a un registro inexistente.');
    }
    if (ERRORES_DE_DATOS.has(codigo)) return new DatosInvalidos('Los datos no cumplen las restricciones del modelo.');
    if (error.fatal || ERRORES_DE_CONEXION.has(codigo) || ES_ERROR_DE_RED.test(codigo)
      || /closed state/i.test(error.message)) {
      console.error(`[mysql] ${codigo} ${error.message}`);
      return new MotorNoDisponible(etiqueta);
    }
    return error;
  };
}

function crearOperaciones(ejecutor) {
  const q = async (sql, parametros = []) => {
    const [filas] = await ejecutor.query(sql, parametros);
    return filas.map(mapearFila);
  };
  return {
    q,
    unica: async (sql, parametros) => (await q(sql, parametros))[0] ?? null,
    ejecutar: async (sql, parametros = []) => (await ejecutor.query(sql, parametros))[0].affectedRows,
    async insertar(tabla, valores, columnaId) {
      const columnas = Object.keys(valores);
      const marcadores = columnas.map(() => '?').join(', ');
      const [resultado] = await ejecutor.query(
        `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores})`,
        columnas.map((c) => valores[c] ?? null),
      );
      return columnaId ? String(valores[columnaId] ?? resultado.insertId) : undefined;
    },
    async actualizar(tabla, cambios, columnaId, id) {
      const columnas = Object.keys(cambios);
      const asignaciones = columnas.map((c) => `${c} = ?`).join(', ');
      const [resultado] = await ejecutor.query(
        `UPDATE ${tabla} SET ${asignaciones} WHERE ${columnaId} = ?`,
        [...columnas.map((c) => cambios[c] ?? null), id],
      );
      // affectedRows cuenta las filas encontradas por usar flags por defecto de mysql2 (FOUND_ROWS).
      return resultado.affectedRows;
    },
  };
}

function crearConexion(configuracion, etiqueta) {
  const pool = mysql.createPool({
    ...configuracion,
    connectionLimit: 10,
    connectTimeout: TIMEOUT_CONEXION_MS,
    charset: 'utf8mb4', // Necesario para comparar bien ENUM con acentos, como 'Médico'.
    dateStrings: true, // Fechas como texto, igual que el adaptador de PostgreSQL.
    decimalNumbers: true, // DECIMAL como número y no como string.
  });

  return {
    ...crearOperaciones(pool),
    traducirError: crearTraductor(etiqueta),
    cerrar: () => pool.end(),
    async transaccion(trabajo) {
      const conexion = await pool.getConnection();
      try {
        await conexion.beginTransaction();
        const resultado = await trabajo(crearOperaciones(conexion));
        await conexion.commit();
        return resultado;
      } catch (error) {
        await conexion.rollback().catch(() => conexion.destroy());
        throw error;
      } finally {
        conexion.release();
      }
    },
  };
}

const configuracionDesdeEntorno = () => ({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
});

module.exports = { crearConexion, configuracionDesdeEntorno };
