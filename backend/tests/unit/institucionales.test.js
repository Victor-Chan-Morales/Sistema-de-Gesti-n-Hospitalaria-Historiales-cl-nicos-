// Funciones propias de cada institución: reglas de laboratorio y pediatría, sobre dobles en memoria,
// y el comportamiento de sus rutas cuando la institución no ofrece el servicio.

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const laboratorio = require('../../src/application/laboratorio');
const pediatria = require('../../src/application/pediatria');
const { ReglaNegocio, DatosInvalidos, NoEncontrado } = require('../../src/domain/errores');
const { hoy } = require('../../src/domain/fechas');
const { crearApp } = require('../../src/app');
const { crearServicioTokens } = require('../../src/adapters/seguridad/tokensJwt');
const { crearRepoMemoria } = require('./apoyo/repoMemoria');

const actor = { id_usuario: '9', id_institucion: 3, rol: 'Laboratorista' };
const ID_TIPO = '11';

// Doble mínimo del puerto de laboratorio: guarda lo que recibe.
function crearExamenes(ordenes = {}) {
  const llamadas = [];
  return {
    llamadas,
    listarTipos: async () => [],
    crearOrden: async (datos, quien, ventana) => {
      llamadas.push(['crearOrden', datos, ventana]);
      return { id_orden_laboratorio: '1', estado: 'Pendiente', examenes: [], resultados: [], ...datos };
    },
    obtenerOrden: async (id) => ordenes[id] ?? null,
    listarOrdenes: async (filtros) => {
      llamadas.push(['listarOrdenes', filtros]);
      return [];
    },
    cambiarEstadoOrden: async (id, estado) => ({ ...ordenes[id], estado }),
    registrarResultado: async (id, datos) => {
      llamadas.push(['registrarResultado', id, datos]);
      return { ...ordenes[id], resultados: [datos] };
    },
  };
}

function reposConPaciente(extra, paciente = { estado: 'Activo', fecha_nacimiento: '2018-05-01' }) {
  return { pacientes: { obtener: async () => paciente }, ...extra };
}

