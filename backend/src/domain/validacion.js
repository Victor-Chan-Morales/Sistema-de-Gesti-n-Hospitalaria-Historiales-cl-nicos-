const { DatosInvalidos } = require('./errores');
const { esFecha, normalizarFechaHora } = require('./fechas');

// Valida y limpia datos de entrada según un esquema. Devuelve solo los campos
// conocidos, de modo que todos los motores reciben exactamente lo mismo y
// rechazan lo mismo, sin depender de los errores de cada driver.
//
// Campo: { tipo, requerido?, max?, min?, valores?, esquema? }
// Tipos: texto, id, entero, decimal, fecha, fechaHora, enum, lista, objeto.

const validadores = {
  texto(v, c) {
    if (typeof v !== 'string') return 'debe ser texto';
    if (c.requerido && v.trim() === '') return 'no puede estar vacío';
    if (c.max && v.length > c.max) return `admite como máximo ${c.max} caracteres`;
    return null;
  },
  id(v) {
    const valido = (typeof v === 'string' && v !== '') || Number.isInteger(v);
    return valido ? null : 'debe ser un identificador';
  },
  entero(v, c) {
    if (!Number.isInteger(v)) return 'debe ser un número entero';
    return fueraDeRango(v, c);
  },
  decimal(v, c) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'debe ser un número';
    return fueraDeRango(v, c);
  },
  fecha: (v) => (esFecha(v) ? null : 'debe tener formato YYYY-MM-DD'),
  fechaHora: (v) => (normalizarFechaHora(v) ? null : 'debe tener formato YYYY-MM-DDTHH:MM:SS'),
  enum: (v, c) => (c.valores.includes(v) ? null : `debe ser uno de: ${c.valores.join(', ')}`),
  lista: (v) => (Array.isArray(v) ? null : 'debe ser una lista'),
  objeto: (v) => (esObjeto(v) ? null : 'debe ser un objeto'),
};

function fueraDeRango(v, { min, max }) {
  if (min !== undefined && v < min) return `debe ser mayor o igual que ${min}`;
  if (max !== undefined && v > max) return `debe ser menor o igual que ${max}`;
  return null;
}

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function normalizar(valor, campo, ruta, errores) {
  switch (campo.tipo) {
    case 'id':
      return String(valor);
    case 'texto':
      return valor.trim();
    case 'fechaHora':
      return normalizarFechaHora(valor);
    case 'lista':
      return valor.map((elemento, i) =>
        recorrer(elemento, campo.esquema, `${ruta}[${i}].`, false, errores));
    case 'objeto':
      return recorrer(valor, campo.esquema, `${ruta}.`, false, errores);
    default:
      return valor;
  }
}

function recorrer(datos, esquema, prefijo, parcial, errores) {
  if (!esObjeto(datos)) {
    errores.push(`${prefijo || 'El cuerpo '}debe ser un objeto`);
    return {};
  }
  const limpio = {};
  for (const [nombre, campo] of Object.entries(esquema)) {
    const ruta = `${prefijo}${nombre}`;
    const valor = datos[nombre];
    if (valor === undefined || valor === null) {
      if (campo.requerido && !parcial) errores.push(`${ruta}: es obligatorio`);
      else if (valor === null && campo.requerido) errores.push(`${ruta}: es obligatorio`);
      else if (valor === null) limpio[nombre] = null;
      continue;
    }
    const problema = validadores[campo.tipo](valor, campo);
    if (problema) {
      errores.push(`${ruta}: ${problema}`);
      continue;
    }
    limpio[nombre] = normalizar(valor, campo, ruta, errores);
  }
  return limpio;
}

// parcial: true permite omitir campos requeridos (para PATCH), pero no anularlos.
function validar(datos, esquema, { parcial = false } = {}) {
  const errores = [];
  const limpio = recorrer(datos, esquema, '', parcial, errores);
  if (errores.length > 0) throw new DatosInvalidos(`Datos inválidos: ${errores.join('; ')}.`);
  return limpio;
}

module.exports = { validar };
