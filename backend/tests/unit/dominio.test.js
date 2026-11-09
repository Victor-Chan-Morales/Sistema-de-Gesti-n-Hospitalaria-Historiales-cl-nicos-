const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DatosInvalidos, ReglaNegocio } = require('../../src/domain/errores');
const { validar } = require('../../src/domain/validacion');
const esquemas = require('../../src/domain/esquemas');
const fechas = require('../../src/domain/fechas');
const reglas = require('../../src/domain/reglas');
const { ROLES, PERMISOS, tienePermiso } = require('../../src/domain/roles');

describe('fechas', () => {
  it('rechaza fechas imposibles', () => {
    assert.equal(fechas.esFecha('2026-02-28'), true);
    assert.equal(fechas.esFecha('2026-02-31'), false);
    assert.equal(fechas.esFecha('28/02/2026'), false);
    assert.equal(fechas.esFecha(undefined), false);
  });

  it('normaliza fecha y hora', () => {
    assert.equal(fechas.normalizarFechaHora('2026-01-02T03:04'), '2026-01-02T03:04:00');
    assert.equal(fechas.normalizarFechaHora('2026-01-02T25:00:00'), null);
    assert.equal(fechas.normalizarFechaHora('2026-01-02 03:04:05'), null);
  });

  it('desplaza segundos cruzando de día', () => {
    assert.equal(fechas.desplazarSegundos('2026-01-01T00:00:10', -30), '2025-12-31T23:59:40');
  });

  it('calcula la edad según si ya cumplió años', () => {
    assert.equal(fechas.edadEnAnios('2008-06-15', '2026-06-14'), 17);
    assert.equal(fechas.edadEnAnios('2008-06-15', '2026-06-15'), 18);
  });
});

describe('validación', () => {
  const base = { nombres: 'Ana', apellidos: 'Pérez', fecha_nacimiento: '1990-01-01' };

  it('descarta campos desconocidos y recorta texto', () => {
    const limpio = validar({ ...base, nombres: '  Ana ', estado: 'Archivado', id_paciente: '9' }, esquemas.paciente);
    assert.equal(limpio.nombres, 'Ana');
    assert.equal(limpio.estado, undefined);
    assert.equal(limpio.id_paciente, undefined);
  });

  it('reúne todos los errores en un mensaje', () => {
    assert.throws(() => validar({ sexo: 'X' }, esquemas.paciente), (error) => {
      assert.ok(error instanceof DatosInvalidos);
      assert.match(error.message, /nombres: es obligatorio/);
      assert.match(error.message, /fecha_nacimiento: es obligatorio/);
      assert.match(error.message, /sexo: debe ser uno de/);
      return true;
    });
  });

  it('respeta el largo máximo y los rangos del esquema SQL', () => {
    assert.throws(() => validar({ ...base, nombres: 'x'.repeat(101) }, esquemas.paciente), DatosInvalidos);
    assert.throws(() => validar({
      id_paciente: '1', signos_vitales: { saturacion_oxigeno: 101 },
    }, esquemas.nuevaConsulta), DatosInvalidos);
  });

  it('la talla de la consulta va en centímetros: un adulto de 170 cm es válido', () => {
    const limpio = validar({ id_paciente: '1', signos_vitales: { talla: 170 } }, esquemas.nuevaConsulta);
    assert.equal(limpio.signos_vitales.talla, 170);
    assert.throws(() => validar({
      id_paciente: '1', signos_vitales: { talla: 251 },
    }, esquemas.nuevaConsulta), DatosInvalidos);
  });

  it('valida elementos anidados y señala su ruta', () => {
    assert.throws(
      () => validar({ ...base, telefonos: [{ numero: '1', tipo: 'Fax' }] }, esquemas.paciente),
      /telefonos\[0\]\.tipo/,
    );
  });

  it('modo parcial: permite omitir requeridos, pero no anularlos', () => {
    assert.deepEqual(validar({ direccion: 'Zona 1' }, esquemas.paciente, { parcial: true }), { direccion: 'Zona 1' });
    assert.throws(() => validar({ nombres: null }, esquemas.paciente, { parcial: true }), DatosInvalidos);
  });

  it('un opcional en null se conserva para poder borrar el valor', () => {
    assert.deepEqual(validar({ direccion: null }, esquemas.paciente, { parcial: true }), { direccion: null });
  });

  it('rechaza cuerpos que no son objeto', () => {
    assert.throws(() => validar([], esquemas.login), DatosInvalidos);
    assert.throws(() => validar(undefined, esquemas.login), DatosInvalidos);
  });

  it('convierte los IDs a string', () => {
    const { id_paciente: id } = validar({ id_paciente: 5 }, esquemas.nuevaConsulta);
    assert.equal(id, '5');
  });
});

