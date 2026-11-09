// Suite de contrato del puerto: la misma para todos los motores. Es la prueba de que un
// adaptador se comporta igual que los demás.
//
// Para usarla en un motor nuevo (ver tests/integracion/postgres.test.js):
//   ejecutarSuiteContrato('MongoDB', {
//     crearRepos: () => crearAdaptador(),     // adaptador con los datos del seeder
//     idInstitucion: 3,
//     usuarioAdministrador: 'admin.laboratorio',
//     usuarioProfesional: 'laboratorista.laboratorio',
//   });

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const errores = require('../../src/domain/errores');
const { verificarPuerto } = require('../../src/ports/repositorioClinico');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function ejecutarSuiteContrato(nombre, { crearRepos, idInstitucion, usuarioAdministrador, usuarioProfesional }) {
  describe(`Contrato del puerto: ${nombre}`, () => {
    let repos;
    let actor;
    let profesional;
    let diagnosticos;
    let medicamentos;
    let alergias;
    const horaBase = '3000-06-15T10:00:00';

    const unico = () => randomUUID().slice(0, 12);

    const nuevoPaciente = (extra = {}) => ({
      nombres: 'Contrato',
      apellidos: `Prueba ${unico()}`,
      dpi_o_documento: `CT-${unico()}`,
      fecha_nacimiento: '1990-05-20',
      sexo: 'F',
      tipo_sangre: 'A+',
      telefonos: [{ numero: '5555-1111', tipo: 'Celular' }],
      correos: [{ correo: 'contrato@example.com' }],
      contactos_emergencia: [{
        nombres: 'Luis', apellidos: 'Contacto', parentesco: 'Hermano', telefonos: [{ numero: '5555-2222', tipo: 'Casa' }],
      }],
      representantes: [{
        nombres: 'Rosa',
        apellidos: 'Encargada',
        parentesco: 'Madre',
        telefonos: [{ numero: '5555-3333', tipo: 'Celular' }],
        correos: [{ correo: 'rosa@example.com' }],
      }],
      id_institucion: idInstitucion,
      codigo_historial: `HC-${unico()}`,
      fecha_registro: '2026-01-15',
      ...extra,
    });

    const nuevaAtencion = (idPaciente, extra = {}) => ({
      id_paciente: idPaciente,
      id_usuario_profesional: actor.id_usuario,
      fecha_hora: horaBase,
      motivo_consulta: `Motivo ${unico()}`,
      sintomas: 'Fiebre',
      examen_fisico: 'Normal',
      notas_clinicas: 'Sin novedades',
      estado: 'Abierta',
      diagnosticos: [],
      tratamientos: [],
      ...extra,
    });

    const ventana = () => ({ desde: '2999-01-01T00:00:00', hasta: '3001-01-01T00:00:00' });

    before(async () => {
      repos = verificarPuerto(await crearRepos(), `adaptador ${nombre}`);
      const admin = await repos.usuarios.buscarPorNombre(usuarioAdministrador);
      profesional = await repos.usuarios.buscarPorNombre(usuarioProfesional);
      assert.ok(admin && profesional, 'Faltan los usuarios del seeder: ejecuta npm run seed');
      actor = { id_usuario: profesional.id_usuario, id_institucion: idInstitucion, rol: profesional.rol };
      diagnosticos = await repos.catalogos.diagnosticos();
      medicamentos = await repos.catalogos.medicamentos();
      alergias = await repos.catalogos.alergias();
    });

    after(async () => {
      await repos?.cerrar?.();
    });

    it('usuarios: expone el hash solo al buscar por nombre, con ID string', async () => {
      assert.equal(typeof profesional.id_usuario, 'string');
      assert.ok(profesional.contrasena_hash);
      const perfil = await repos.usuarios.obtener(profesional.id_usuario);
      assert.equal(perfil.usuario, usuarioProfesional);
      assert.equal(perfil.contrasena_hash, undefined);
      assert.equal(await repos.usuarios.buscarPorNombre(`no-existe-${unico()}`), null);
      assert.equal(await repos.usuarios.obtener('id-invalido'), null);
    });

    it('usuarios: registra el acceso y lista profesionales', async () => {
      await repos.usuarios.registrarAcceso(profesional.id_usuario, '2026-02-03T04:05:06');
      const lista = await repos.usuarios.listarProfesionales();
      assert.ok(lista.some((u) => u.id_usuario === profesional.id_usuario));
    });

    it('pacientes: crea paciente, colecciones e historial con los tipos del contrato', async () => {
      const paciente = await repos.pacientes.crear(nuevoPaciente(), actor);
      assert.equal(typeof paciente.id_paciente, 'string');
      assert.equal(typeof paciente.id_historial, 'string');
      assert.equal(paciente.estado, 'Activo');
      assert.equal(paciente.motivo_baja, null);
      assert.equal(paciente.fecha_nacimiento, '1990-05-20');
      assert.equal(paciente.fecha_registro, '2026-01-15');
      assert.equal(paciente.telefonos.length, 1);
      assert.equal(paciente.telefonos[0].numero, '5555-1111');
      assert.equal(paciente.correos[0].correo, 'contrato@example.com');
      assert.equal(paciente.contactos_emergencia[0].telefonos[0].tipo, 'Casa');
      assert.equal(paciente.representantes[0].correos[0].correo, 'rosa@example.com');
    });

    it('pacientes: un ID inválido o inexistente equivale a "no existe"', async () => {
      assert.equal(await repos.pacientes.obtener('abc'), null);
      assert.equal(await repos.pacientes.obtener('999999999'), null);
      await assert.rejects(repos.pacientes.actualizar('abc', { nombres: 'X' }, actor), errores.NoEncontrado);
      await assert.rejects(repos.pacientes.actualizar('999999999', { nombres: 'X' }, actor), errores.NoEncontrado);
      await assert.rejects(repos.pacientes.archivar('999999999', { estado: 'Archivado', motivo: 'x', fecha: '2026-01-01' }, actor), errores.NoEncontrado);
    });

    it('pacientes: un documento repetido produce RegistroDuplicado y no deja restos', async () => {
      const datos = nuevoPaciente();
      await repos.pacientes.crear(datos, actor);
      await assert.rejects(
        repos.pacientes.crear({ ...datos, codigo_historial: `HC-${unico()}` }, actor),
        errores.RegistroDuplicado,
      );
      const { total } = await repos.pacientes.buscar({ texto: datos.dpi_o_documento, limite: 10, desplazamiento: 0 });
      assert.equal(total, 1);
    });

    it('pacientes: busca con paginación y sin tratar % como comodín', async () => {
      const marca = `Busqueda${unico()}`;
      await repos.pacientes.crear(nuevoPaciente({ apellidos: `${marca} A` }), actor);
      await repos.pacientes.crear(nuevoPaciente({ apellidos: `${marca} B` }), actor);

      const pagina = await repos.pacientes.buscar({ texto: marca.toLowerCase(), limite: 1, desplazamiento: 1 });
      assert.equal(pagina.total, 2);
      assert.equal(pagina.elementos.length, 1);
      assert.match(pagina.elementos[0].apellidos, / B$/);

      const comodin = await repos.pacientes.buscar({ texto: '%%%', limite: 5, desplazamiento: 0 });
      assert.equal(comodin.total, 0);
    });

    it('pacientes: actualizar cambia solo lo indicado y reemplaza colecciones', async () => {
      const paciente = await repos.pacientes.crear(nuevoPaciente(), actor);
      const cambiado = await repos.pacientes.actualizar(paciente.id_paciente, {
        direccion: 'Zona 10',
        telefonos: [{ numero: '5555-9999', tipo: 'Trabajo' }],
        contactos_emergencia: [],
      }, actor);
      assert.equal(cambiado.direccion, 'Zona 10');
      assert.equal(cambiado.nombres, 'Contrato');
      assert.deepEqual(cambiado.telefonos.map((t) => t.numero), ['5555-9999']);
      assert.equal(cambiado.contactos_emergencia.length, 0);
      assert.equal(cambiado.correos.length, 1);
    });

    it('pacientes: archivar actualiza paciente e historial como una unidad', async () => {
      const paciente = await repos.pacientes.crear(nuevoPaciente(), actor);
      const archivado = await repos.pacientes.archivar(paciente.id_paciente, {
        estado: 'Archivado', motivo: 'Traslado', fecha: '2026-03-01',
      }, actor);
      assert.equal(archivado.estado, 'Archivado');
      assert.equal(archivado.motivo_baja, 'Traslado');
      const { historial } = await repos.historiales.obtenerCompleto(paciente.id_paciente);
      assert.equal(historial.estado, 'Archivado');
      assert.equal(historial.fecha_cierre, '2026-03-01');
      assert.equal(historial.motivo_cierre, 'Traslado');
    });

    it('historiales: agrega alergias y antecedentes, sin repetir alergia', async () => {
      const { id_paciente: id } = await repos.pacientes.crear(nuevoPaciente(), actor);
      const datos = {
        id_catalogo_alergia: alergias[0].id_catalogo_alergia,
        reaccion: 'Urticaria',
        nivel_gravedad: 'Grave',
        fecha_registro: '2026-01-20',
      };
      const alergia = await repos.historiales.agregarAlergia(id, datos, actor);
      assert.equal(alergia.sustancia, alergias[0].sustancia);
      assert.equal(alergia.fecha_registro, '2026-01-20');
      await assert.rejects(repos.historiales.agregarAlergia(id, datos, actor), errores.RegistroDuplicado);
      await assert.rejects(
        repos.historiales.agregarAlergia(id, { ...datos, id_catalogo_alergia: '999999999' }, actor),
        errores.DatosInvalidos,
      );

      const antecedente = await repos.historiales.agregarAntecedente(id, {
        tipo_antecedente: 'Quirúrgico', descripcion: 'Apendicectomía', fecha_registro: '2026-01-20',
      }, actor);
      assert.equal(typeof antecedente.id_antecedente, 'string');

      const completo = await repos.historiales.obtenerCompleto(id);
      assert.equal(completo.alergias.length, 1);
      assert.equal(completo.antecedentes[0].tipo_antecedente, 'Quirúrgico');
      assert.deepEqual(completo.consultas, []);
      assert.equal((await repos.historiales.listarAlergias(id)).length, 1);
      await assert.rejects(repos.historiales.listarAlergias('999999999'), errores.NoEncontrado);
      assert.equal(await repos.historiales.obtenerCompleto('abc'), null);
    });

    it('citas: crea, lista y actualiza con fecha y hora del contrato', async () => {
      const { id_paciente: id } = await repos.pacientes.crear(nuevoPaciente(), actor);
      const cita = await repos.citas.crear({
        id_paciente: id,
        id_institucion: idInstitucion,
        id_usuario_profesional: profesional.id_usuario,
        fecha_hora: horaBase,
        motivo_consulta: 'Control',
      }, actor);
      assert.equal(cita.estado, 'Programada');
      assert.equal(cita.fecha_hora, horaBase);
      assert.match(cita.fecha_creacion, FECHA);

      const lista = await repos.citas.listar({ id_paciente: id, desde: horaBase, hasta: horaBase });
      assert.deepEqual(lista.map((c) => c.id_cita), [cita.id_cita]);
      assert.deepEqual(await repos.citas.listar({ id_paciente: 'abc' }), []);

      const cancelada = await repos.citas.actualizar(cita.id_cita, { estado: 'Cancelada' }, actor);
      assert.equal(cancelada.estado, 'Cancelada');
      assert.equal(await repos.citas.obtener('abc'), null);
      await assert.rejects(repos.citas.actualizar('999999999', { estado: 'Cancelada' }, actor), errores.NoEncontrado);
    });

    it('citas: dos envíos simultáneos idénticos dejan una sola cita', async () => {
      const { id_paciente: id } = await repos.pacientes.crear(nuevoPaciente(), actor);
      const datos = {
        id_paciente: id,
        id_institucion: idInstitucion,
        id_usuario_profesional: profesional.id_usuario,
        fecha_hora: horaBase,
      };
      const resultados = await Promise.allSettled([repos.citas.crear(datos, actor), repos.citas.crear(datos, actor)]);
      assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
      const rechazo = resultados.find((r) => r.status === 'rejected');
      assert.ok(rechazo.reason instanceof errores.RegistroDuplicado, String(rechazo.reason));
      assert.equal((await repos.citas.listar({ id_paciente: id })).length, 1);
    });

    it('consultas: registra la atención completa con los tipos del contrato', async () => {
      const { id_paciente: id, id_historial: idHistorial } = await repos.pacientes.crear(nuevoPaciente(), actor);
      const cita = await repos.citas.crear({
        id_paciente: id,
        id_institucion: idInstitucion,
        id_usuario_profesional: profesional.id_usuario,
        fecha_hora: horaBase,
      }, actor);

      const consulta = await repos.consultas.registrarAtencion(nuevaAtencion(id, {
        id_cita: cita.id_cita,
        signos_vitales: {
          presion_arterial: '120/80', temperatura: 37.5, frecuencia_cardiaca: 70, peso: 65.25, talla: 170, fecha_registro: horaBase,
        },
        diagnosticos: [{ id_catalogo_diag: diagnosticos[0].id_catalogo_diag, tipo: 'Definitivo', fecha_registro: '2026-01-20' }],
        tratamientos: [{ descripcion: 'Reposo', fecha_inicio: '2026-01-20', estado: 'Activo' }],
        receta: {
          fecha_receta: '2026-01-20',
          detalles: [{ id_medicamento: medicamentos[0].id_medicamento, dosis: '1 tableta', frecuencia: 'Cada 8 h' }],
        },
      }), actor, ventana());

      assert.equal(typeof consulta.id_consulta, 'string');
      assert.equal(consulta.id_historial, idHistorial);
      assert.equal(consulta.id_paciente, id);
      assert.equal(consulta.id_cita, cita.id_cita);
      assert.match(consulta.fecha_hora, FECHA_HORA);
      assert.equal(consulta.signos_vitales.temperatura, 37.5);
      assert.equal(typeof consulta.signos_vitales.peso, 'number');
      assert.match(consulta.signos_vitales.fecha_registro, FECHA_HORA);
      assert.equal(consulta.diagnosticos[0].nombre_diagnostico, diagnosticos[0].nombre_diagnostico);
      assert.match(consulta.diagnosticos[0].fecha_registro, FECHA);
      assert.equal(consulta.tratamientos[0].descripcion, 'Reposo');
      assert.equal(consulta.recetas[0].detalles[0].nombre_medicamento, medicamentos[0].nombre);

      assert.equal((await repos.citas.obtener(cita.id_cita)).estado, 'Atendida');
      const completo = await repos.historiales.obtenerCompleto(id);
      assert.deepEqual(completo.consultas.map((c) => c.id_consulta), [consulta.id_consulta]);
    });

    it('consultas: un fallo en la receta no deja consulta ni diagnóstico (atomicidad)', async () => {
      const { id_paciente: id } = await repos.pacientes.crear(nuevoPaciente(), actor);
      const cita = await repos.citas.crear({
        id_paciente: id,
        id_institucion: idInstitucion,
        id_usuario_profesional: profesional.id_usuario,
        fecha_hora: horaBase,
      }, actor);

      await assert.rejects(repos.consultas.registrarAtencion(nuevaAtencion(id, {
        id_cita: cita.id_cita,
        diagnosticos: [{ id_catalogo_diag: diagnosticos[0].id_catalogo_diag, fecha_registro: '2026-01-20' }],
        receta: {
          fecha_receta: '2026-01-20',
          detalles: [{ id_medicamento: '999999999', dosis: '1', frecuencia: '1' }],
        },
      }), actor, ventana()), errores.DatosInvalidos);

      const completo = await repos.historiales.obtenerCompleto(id);
      assert.deepEqual(completo.consultas, []);
      assert.equal((await repos.citas.obtener(cita.id_cita)).estado, 'Programada');
    });

    it('consultas: rechaza una cita que no es del paciente, sin guardar nada', async () => {
      const a = await repos.pacientes.crear(nuevoPaciente(), actor);
      const b = await repos.pacientes.crear(nuevoPaciente(), actor);
      const cita = await repos.citas.crear({
        id_paciente: a.id_paciente,
        id_institucion: idInstitucion,
        id_usuario_profesional: profesional.id_usuario,
        fecha_hora: horaBase,
      }, actor);
      await assert.rejects(
        repos.consultas.registrarAtencion(nuevaAtencion(b.id_paciente, { id_cita: cita.id_cita }), actor, ventana()),
        errores.ReglaNegocio,
      );
      assert.deepEqual((await repos.historiales.obtenerCompleto(b.id_paciente)).consultas, []);
    });

    it('consultas: dos envíos simultáneos idénticos dejan una sola consulta', async () => {
      const { id_paciente: id } = await repos.pacientes.crear(nuevoPaciente(), actor);
      const datos = nuevaAtencion(id);
      const resultados = await Promise.allSettled([
        repos.consultas.registrarAtencion(datos, actor, ventana()),
        repos.consultas.registrarAtencion(datos, actor, ventana()),
      ]);
      assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
      const rechazo = resultados.find((r) => r.status === 'rejected');
      assert.ok(rechazo.reason instanceof errores.ConsultaDuplicada, String(rechazo.reason));
      assert.equal((await repos.historiales.obtenerCompleto(id)).consultas.length, 1);
    });

    it('consultas: valores nulos también cuentan como idénticos', async () => {
      const { id_paciente: id } = await repos.pacientes.crear(nuevoPaciente(), actor);
      const datos = nuevaAtencion(id, { motivo_consulta: undefined, sintomas: undefined, notas_clinicas: undefined });
      await repos.consultas.registrarAtencion(datos, actor, ventana());
      await assert.rejects(repos.consultas.registrarAtencion(datos, actor, ventana()), errores.ConsultaDuplicada);
    });

    it('consultas: una consulta idéntica fuera de la ventana sí se permite', async () => {
      const { id_paciente: id } = await repos.pacientes.crear(nuevoPaciente(), actor);
      const datos = nuevaAtencion(id);
      await repos.consultas.registrarAtencion(datos, actor, ventana());
      const otra = await repos.consultas.registrarAtencion(
        { ...datos, fecha_hora: '2001-01-01T10:00:00' },
        actor,
        { desde: '2001-01-01T09:59:30', hasta: '2001-01-01T10:00:30' },
      );
      assert.ok(otra.id_consulta);
    });

    it('consultas: agrega detalle y cambia estado', async () => {
      const { id_paciente: id } = await repos.pacientes.crear(nuevoPaciente(), actor);
      const { id_consulta: idConsulta } = await repos.consultas.registrarAtencion(nuevaAtencion(id), actor, ventana());
      const diagnostico = { id_catalogo_diag: diagnosticos[0].id_catalogo_diag, tipo: 'Presuntivo', fecha_registro: '2026-01-20' };

      const conDiagnostico = await repos.consultas.agregarDiagnostico(idConsulta, diagnostico, actor);
      assert.equal(conDiagnostico.diagnosticos.length, 1);
      await assert.rejects(repos.consultas.agregarDiagnostico(idConsulta, diagnostico, actor), errores.RegistroDuplicado);

      const conTratamiento = await repos.consultas.agregarTratamiento(idConsulta, {
        descripcion: 'Dieta', fecha_inicio: '2026-01-20', estado: 'Activo',
      }, actor);
      assert.equal(conTratamiento.tratamientos.length, 1);

      const conReceta = await repos.consultas.agregarReceta(idConsulta, {
        fecha_receta: '2026-01-20',
        detalles: [{ id_medicamento: medicamentos[0].id_medicamento, dosis: '1', frecuencia: '1' }],
      }, actor);
      assert.equal(conReceta.recetas.length, 1);

      const finalizada = await repos.consultas.cambiarEstado(idConsulta, 'Finalizada', actor);
      assert.equal(finalizada.estado, 'Finalizada');
      assert.equal(await repos.consultas.obtener('abc'), null);
      await assert.rejects(repos.consultas.cambiarEstado('999999999', 'Anulada', actor), errores.NoEncontrado);
    });

    it('catálogos: devuelve elementos con ID string y filtra por texto o IDs', async () => {
      assert.ok(diagnosticos.length > 0 && medicamentos.length > 0 && alergias.length > 0);
      assert.equal(typeof diagnosticos[0].id_catalogo_diag, 'string');
      const filtrados = await repos.catalogos.diagnosticos({ texto: diagnosticos[0].nombre_diagnostico.slice(0, 5) });
      assert.ok(filtrados.some((d) => d.id_catalogo_diag === diagnosticos[0].id_catalogo_diag));
      const porId = await repos.catalogos.medicamentos({ ids: [medicamentos[0].id_medicamento, 'abc'] });
      assert.deepEqual(porId.map((m) => m.id_medicamento), [medicamentos[0].id_medicamento]);
    });

    it('salud: verifica el motor', async () => {
      await repos.salud.verificar();
    });
  });
}

module.exports = { ejecutarSuiteContrato };
