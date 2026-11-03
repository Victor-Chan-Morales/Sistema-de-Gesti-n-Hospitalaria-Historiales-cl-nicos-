// Lógica común a los dos motores relacionales: las columnas de la sección común
// son idénticas, así que la conversión de fila a entidad también lo es.

const { ErrorDominio, DatosInvalidos } = require('../../../domain/errores');

const ID_MAXIMO = 2147483647;
const ES_FECHA_HORA = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?$/;

// IDs como strings opacos y fechas con el formato del contrato.
function mapearFila(fila) {
  const entidad = {};
  for (const [columna, valor] of Object.entries(fila)) {
    if (columna.startsWith('id_') && valor !== null) {
      entidad[columna] = String(valor);
    } else if (typeof valor === 'string' && ES_FECHA_HORA.test(valor)
      && (columna.startsWith('fecha') || columna === 'ultimo_acceso')) {
      entidad[columna] = valor.replace(ES_FECHA_HORA, '$1T$2');
    } else {
      entidad[columna] = valor;
    }
  }
  return entidad;
}

function esIdValido(id) {
  return /^[1-9]\d{0,9}$/.test(String(id)) && Number(id) <= ID_MAXIMO;
}

// Un ID enviado como referencia en el cuerpo de una petición.
function idReferencia(id, campo) {
  if (id === undefined || id === null) return null;
  if (!esIdValido(id)) throw new DatosInvalidos(`${campo} hace referencia a un registro inexistente.`);
  return id;
}

// Hace que todos los métodos traduzcan los errores del driver a errores de dominio.
function envolverRepositorios(repositorios, traducirError) {
  const envueltos = {};
  for (const [nombre, metodos] of Object.entries(repositorios)) {
    envueltos[nombre] = {};
    for (const [metodo, funcion] of Object.entries(metodos)) {
      envueltos[nombre][metodo] = async (...argumentos) => {
        try {
          return await funcion(...argumentos);
        } catch (error) {
          throw error instanceof ErrorDominio ? error : traducirError(error);
        }
      };
    }
  }
  return envueltos;
}

module.exports = { mapearFila, esIdValido, idReferencia, envolverRepositorios };
