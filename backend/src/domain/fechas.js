// El contrato usa fechas locales de la institución, sin zona horaria:
// fecha 'YYYY-MM-DD' y fecha y hora 'YYYY-MM-DDTHH:MM:SS'.

const dosDigitos = (n) => String(n).padStart(2, '0');

function formatearFecha(d) {
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

function formatearFechaHora(d) {
  const hora = [d.getHours(), d.getMinutes(), d.getSeconds()].map(dosDigitos).join(':');
  return `${formatearFecha(d)}T${hora}`;
}

const hoy = (ahoraMs = Date.now()) => formatearFecha(new Date(ahoraMs));
const ahora = (ahoraMs = Date.now()) => formatearFechaHora(new Date(ahoraMs));

function esFecha(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor ?? '');
  if (!m) return false;
  // Date acepta '2026-02-31' y lo desplaza: se compara de vuelta para rechazarlo.
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return formatearFecha(d) === valor;
}

// Devuelve 'YYYY-MM-DDTHH:MM:SS' o null si el valor no es válido.
function normalizarFechaHora(valor) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(valor ?? '');
  if (!m || !esFecha(m[1])) return null;
  const [hh, mm, ss = '00'] = [m[2], m[3], m[4]];
  if (Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59) return null;
  return `${m[1]}T${hh}:${mm}:${ss}`;
}

function desplazarSegundos(fechaHora, segundos) {
  return formatearFechaHora(new Date(new Date(fechaHora).getTime() + segundos * 1000));
}

function edadEnAnios(fechaNacimiento, referencia = hoy()) {
  const [a1, m1, d1] = fechaNacimiento.split('-').map(Number);
  const [a2, m2, d2] = referencia.split('-').map(Number);
  const yaCumplio = m2 > m1 || (m2 === m1 && d2 >= d1);
  return a2 - a1 - (yaCumplio ? 0 : 1);
}

module.exports = { hoy, ahora, esFecha, normalizarFechaHora, desplazarSegundos, edadEnAnios };