describe('reglas de negocio', () => {
  it('regla 12: un menor necesita representante', () => {
    assert.throws(() => reglas.exigirRepresentanteSiEsMenor('2020-01-01', [], '2026-01-01'), ReglaNegocio);
    assert.doesNotThrow(() => reglas.exigirRepresentanteSiEsMenor('2020-01-01', [{}], '2026-01-01'));
    assert.doesNotThrow(() => reglas.exigirRepresentanteSiEsMenor('1990-01-01', [], '2026-01-01'));
  });

  it('un paciente archivado o inactivo no recibe citas', () => {
    assert.doesNotThrow(() => reglas.exigirPacienteActivoParaCita({ estado: 'Activo' }));
    assert.throws(() => reglas.exigirPacienteActivoParaCita({ estado: 'Archivado' }), ReglaNegocio);
    assert.throws(() => reglas.exigirPacienteActivoParaCita({ estado: 'Inactivo' }), ReglaNegocio);
  });

  it('solo se asignan citas a profesionales activos', () => {
    assert.doesNotThrow(() => reglas.exigirProfesionalActivo({ rol: 'Médico', estado: 'Activo' }));
    assert.throws(() => reglas.exigirProfesionalActivo({ rol: 'Secretaria', estado: 'Activo' }), ReglaNegocio);
    assert.throws(() => reglas.exigirProfesionalActivo({ rol: 'Médico', estado: 'Inactivo' }), ReglaNegocio);
    assert.throws(() => reglas.exigirProfesionalActivo(null), ReglaNegocio);
  });

  it('transiciones de estado de la consulta', () => {
    assert.doesNotThrow(() => reglas.exigirTransicionConsulta('Abierta', 'Finalizada'));
    assert.doesNotThrow(() => reglas.exigirTransicionConsulta('Finalizada', 'Anulada'));
    assert.throws(() => reglas.exigirTransicionConsulta('Anulada', 'Abierta'), ReglaNegocio);
    assert.throws(() => reglas.exigirTransicionConsulta('Finalizada', 'Abierta'), ReglaNegocio);
  });

  it('regla 10: detecta alergias por nombre o principio activo, sin distinguir acentos', () => {
    const medicamentos = [{ nombre: 'Amoxicilina', principio_activo: 'Penicilina' }, { nombre: 'Lidocaína', principio_activo: 'lidocaina' }];
    const alergias = [{ sustancia: 'PENICILINA', nivel_gravedad: 'Grave' }, { sustancia: 'Lidocaina' }, { sustancia: 'Látex' }];
    const advertencias = reglas.detectarAlergiasRelacionadas(medicamentos, alergias);
    assert.equal(advertencias.length, 2);
    assert.match(advertencias[0], /PENICILINA \(Grave\).*Amoxicilina/);
  });

  it('regla 10: sin coincidencias no hay advertencias', () => {
    assert.deepEqual(reglas.detectarAlergiasRelacionadas([{ nombre: 'Ibuprofeno' }], [{ sustancia: 'Maní' }]), []);
  });
});

describe('matriz de permisos', () => {
  const { GESTIONAR_PACIENTES_Y_CITAS: G, ARCHIVAR_PACIENTES: A, VER_HISTORIAL_CLINICO: V, REGISTRAR_DATOS_CLINICOS: R } = PERMISOS;
  const casos = [
    [ROLES.ADMINISTRADOR, [G, A]],
    [ROLES.SECRETARIA, [G]],
    [ROLES.MEDICO, [G, A, V, R]],
    [ROLES.ODONTOLOGO, [G, A, V, R]],
    [ROLES.LABORATORISTA, [G, A, V, R]],
  ];

  for (const [rol, permitidos] of casos) {
    it(`${rol}`, () => {
      for (const permiso of [G, A, V, R]) {
        assert.equal(tienePermiso(rol, permiso), permitidos.includes(permiso), permiso);
      }
    });
  }

  it('un rol desconocido no tiene permisos', () => {
    assert.equal(tienePermiso('Intruso', G), false);
    assert.equal(tienePermiso(undefined, G), false);
  });
});