describe('laboratorio: casos de uso', () => {
  it('una institución sin laboratorio responde con una regla de negocio', async () => {
    await assert.rejects(laboratorio.listarTipos({ pacientes: {} }), ReglaNegocio);
  });

  it('crea la orden con prioridad Normal y al usuario del token como solicitante', async () => {
    const examenes = crearExamenes();
    const orden = await laboratorio.crearOrden(reposConPaciente({ examenes }), actor, {
      id_paciente: '5', examenes: [{ id_tipo_examen: ID_TIPO }],
    });
    assert.equal(orden.prioridad, 'Normal');
    assert.equal(orden.id_usuario_solicitante, actor.id_usuario);
    assert.deepEqual(orden.examenes, [ID_TIPO]);
    const [, , ventana] = examenes.llamadas[0];
    assert.ok(ventana.desde < ventana.hasta);
  });

  it('exige al menos un examen y no admite repetirlo', async () => {
    const repos = reposConPaciente({ examenes: crearExamenes() });
    await assert.rejects(laboratorio.crearOrden(repos, actor, { id_paciente: '5', examenes: [] }), ReglaNegocio);
    await assert.rejects(laboratorio.crearOrden(repos, actor, {
      id_paciente: '5', examenes: [{ id_tipo_examen: ID_TIPO }, { id_tipo_examen: ID_TIPO }],
    }), ReglaNegocio);
    await assert.rejects(laboratorio.crearOrden(repos, actor, { id_paciente: '5' }), DatosInvalidos);
    await assert.rejects(laboratorio.crearOrden(repos, actor, {
      id_paciente: '5', prioridad: 'Mañana', examenes: [{ id_tipo_examen: ID_TIPO }],
    }), DatosInvalidos);
  });

  it('no registra órdenes de un paciente archivado', async () => {
    const repos = reposConPaciente({ examenes: crearExamenes() }, { estado: 'Archivado' });
    await assert.rejects(laboratorio.crearOrden(repos, actor, {
      id_paciente: '5', examenes: [{ id_tipo_examen: ID_TIPO }],
    }), ReglaNegocio);
  });

  it('un resultado debe ser de un examen de la orden y la orden debe estar abierta', async () => {
    const ordenes = {
      1: { id_orden_laboratorio: '1', estado: 'Pendiente', examenes: [{ id_tipo_examen: ID_TIPO }] },
      2: { id_orden_laboratorio: '2', estado: 'Cancelada', examenes: [{ id_tipo_examen: ID_TIPO }] },
    };
    const examenes = crearExamenes(ordenes);
    const repos = { examenes };

    const guardada = await laboratorio.registrarResultado(repos, actor, '1', {
      id_tipo_examen: ID_TIPO, resultado_general: 'Normal',
      valores_detallados: [{ parametro: 'Hemoglobina', valor: '13.5', unidad: 'g/dL' }],
    });
    assert.equal(guardada.resultados[0].fecha_resultado, hoy());

    await assert.rejects(laboratorio.registrarResultado(repos, actor, '1', { id_tipo_examen: '99' }), ReglaNegocio);
    await assert.rejects(laboratorio.registrarResultado(repos, actor, '2', { id_tipo_examen: ID_TIPO }), ReglaNegocio);
    await assert.rejects(laboratorio.registrarResultado(repos, actor, '3', { id_tipo_examen: ID_TIPO }), NoEncontrado);
    await assert.rejects(laboratorio.registrarResultado(repos, actor, '1', {
      id_tipo_examen: ID_TIPO, fecha_toma_muestra: '2026-03-02', fecha_resultado: '2026-03-01',
    }), ReglaNegocio);
  });

  it('la orden solo avanza por las transiciones permitidas', async () => {
    const examenes = crearExamenes({
      1: { estado: 'Pendiente' }, 2: { estado: 'Entregada' },
    });
    const repos = { examenes };
    assert.equal((await laboratorio.cambiarEstadoOrden(repos, actor, '1', { estado: 'En proceso' })).estado, 'En proceso');
    await assert.rejects(laboratorio.cambiarEstadoOrden(repos, actor, '1', { estado: 'Entregada' }), ReglaNegocio);
    await assert.rejects(laboratorio.cambiarEstadoOrden(repos, actor, '2', { estado: 'Cancelada' }), ReglaNegocio);
    await assert.rejects(laboratorio.cambiarEstadoOrden(repos, actor, '1', { estado: 'Inventado' }), DatosInvalidos);
  });

  it('los filtros de la lista son texto o se ignoran', async () => {
    const examenes = crearExamenes();
    await laboratorio.listarOrdenes({ examenes }, { id_paciente: ' 5 ', estado: { $ne: null } });
    assert.deepEqual(examenes.llamadas[0][1], { id_paciente: '5', estado: undefined });
  });
});

function crearSeguimiento() {
  const llamadas = [];
  return {
    llamadas,
    listarVacunas: async () => [],
    agregarControl: async (id, datos) => {
      llamadas.push(['agregarControl', id, datos]);
      return datos;
    },
    listarControles: async () => [],
    registrarVacuna: async (id, datos) => {
      llamadas.push(['registrarVacuna', id, datos]);
      return datos;
    },
    listarRegistroVacunas: async () => [],
  };
}

const anioAtras = (n) => `${Number(hoy().slice(0, 4)) - n}${hoy().slice(4)}`;
const manana = () => {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
};

