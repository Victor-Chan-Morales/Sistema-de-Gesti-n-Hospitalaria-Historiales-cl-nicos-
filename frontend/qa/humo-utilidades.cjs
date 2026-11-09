// Prueba de humo de la lógica del frontend (sin navegador): carga los scripts
// como en el navegador y verifica utilidades puras y el manejo de 401/503/409.
// Uso: node frontend/qa/humo-utilidades.cjs (desde la raíz del proyecto)
"use strict";

// --- Estabilización del entorno de navegador ---
const almacen = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
};
globalThis.location = { href: '', replace: () => {} };
globalThis.document = { getElementById: () => null };
globalThis.fetch = null; // se define por prueba

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const base = process.argv[2] || 'frontend';

const cargarScript = (relativo) => {
  const codigo = fs.readFileSync(path.join(base, relativo), 'utf8');
  vm.runInThisContext(codigo, { filename: relativo });
};

let fallos = 0;
const verificar = (descripcion, condicion) => {
  if (condicion) {
    console.log(`ok - ${descripcion}`);
  } else {
    fallos += 1;
    console.log(`FALLO - ${descripcion}`);
  }
};

// --- Carga como en el navegador ---
cargarScript('js/sesion.js');
cargarScript('js/api.js');
cargarScript('js/utilidades.js');

// --- sesion.js ---
guardarSesion('tok', { id_usuario: 'u1', id_institucion: 3, rol: 'Laboratorista', nombres: 'Ana' });
verificar('guardarSesion/obtenerSesion', obtenerSesion()?.token === 'tok' && obtenerSesion().usuario.rol === 'Laboratorista');
verificar('esLaboratorio con id numérico', esLaboratorio(obtenerSesion().usuario) === true);
verificar('tienePermiso secretaria no ve historial', tienePermiso('Secretaria', PERMISOS.VER_HISTORIAL_CLINICO) === false);
verificar('tienePermiso admin archiva', tienePermiso('Administrador', PERMISOS.ARCHIVAR_PACIENTES) === true);
verificar('médico tiene todos los permisos', TODOS_LOS_PERMISOS.every((p) => tienePermiso('Médico', p)));
limpiarSesion();
verificar('limpiarSesion', obtenerSesion() === null);

// --- utilidades.js: formato y presentación ---
verificar('esc escapa HTML', esc('<b>&"\'') === '&lt;b&gt;&amp;&quot;&#39;');
verificar('o con null', o(null) === '—');
verificar('o con texto', o('Ana') === 'Ana');
verificar('fechaLarga', fechaLarga('1988-04-12') === '12 abr 1988');
verificar('fechaLarga con hora completa', fechaLarga('1988-04-12T00:00:00') === '12 abr 1988');
verificar('fechaHoraLarga', fechaHoraLarga('2026-12-01T09:30:00') === '01 dic 2026, 09:30');
verificar('aFechaHora completa datetime-local', aFechaHora('2026-12-01T09:30') === '2026-12-01T09:30:00');
verificar('aValorDateTimeLocal con Date local', aValorDateTimeLocal(new Date(2026, 11, 1, 9, 5)) === '2026-12-01T09:05');
verificar('hoy formato ISO', /^\d{4}-\d{2}-\d{2}$/.test(hoy()));
verificar('ahora formato con hora', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/.test(ahora()));

// Edad dinámica respecto a hoy (no hardcodear años).
const anio = new Date().getFullYear();
verificar('calcularEdad', calcularEdad(`${anio - 30}-06-15`) === 30 || calcularEdad(`${anio - 30}-06-15`) === 29);
verificar('esMenorDeEdad con nacimiento de 8 años', esMenorDeEdad(`${anio - 8}-09-30`) === true);
verificar('esMenorDeEdad con adulto', esMenorDeEdad(`${anio - 40}-01-01`) === false);
verificar('insignia activo en verde', insignia('Activo').includes('green'));
verificar('insignia estado desconocido no truena', insignia('Otro estado').includes('gray'));

// --- construirConsulta ---
verificar('construirConsulta omite vacíos', construirConsulta({ texto: 'ana', estado: '', desplazamiento: 0 }) === 'texto=ana&desplazamiento=0');

// --- api.js: 401 limpia sesión y manda al login ---
let respuestaSimulada = { ok: true, status: 200, json: async () => ({ elemento: 1 }) };
let consultaPedida = null;
globalThis.fetch = async (ruta, opciones) => {
  consultaPedida = { ruta, opciones };
  return respuestaSimulada;
};

(async () => {
  guardarSesion('tok', { rol: 'Médico' });
  const datos = await api.obtener('/api/prueba');
  verificar('apiFetch envía Authorization', consultaPedida.opciones.headers.Authorization === 'Bearer tok');
  verificar('apiFetch exitoso devuelve JSON', datos.elemento === 1);

  respuestaSimulada = { ok: false, status: 401, json: async () => ({ codigo: 'NO_AUTORIZADO', mensaje: 'Debes iniciar sesión.' }) };
  try {
    await api.obtener('/api/pacientes');
    verificar('401 lanza ApiError', false);
  } catch (error) {
    verificar('401 lanza ApiError', error instanceof Error && error.estado === 401 && error.codigo === 'NO_AUTORIZADO');
  }
  verificar('401 limpia la sesión', obtenerSesion() === null);
  verificar('401 redirige al login', window.location.href === 'index.html?expirada=1');

  // --- login con credenciales inválidas: no debe limpiar ni redirigir ---
  guardarSesion('tok', { rol: 'Médico' });
  window.location.href = '';
  respuestaSimulada = { ok: false, status: 401, json: async () => ({ codigo: 'NO_AUTORIZADO', mensaje: 'Credenciales inválidas.' }) };
  try {
    await api.login('malo', 'mala');
    verificar('login 401 lanza', false);
  } catch (error) {
    verificar('login 401 lanza con mensaje listo', error.message === 'Credenciales inválidas.');
  }
  verificar('login 401 NO borra la sesión ni redirige', obtenerSesion() !== null && window.location.href === '');

  // --- 503 y 409 conservan estado ---
  respuestaSimulada = { ok: false, status: 503, json: async () => ({ codigo: 'MOTOR_NO_DISPONIBLE', mensaje: 'Servicio de Clínica Odontológica temporalmente no disponible.' }) };
  try {
    await api.obtener('/api/citas');
  } catch (error) {
    verificar('503 conserva estado y mensaje', error.estado === 503 && error.message.includes('temporalmente no disponible'));
  }
  respuestaSimulada = { ok: false, status: 409, json: async () => ({ codigo: 'REGISTRO_DUPLICADO', mensaje: 'Esta solicitud ya se envió hace un momento.' }) };
  try {
    await api.crear('/api/citas', {});
  } catch (error) {
    verificar('409 conserva codigo', error.codigo === 'REGISTRO_DUPLICADO' && error.estado === 409);
  }
  respuestaSimulada = { ok: false, status: 500, json: async () => null };
  try {
    await api.obtener('/api/x');
  } catch (error) {
    verificar('500 sin cuerpo usa texto genérico', error.estado === 500 && error.message === 'Error 500');
  }

  console.log(fallos === 0 ? '\nPRUEBA COMPLETA: todo ok' : `\n${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})();
