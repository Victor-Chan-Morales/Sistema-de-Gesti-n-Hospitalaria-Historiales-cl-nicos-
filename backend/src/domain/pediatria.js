// Reglas del Centro Médico Pediátrico (regla 19 de la Entrega I).

const { ReglaNegocio } = require('./errores');
const { edadEnAnios } = require('./fechas');

const LIMITE_EDAD_PEDIATRICA = 18;

// El seguimiento de crecimiento y vacunación es para menores de edad.
function exigirPacientePediatrico(paciente, referencia) {
  if (edadEnAnios(paciente.fecha_nacimiento, referencia) >= LIMITE_EDAD_PEDIATRICA) {
    throw new ReglaNegocio('El seguimiento pediátrico es solo para menores de 18 años.');
  }
}

function exigirFechaNoFutura(fecha, referencia, campo) {
  if (fecha > referencia) throw new ReglaNegocio(`${campo} no puede estar en el futuro.`);
}

const MEDIDAS_DE_CONTROL = Object.freeze(['peso', 'talla', 'perimetro_cefalico', 'indice_masa_corporal']);

// Un control sin ninguna medida no aporta nada al seguimiento del crecimiento.
function exigirAlgunaMedida(control) {
  if (!MEDIDAS_DE_CONTROL.some((medida) => control[medida] != null)) {
    throw new ReglaNegocio('Un control debe registrar al menos una medida: peso, talla, perímetro cefálico o IMC.');
  }
}

function exigirProximaDosisPosterior(fechaAplicacion, proximaDosis) {
  if (proximaDosis && proximaDosis < fechaAplicacion) {
    throw new ReglaNegocio('La próxima dosis no puede ser anterior a la fecha de aplicación.');
  }
}

module.exports = {
  LIMITE_EDAD_PEDIATRICA,
  exigirPacientePediatrico,
  exigirFechaNoFutura,
  exigirAlgunaMedida,
  exigirProximaDosisPosterior,
};