describe('pediatría: casos de uso', () => {
  const actorPediatra = { id_usuario: '9', id_institucion: 4, rol: 'Médico' };

  it('una institución sin seguimiento pediátrico responde con una regla de negocio', async () => {
    await assert.rejects(pediatria.listarVacunas({ pacientes: {} }), ReglaNegocio);
  });

  it('el control toma la fecha de hoy por omisión y pasa los datos al repositorio', async () => {
    const seguimiento = crearSeguimiento();
    const control = await pediatria.agregarControl(
      reposConPaciente({ seguimiento }, { estado: 'Activo', fecha_nacimiento: anioAtras(3) }),
      actorPediatra, '5', { peso: 14.2, talla: 95 },
    );
    assert.equal(control.fecha_control, hoy());
    assert.equal(control.peso, 14.2);
  });

  it('rechaza controles y vacunas de un adulto, de un paciente archivado y con fechas imposibles', async () => {
    const seguimiento = crearSeguimiento();
    const adulto = reposConPaciente({ seguimiento }, { estado: 'Activo', fecha_nacimiento: '1980-01-01' });
    await assert.rejects(pediatria.agregarControl(adulto, actorPediatra, '5', { peso: 70 }), ReglaNegocio);

    const archivado = reposConPaciente({ seguimiento }, { estado: 'Archivado', fecha_nacimiento: anioAtras(3) });
    await assert.rejects(pediatria.registrarVacuna(archivado, actorPediatra, '5', { id_vacuna: '1', numero_dosis: 'Primera' }), ReglaNegocio);

    const menor = reposConPaciente({ seguimiento }, { estado: 'Activo', fecha_nacimiento: anioAtras(3) });
    await assert.rejects(pediatria.agregarControl(menor, actorPediatra, '5', { fecha_control: manana() }), ReglaNegocio);
    await assert.rejects(pediatria.registrarVacuna(menor, actorPediatra, '5', {
      id_vacuna: '1', numero_dosis: 'Primera', fecha_aplicacion: '2026-03-10', proxima_dosis: '2026-03-01',
    }), ReglaNegocio);
    await assert.rejects(pediatria.registrarVacuna(menor, actorPediatra, '5', { id_vacuna: '1' }), DatosInvalidos);
    assert.equal(seguimiento.llamadas.length, 0);
  });

  it('registra la vacuna con la fecha de hoy por omisión', async () => {
    const seguimiento = crearSeguimiento();
    const menor = reposConPaciente({ seguimiento }, { estado: 'Activo', fecha_nacimiento: anioAtras(1) });
    const registro = await pediatria.registrarVacuna(menor, actorPediatra, '5', { id_vacuna: '1', numero_dosis: 'Primera' });
    assert.equal(registro.fecha_aplicacion, hoy());
  });
});

describe('rutas de laboratorio y pediatría', () => {
  const tokens = crearServicioTokens('x'.repeat(32));
  let servidor;
  let url;
  let token;

  beforeEach(async () => {
    const repos = crearRepoMemoria();
    const id = (await repos.usuarios.buscarPorNombre('medico.prueba')).id_usuario;
    token = tokens.emitir({ id_usuario: id, id_institucion: 1, rol: 'Médico' });
    const app = crearApp({
      obtenerRepositorio: () => repos,
      listarInstituciones: () => [],
      credenciales: { hashFicticio: 'x', comparar: async () => false },
      tokens,
    });
    await new Promise((listo) => {
      servidor = app.listen(0, '127.0.0.1', listo);
    });
    url = `http://127.0.0.1:${servidor.address().port}`;
  });

  afterEach(() => {
    servidor.closeAllConnections();
    servidor.close();
  });

  const pedir = async (metodo, ruta, cuerpo, conToken = true) => {
    const respuesta = await fetch(`${url}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(conToken ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return { estado: respuesta.status, datos: await respuesta.json().catch(() => null) };
  };

  it('exigen sesión', async () => {
    assert.equal((await pedir('GET', '/api/laboratorio/ordenes', undefined, false)).estado, 401);
    assert.equal((await pedir('GET', '/api/pediatria/vacunas', undefined, false)).estado, 401);
  });

  it('una institución que no ofrece el servicio responde 422, no un error interno', async () => {
    for (const [metodo, ruta, cuerpo] of [
      ['GET', '/api/laboratorio/tipos-examen'],
      ['GET', '/api/laboratorio/ordenes'],
      ['POST', '/api/laboratorio/ordenes', { id_paciente: '1', examenes: [{ id_tipo_examen: '1' }] }],
      ['GET', '/api/pediatria/vacunas'],
      ['GET', '/api/pediatria/pacientes/1/controles'],
    ]) {
      const { estado, datos } = await pedir(metodo, ruta, cuerpo);
      assert.equal(estado, 422, ruta);
      assert.equal(datos.codigo, 'REGLA_NEGOCIO');
    }
  });
});
