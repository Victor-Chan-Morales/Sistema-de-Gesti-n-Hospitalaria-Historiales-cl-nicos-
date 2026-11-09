// Esquemas de entrada de las funciones propias de cada institución: órdenes y resultados de
// laboratorio, y crecimiento y vacunas del centro pediátrico. Mismo formato que esquemas.js.

const { PRIORIDADES, ESTADOS_ORDEN } = require('./laboratorio');

const t = (max, requerido = false) => ({ tipo: 'texto', max, requerido });
const texto = { tipo: 'texto' };
const e = (...valores) => ({ tipo: 'enum', valores });
const lista = (esquema) => ({ tipo: 'lista', esquema });

// --- Laboratorio ---

const nuevaOrdenLaboratorio = {
  id_paciente: { tipo: 'id', requerido: true },
  id_usuario_solicitante: { tipo: 'id' },
  prioridad: e(...PRIORIDADES),
  observaciones: texto,
  examenes: { ...lista({ id_tipo_examen: { tipo: 'id', requerido: true } }), requerido: true },
};

const estadoOrden = {
  estado: { ...e(...ESTADOS_ORDEN), requerido: true },
};

// Cada tipo de examen trae sus propios parámetros: la lista es de longitud y contenido libres.
const valorDetallado = {
  parametro: t(100, true),
  valor: t(100, true),
  unidad: t(30),
  rango_referencia: t(100),
};

const nuevoResultado = {
  id_tipo_examen: { tipo: 'id', requerido: true },
  fecha_toma_muestra: { tipo: 'fecha' },
  fecha_resultado: { tipo: 'fecha' },
  resultado_general: texto,
  valores_detallados: lista(valorDetallado),
  observaciones: texto,
};

// --- Pediatría ---

const nuevoControlCrecimiento = {
  fecha_control: { tipo: 'fecha' },
  peso: { tipo: 'decimal', min: 0, max: 999.99 },
  talla: { tipo: 'decimal', min: 0, max: 250 },
  perimetro_cefalico: { tipo: 'decimal', min: 0, max: 99.99 },
  indice_masa_corporal: { tipo: 'decimal', min: 0, max: 99.99 },
  id_consulta: { tipo: 'id' },
  observaciones: texto,
};

const nuevoRegistroVacuna = {
  id_vacuna: { tipo: 'id', requerido: true },
  numero_dosis: t(30, true),
  fecha_aplicacion: { tipo: 'fecha' },
  lote: t(50),
  centro_aplicacion: t(100),
  proxima_dosis: { tipo: 'fecha' },
  observaciones: texto,
};

module.exports = {
  nuevaOrdenLaboratorio,
  estadoOrden,
  nuevoResultado,
  nuevoControlCrecimiento,
  nuevoRegistroVacuna,
};
