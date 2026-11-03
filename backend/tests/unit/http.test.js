// Prueba la aplicación completa (rutas, RBAC, casos de uso y DTOs) sobre el repositorio en memoria.

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { crearApp } = require('../../src/app');
const { crearServicioTokens } = require('../../src/adapters/seguridad/tokensJwt');
const { MotorNoDisponible } = require('../../src/domain/errores');
const { crearRepoMemoria } = require('./apoyo/repoMemoria');

const SECRETO = 'x'.repeat(32);
const tokens = crearServicioTokens(SECRETO);

describe('API HTTP', () => {
  let servidor;
  let url;
  let repos;
  let reposPorInstitucion;
  let ids;

  const credenciales = {
    hashFicticio: 'ficticio',
    comparar: async (contrasena) => contrasena === 'correcta',
  };

  async function peticion(metodo, ruta, { rol, cuerpo, token, institucion = 1 } = {}) {
    const autorizacion = token ?? (rol
      ? tokens.emitir({ id_usuario: ids[rol], id_institucion: institucion, rol })
      : undefined);
    const respuesta = await fetch(`${url}${ruta}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(autorizacion ? { Authorization: `Bearer ${autorizacion}` } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return { estado: respuesta.status, datos: await respuesta.json().catch(() => null) };
  }

  let contador = 0;
  const adulto = (extra = {}) => ({
    nombres: 'Ana',
    apellidos: `Pérez ${++contador}`,
    dpi_o_documento: `DOC-${contador}`,
    fecha_nacimiento: '1990-01-01',
    ...extra,
  });

  const crearPaciente = async (extra) => (
    await peticion('POST', '/api/pacientes', { rol: 'Secretaria', cuerpo: adulto(extra) })
  ).datos;

  // Una app por prueba: el filtro de envío doble guarda estado en memoria.
  beforeEach(async () => {
    repos = crearRepoMemoria();
    reposPorInstitucion = { 1: repos };
    const buscar = async (nombre) => (await repos.usuarios.buscarPorNombre(nombre)).id_usuario;
    ids = {
      Administrador: await buscar('admin.prueba'),
      Secretaria: await buscar('secretaria.prueba'),
      Médico: await buscar('medico.prueba'),
    };

    const obtenerRepositorio = (id) => {
      if (id === 2) throw new MotorNoDisponible('Clínica Odontológica');
      return reposPorInstitucion[id];
    };
    const listarInstituciones = () => [{
      id_institucion: 1, nombre: 'Hospital General', motor: 'postgres', implementado: true, repos: reposPorInstitucion[1],
    }, {
      id_institucion: 3, nombre: 'Laboratorio', motor: 'mongo', implementado: false, repos: {},
    }];
    const app = crearApp({ obtenerRepositorio, listarInstituciones, credenciales, tokens });
    await new Promise((listo) => {
      servidor = app.listen(0, '127.0.0.1', listo);
    });
    url = `http://127.0.0.1:${servidor.address().port}`;
  });

  afterEach(() => {
    servidor.closeAllConnections();
    servidor.close();
  });

  describe('autenticación', () => {
    it('login devuelve token y usuario, sin exponer el hash', async () => {
      const { estado, datos } = await peticion('POST', '/api/auth/login', {
        cuerpo: { usuario: 'medico.prueba', contrasena: 'correcta' },
      });
      assert.equal(estado, 200);
      assert.equal(datos.usuario.rol, 'Médico');
      assert.equal(datos.usuario.contrasena_hash, undefined);
      assert.equal(JSON.stringify(datos).includes('hash'), false);
      assert.equal(tokens.verificar(datos.token).id_institucion, 1);

      const perfil = await peticion('GET', '/api/auth/yo', { token: datos.token });
      assert.equal(perfil.estado, 200);
      assert.equal(perfil.datos.usuario, 'medico.prueba');
    });

    it('credenciales inválidas: 401', async () => {
      const { estado, datos } = await peticion('POST', '/api/auth/login', {
        cuerpo: { usuario: 'medico.prueba', contrasena: 'mala' },
      });
      assert.equal(estado, 401);
      assert.equal(datos.codigo, 'NO_AUTORIZADO');
    });

    it('un motor pendiente de implementar no convierte un login fallido en 503', async () => {
      const { estado } = await peticion('POST', '/api/auth/login', {
        cuerpo: { usuario: 'no.existe', contrasena: 'x' },
      });
      assert.equal(estado, 401);
    });

    it('sin token o con token inválido: 401', async () => {
      assert.equal((await peticion('GET', '/api/pacientes')).estado, 401);
      assert.equal((await peticion('GET', '/api/pacientes', { token: 'invalido' })).estado, 401);
      const otroSecreto = crearServicioTokens('y'.repeat(32)).emitir({ id_usuario: '1', id_institucion: 1, rol: 'Médico' });
      assert.equal((await peticion('GET', '/api/pacientes', { token: otroSecreto })).estado, 401);
    });
  });

  describe('RBAC', () => {
    it('secretaria: gestiona pacientes y citas, pero no accede a datos clínicos', async () => {
      const paciente = await crearPaciente();
      const opciones = { rol: 'Secretaria', cuerpo: {} };
      assert.equal((await peticion('POST', '/api/consultas', opciones)).estado, 403);
      assert.equal((await peticion('POST', '/api/consultas/1/diagnosticos', opciones)).estado, 403);
      assert.equal((await peticion('POST', '/api/consultas/1/tratamientos', opciones)).estado, 403);
      assert.equal((await peticion('POST', '/api/consultas/1/recetas', opciones)).estado, 403);
      assert.equal((await peticion('GET', '/api/consultas/1', { rol: 'Secretaria' })).estado, 403);
      assert.equal((await peticion('GET', `/api/pacientes/${paciente.id_paciente}/historial`, { rol: 'Secretaria' })).estado, 403);
      assert.equal((await peticion('POST', `/api/pacientes/${paciente.id_paciente}/archivar`, opciones)).estado, 403);
    });

    it('administrador: archiva, pero no ve ni registra datos clínicos', async () => {
      const paciente = await crearPaciente();
      assert.equal((await peticion('GET', `/api/pacientes/${paciente.id_paciente}/historial`, { rol: 'Administrador' })).estado, 403);
      assert.equal((await peticion('POST', '/api/consultas', { rol: 'Administrador', cuerpo: {} })).estado, 403);
      const archivo = await peticion('POST', `/api/pacientes/${paciente.id_paciente}/archivar`, {
        rol: 'Administrador', cuerpo: { estado: 'Archivado', motivo: 'Traslado' },
      });
      assert.equal(archivo.estado, 200);
    });

    it('la institución del token decide el motor: uno caído responde 503 con mensaje', async () => {
      const { estado, datos } = await peticion('GET', '/api/pacientes', { rol: 'Médico', institucion: 2 });
      assert.equal(estado, 503);
      assert.equal(datos.codigo, 'MOTOR_NO_DISPONIBLE');
      assert.match(datos.mensaje, /Clínica Odontológica temporalmente no disponible/);
    });
  });

  describe('pacientes', () => {
    it('crea con historial y el contrato completo de campos', async () => {
      const { estado, datos } = await peticion('POST', '/api/pacientes', { rol: 'Secretaria', cuerpo: adulto() });
      assert.equal(estado, 201);
      assert.equal(datos.estado, 'Activo');
      assert.match(datos.codigo_historial, /^HC-1-/);
      assert.ok(datos.id_historial);
      assert.deepEqual(datos.telefonos, []);
      assert.equal(datos.direccion, null);
    });

    it('datos inválidos: 400 y regla de negocio: 422', async () => {
      const invalido = await peticion('POST', '/api/pacientes', { rol: 'Secretaria', cuerpo: { nombres: 'Sin datos' } });
      assert.equal(invalido.estado, 400);
      assert.equal(invalido.datos.codigo, 'DATOS_INVALIDOS');

      const menor = await peticion('POST', '/api/pacientes', {
        rol: 'Secretaria',
        cuerpo: adulto({ fecha_nacimiento: `${new Date().getFullYear() - 5}-01-01` }),
      });
      assert.equal(menor.estado, 422);
      assert.equal(menor.datos.codigo, 'REGLA_NEGOCIO');
    });

    it('JSON mal formado: 400 sin filtrar detalles internos', async () => {
      const respuesta = await fetch(`${url}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{malo',
      });
      assert.equal(respuesta.status, 400);
      assert.equal((await respuesta.json()).codigo, 'DATOS_INVALIDOS');
    });

    it('documento repetido: 409', async () => {
      const cuerpo = adulto();
      await peticion('POST', '/api/pacientes', { rol: 'Secretaria', cuerpo });
      const repetido = await peticion('POST', '/api/pacientes', { rol: 'Administrador', cuerpo });
      assert.equal(repetido.estado, 409);
    });

    it('no permite cambiar el estado por PATCH: solo archivando', async () => {
      const paciente = await crearPaciente();
      const { datos } = await peticion('PATCH', `/api/pacientes/${paciente.id_paciente}`, {
        rol: 'Secretaria', cuerpo: { estado: 'Inactivo', direccion: 'Zona 1' },
      });
      assert.equal(datos.estado, 'Activo');
      assert.equal(datos.direccion, 'Zona 1');
    });

    it('lista con paginación y valida los parámetros', async () => {
      await crearPaciente();
      await crearPaciente();
      const { datos } = await peticion('GET', '/api/pacientes?limite=1', { rol: 'Secretaria' });
      assert.equal(datos.total, 2);
      assert.equal(datos.elementos.length, 1);
      assert.equal((await peticion('GET', '/api/pacientes?limite=1000', { rol: 'Secretaria' })).estado, 400);
      assert.equal((await peticion('GET', '/api/pacientes?texto=a&texto=b', { rol: 'Secretaria' })).estado, 400);
    });

    it('paciente inexistente: 404', async () => {
      assert.equal((await peticion('GET', '/api/pacientes/999', { rol: 'Secretaria' })).estado, 404);
    });

    it('archivar exige motivo y no se repite', async () => {
      const { id_paciente: id } = await crearPaciente();
      assert.equal((await peticion('POST', `/api/pacientes/${id}/archivar`, { rol: 'Médico', cuerpo: { estado: 'Archivado' } })).estado, 400);
      const cuerpo = { estado: 'Archivado', motivo: 'Fallecimiento' };
      assert.equal((await peticion('POST', `/api/pacientes/${id}/archivar`, { rol: 'Médico', cuerpo })).estado, 200);
      const repetido = await peticion('POST', `/api/pacientes/${id}/archivar`, { rol: 'Administrador', cuerpo });
      assert.equal(repetido.estado, 422);
    });
  });

  describe('citas', () => {
    const FUTURO = '2999-01-01T10:00:00';
    const crearCita = (paciente, extra = {}) => peticion('POST', '/api/citas', {
      rol: 'Secretaria',
      cuerpo: { id_paciente: paciente.id_paciente, id_usuario_profesional: ids.Médico, fecha_hora: FUTURO, ...extra },
    });

    it('crea y cancela una cita; una cita final ya no se modifica', async () => {
      const paciente = await crearPaciente();
      const { estado, datos } = await crearCita(paciente);
      assert.equal(estado, 201);
      assert.equal(datos.estado, 'Programada');

      const cancelar = () => peticion('PATCH', `/api/citas/${datos.id_cita}`, { rol: 'Secretaria', cuerpo: { estado: 'Cancelada' } });
      assert.equal((await cancelar()).estado, 200);
      assert.equal((await cancelar()).estado, 422);
    });

    it('bloquea citas a pacientes archivados o inactivos', async () => {
      for (const estadoBaja of ['Archivado', 'Inactivo']) {
        const paciente = await crearPaciente();
        await peticion('POST', `/api/pacientes/${paciente.id_paciente}/archivar`, {
          rol: 'Administrador', cuerpo: { estado: estadoBaja, motivo: 'Baja' },
        });
        const { estado, datos } = await crearCita(paciente);
        assert.equal(estado, 422);
        assert.match(datos.mensaje, new RegExp(estadoBaja));
      }
    });

    it('rechaza fechas pasadas y profesionales que no lo son', async () => {
      const paciente = await crearPaciente();
      assert.equal((await crearCita(paciente, { fecha_hora: '2000-01-01T10:00:00' })).estado, 422);
      assert.equal((await crearCita(paciente, { id_usuario_profesional: ids.Secretaria })).estado, 422);
    });
  });

  describe('consultas', () => {
    const atencion = (idPaciente, extra = {}) => ({
      id_paciente: idPaciente,
      motivo_consulta: 'Dolor',
      sintomas: 'Fiebre',
      ...extra,
    });

    it('registra la atención completa; el autor sale del token y no del cuerpo', async () => {
      const { id_paciente: id } = await crearPaciente();
      const [diagnostico] = await repos.catalogos.diagnosticos();
      const [medicamento] = await repos.catalogos.medicamentos();
      const { estado, datos } = await peticion('POST', '/api/consultas', {
        rol: 'Médico',
        cuerpo: atencion(id, {
          id_usuario_profesional: ids.Administrador,
          signos_vitales: { temperatura: 37.5 },
          diagnosticos: [{ id_catalogo_diag: diagnostico.id_catalogo_diag }],
          tratamientos: [{ descripcion: 'Reposo' }],
          receta: { detalles: [{ id_medicamento: medicamento.id_medicamento, dosis: '1', frecuencia: '8h' }] },
        }),
      });
      assert.equal(estado, 201);
      assert.equal(datos.consulta.id_usuario_profesional, ids.Médico);
      assert.equal(datos.consulta.estado, 'Abierta');
      assert.equal(datos.consulta.diagnosticos.length, 1);
      assert.equal(datos.consulta.tratamientos[0].estado, 'Activo');
      assert.equal(datos.consulta.recetas[0].detalles.length, 1);
      assert.deepEqual(datos.advertencias, []);
    });

    it('la auditoría registra al usuario del token', async () => {
      const { id_paciente: id } = await crearPaciente();
      await peticion('POST', '/api/consultas', { rol: 'Médico', cuerpo: atencion(id) });
      assert.ok(repos.bd.auditoria.some((a) => a.entidad === 'Consulta' && a.id_usuario === ids.Médico));
    });

    it('regla 10: advierte al recetar un medicamento relacionado con una alergia', async () => {
      const { id_paciente: id } = await crearPaciente();
      const penicilina = (await repos.catalogos.alergias()).find((a) => a.sustancia === 'Penicilina');
      const amoxicilina = (await repos.catalogos.medicamentos()).find((m) => m.nombre === 'Amoxicilina');
      const alergia = await peticion('POST', `/api/pacientes/${id}/alergias`, {
        rol: 'Médico', cuerpo: { id_catalogo_alergia: penicilina.id_catalogo_alergia, nivel_gravedad: 'Grave' },
      });
      assert.equal(alergia.estado, 201);

      const { estado, datos } = await peticion('POST', '/api/consultas', {
        rol: 'Médico',
        cuerpo: atencion(id, { receta: { detalles: [{ id_medicamento: amoxicilina.id_medicamento, dosis: '1', frecuencia: '8h' }] } }),
      });
      assert.equal(estado, 201);
      assert.equal(datos.advertencias.length, 1);
      assert.match(datos.advertencias[0], /Penicilina/);
    });

    it('no registra consultas de un paciente archivado ni agrega datos a una consulta anulada', async () => {
      const { id_paciente: id } = await crearPaciente();
      const { datos } = await peticion('POST', '/api/consultas', { rol: 'Médico', cuerpo: atencion(id) });
      const idConsulta = datos.consulta.id_consulta;

      assert.equal((await peticion('PATCH', `/api/consultas/${idConsulta}/estado`, { rol: 'Médico', cuerpo: { estado: 'Anulada' } })).estado, 200);
      assert.equal((await peticion('POST', `/api/consultas/${idConsulta}/tratamientos`, { rol: 'Médico', cuerpo: { descripcion: 'X' } })).estado, 422);

      await peticion('POST', `/api/pacientes/${id}/archivar`, { rol: 'Médico', cuerpo: { estado: 'Archivado', motivo: 'Baja' } });
      const nueva = await peticion('POST', '/api/consultas', { rol: 'Médico', cuerpo: atencion(id, { motivo_consulta: 'Otra' }) });
      assert.equal(nueva.estado, 422);
    });

    it('doble clic: dos POST simultáneos dejan un solo registro y uno recibe 409', async () => {
      const { id_paciente: id } = await crearPaciente();
      const opciones = { rol: 'Médico', cuerpo: atencion(id) };
      const resultados = await Promise.all([
        peticion('POST', '/api/consultas', opciones),
        peticion('POST', '/api/consultas', opciones),
      ]);
      assert.deepEqual(resultados.map((r) => r.estado).sort(), [201, 409]);
      assert.equal((await repos.historiales.obtenerCompleto(id)).consultas.length, 1);
    });

    it('un envío fallido se puede reintentar de inmediato', async () => {
      const opciones = { rol: 'Médico', cuerpo: atencion('999') };
      assert.equal((await peticion('POST', '/api/consultas', opciones)).estado, 404);
      assert.equal((await peticion('POST', '/api/consultas', opciones)).estado, 404);
    });

    it('el historial completo reúne alergias, antecedentes y consultas', async () => {
      const { id_paciente: id } = await crearPaciente();
      await peticion('POST', `/api/pacientes/${id}/antecedentes`, {
        rol: 'Médico', cuerpo: { tipo_antecedente: 'Familiar', descripcion: 'Diabetes' },
      });
      await peticion('POST', '/api/consultas', { rol: 'Médico', cuerpo: atencion(id) });
      const { estado, datos } = await peticion('GET', `/api/pacientes/${id}/historial`, { rol: 'Médico' });
      assert.equal(estado, 200);
      assert.equal(datos.historial.estado, 'Activo');
      assert.equal(datos.antecedentes.length, 1);
      assert.equal(datos.consultas.length, 1);
    });
  });

  describe('catálogos y salud', () => {
    it('los catálogos requieren sesión y están disponibles para cualquier rol', async () => {
      assert.equal((await peticion('GET', '/api/catalogos/medicamentos')).estado, 401);
      const { estado, datos } = await peticion('GET', '/api/catalogos/profesionales', { rol: 'Secretaria' });
      assert.equal(estado, 200);
      assert.deepEqual(datos.map((p) => p.rol), ['Médico']);
      assert.equal(datos[0].contrasena_hash, undefined);
    });

    it('informa el estado de cada motor', async () => {
      const { datos } = await peticion('GET', '/health/motores');
      assert.deepEqual(datos.motores.map((m) => m.estado), ['disponible', 'no_implementado']);
    });

    it('una ruta inexistente responde 404 en formato JSON', async () => {
      const { estado, datos } = await peticion('GET', '/api/no-existe');
      assert.equal(estado, 404);
      assert.equal(datos.codigo, 'NO_ENCONTRADO');
    });
  });
});
