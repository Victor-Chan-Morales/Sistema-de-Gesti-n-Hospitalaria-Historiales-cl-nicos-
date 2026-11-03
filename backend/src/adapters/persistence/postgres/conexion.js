const { Pool, types } = require('pg');
const { RegistroDuplicado, DatosInvalidos, MotorNoDisponible } = require('../../../domain/errores');
const { mapearFila } = require('../sql-comun/mapeadores');

const TIMEOUT_CONEXION_MS = 2000;

// El contrato pide fechas como texto y decimales como número. Por defecto, pg convierte
// DATE a Date (con riesgo de cambio de día por la zona horaria) y NUMERIC a string.
const OID = { BIGINT: 20, DATE: 1082, TIMESTAMP: 1114, NUMERIC: 1700 };
const conversores = {
  [OID.BIGINT]: Number,
  [OID.DATE]: (v) => v,
  [OID.TIMESTAMP]: (v) => v,
  [OID.NUMERIC]: Number.parseFloat,
};
const tipos = {
  getTypeParser: (oid, formato) => conversores[oid] ?? types.getTypeParser(oid, formato),
};

const ES_ERROR_DE_RED = /^(ECONN|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|EPIPE|EAI_)/;
const ES_ERROR_DE_CONEXION = /Connection terminated|timeout exceeded when trying to connect/i;

function crearTraductor(etiqueta) {
  return (error) => {
    const codigo = error.code ?? '';
    if (codigo === '23505') return new RegistroDuplicado('Ya existe un registro con esos datos.');
    if (codigo === '23503') return new DatosInvalidos('Los datos hacen referencia a un registro inexistente.');
    if (codigo.startsWith('22') || codigo === '23502' || codigo === '23514') {
      return new DatosInvalidos('Los datos no cumplen las restricciones del modelo.');
    }
    if (/^(08|53|57)/.test(codigo) || codigo === '28P01' || codigo === '3D000'
      || ES_ERROR_DE_RED.test(codigo) || ES_ERROR_DE_CONEXION.test(error.message)) {
      console.error(`[postgres] ${codigo} ${error.message}`);
      return new MotorNoDisponible(etiqueta);
    }
    return error;
  };
}

function crearOperaciones(ejecutor) {
  const q = async (sql, parametros = []) => {
    const { rows } = await ejecutor.query(sql, parametros);
    return rows.map(mapearFila);
  };
  return {
    q,
    unica: async (sql, parametros) => (await q(sql, parametros))[0] ?? null,
    ejecutar: async (sql, parametros = []) => (await ejecutor.query(sql, parametros)).rowCount,
    async insertar(tabla, valores, columnaId) {
      const columnas = Object.keys(valores);
      const marcadores = columnas.map((_, i) => `$${i + 1}`).join(', ');
      const retorno = columnaId ? ` RETURNING ${columnaId} AS id` : '';
      const { rows } = await ejecutor.query(
        `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores})${retorno}`,
        columnas.map((c) => valores[c] ?? null),
      );
      return columnaId ? String(rows[0].id) : undefined;
    },
    async actualizar(tabla, cambios, columnaId, id) {
      const columnas = Object.keys(cambios);
      const asignaciones = columnas.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const { rowCount } = await ejecutor.query(
        `UPDATE ${tabla} SET ${asignaciones} WHERE ${columnaId} = $${columnas.length + 1}`,
        [...columnas.map((c) => cambios[c] ?? null), id],
      );
      return rowCount;
    },
  };
}

function crearConexion(configuracion, etiqueta) {
  const pool = new Pool({
    ...configuracion,
    types: tipos,
    max: 10,
    connectionTimeoutMillis: TIMEOUT_CONEXION_MS,
  });

  // Sin este manejador, perder una conexión inactiva tumba todo el proceso de Node.
  pool.on('error', (error) => console.error(`[postgres] conexión inactiva perdida: ${error.message}`));

  return {
    ...crearOperaciones(pool),
    traducirError: crearTraductor(etiqueta),
    cerrar: () => pool.end(),
    async transaccion(trabajo) {
      const cliente = await pool.connect();
      let conexionDanada;
      try {
        await cliente.query('BEGIN');
        const resultado = await trabajo(crearOperaciones(cliente));
        await cliente.query('COMMIT');
        return resultado;
      } catch (error) {
        await cliente.query('ROLLBACK').catch((falloRollback) => {
          conexionDanada = falloRollback;
        });
        throw error;
      } finally {
        cliente.release(conexionDanada);
      }
    },
  };
}

const configuracionDesdeEntorno = () => ({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

module.exports = { crearConexion, configuracionDesdeEntorno };
