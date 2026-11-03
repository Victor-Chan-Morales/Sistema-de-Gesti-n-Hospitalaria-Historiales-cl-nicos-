// Relación entre institución y motor (ver docs/decisiones/ADR-001-asignacion-motores.md).
// Los IDs se fijan aquí y en los seeders de cada motor. Cambiar de motor es una decisión
// de configuración: MOTOR_INSTITUCION_1=mysql, por ejemplo.

const MOTORES = ['postgres', 'mysql', 'mongo', 'firebase'];

const INSTITUCIONES = Object.freeze({
  1: { nombre: 'Hospital General', motor: 'postgres' },
  2: { nombre: 'Clínica Odontológica', motor: 'mysql' },
  3: { nombre: 'Laboratorio Clínico', motor: 'mongo' },
  4: { nombre: 'Centro Médico Pediátrico', motor: 'firebase' },
});

function motorDeInstitucion(idInstitucion) {
  const base = INSTITUCIONES[idInstitucion];
  if (!base) return undefined;
  const motor = process.env[`MOTOR_INSTITUCION_${idInstitucion}`] || base.motor;
  if (!MOTORES.includes(motor)) {
    throw new Error(`Motor desconocido para la institución ${idInstitucion}: ${motor}`);
  }
  return motor;
}

const nombreDeInstitucion = (idInstitucion) => INSTITUCIONES[idInstitucion]?.nombre;
const idsDeInstituciones = () => Object.keys(INSTITUCIONES).map(Number);

module.exports = { motorDeInstitucion, nombreDeInstitucion, idsDeInstituciones };
