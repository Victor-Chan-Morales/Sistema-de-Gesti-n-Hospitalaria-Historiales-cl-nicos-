// QA Parte C: reproduce por HTTP las llamadas exactas que dispara la interfaz
// con los 12 usuarios de prueba, en las cuatro instituciones. Requiere el
// servidor en marcha y las bases sembradas. Crea datos de prueba nuevos en cada
// corrida (pacientes, citas, consultas, órdenes y controles).
//
//   cd backend && npm run seed && npm run seed:nosql && npm start
//   SEED_CONTRASENA=... node frontend/qa/flujos-api.cjs
"use strict";

const BASE = process.env.QA_BASE || 'http://localhost:3000';
const CONTRASENA = process.env.SEED_CONTRASENA;
if (!CONTRASENA) { console.error('Define SEED_CONTRASENA con la contraseña de los usuarios de prueba.'); process.exit(1); }
// Sufijo único por corrida: re-ejecutar el QA no choca con lo único (DPI, dosis).
const SUFIJO = String(Date.now()).slice(-6);

let fallos = 0;
const ok = (descripcion, condicion, detalle = '') => {
  if (condicion) console.log(`ok   - ${descripcion}`);
  else {
    fallos += 1;
    console.log(`FALLO - ${descripcion} ${detalle}`);
  }
};
const seccion = (titulo) => console.log(`\n== ${titulo} ==`);

async function pedir(metodo, ruta, { token, cuerpo } = {}) {
  const opciones = { method: metodo, headers: {} };
  if (token) opciones.headers.Authorization = `Bearer ${token}`;
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  const respuesta = await fetch(`${BASE}${ruta}`, opciones);
  const texto = await respuesta.text();
  let datos = null;
  try { datos = JSON.parse(texto); } catch { datos = texto; }
  return { estado: respuesta.status, datos };
}

async function login(usuario) {
  const r = await pedir('POST', '/api/auth/login', { cuerpo: { usuario, contrasena: CONTRASENA } });
  if (r.estado !== 200) throw new Error(`login de ${usuario} falló: ${r.estado} ${JSON.stringify(r.datos)}`);
  return { token: r.datos.token, perfil: r.datos.usuario };
}

const fechaFutura = (dias) => {
  const d = new Date(Date.now() + dias * 24 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:30:00`;
};

(async () => {
  // ---------- A. Archivos estáticos de la interfaz ----------
  seccion('A. Estáticos');
  for (const ruta of ['/', '/index.html', '/dashboard.html', '/js/sesion.js', '/js/api.js', '/js/utilidades.js', '/js/login.js', '/js/panel.js', '/js/vistas/pacientes.js', '/js/vistas/citas.js', '/js/vistas/consultas.js', '/js/vistas/historial.js', '/js/vistas/laboratorio.js', '/js/vistas/pediatria.js']) {
    const r = await fetch(`${BASE}${ruta}`);
    ok(`estático ${ruta}`, r.status === 200);
  }
  const index = await (await fetch(`${BASE}/`)).text();
  ok('index trae el formulario de login', index.includes('form-login') && index.includes('js/login.js'));
  const dashboard = await (await fetch(`${BASE}/dashboard.html`)).text();
  ok('dashboard carga todas las vistas y el panel', ['vistas/pacientes.js', 'vistas/laboratorio.js', 'vistas/pediatria.js', 'js/panel.js'].every((x) => dashboard.includes(x)));

  // ---------- B. Login de los 12 usuarios y credenciales inválidas ----------
  seccion('B. Login');
  const esperados = {
    'admin.hospital': { rol: 'Administrador', institucion: '1' },
    'secretaria.hospital': { rol: 'Secretaria', institucion: '1' },
    'medico.hospital': { rol: 'Médico', institucion: '1' },
    'admin.clinica': { rol: 'Administrador', institucion: '2' },
    'secretaria.clinica': { rol: 'Secretaria', institucion: '2' },
    'odontologo.clinica': { rol: 'Odontólogo', institucion: '2' },
    'admin.laboratorio': { rol: 'Administrador', institucion: '3' },
    'secretaria.laboratorio': { rol: 'Secretaria', institucion: '3' },
    'laboratorista.laboratorio': { rol: 'Laboratorista', institucion: '3' },
    'admin.pediatrico': { rol: 'Administrador', institucion: '4' },
    'secretaria.pediatrico': { rol: 'Secretaria', institucion: '4' },
    'pediatra.pediatrico': { rol: 'Médico', institucion: '4' },
  };
  const sesiones = {};
  for (const [usuario, esperado] of Object.entries(esperados)) {
    const s = await login(usuario);
    sesiones[usuario] = s;
    ok(`login ${usuario}`, s.perfil.rol === esperado.rol && String(s.perfil.id_institucion) === esperado.institucion,
      `→ ${s.perfil.rol}/${s.perfil.id_institucion}`);
  }
  const mal = await pedir('POST', '/api/auth/login', { cuerpo: { usuario: 'noexiste', contrasena: 'mala' } });
  ok('credenciales inválidas → 401 NO_AUTORIZADO', mal.estado === 401 && mal.datos.codigo === 'NO_AUTORIZADO' && typeof mal.datos.mensaje === 'string');
  const sinToken = await pedir('GET', '/api/pacientes');
  ok('sin token → 401 con mensaje listo', sinToken.estado === 401 && sinToken.datos?.codigo === 'NO_AUTORIZADO' && Boolean(sinToken.datos?.mensaje));
  const tokenBasura = await pedir('GET', '/api/pacientes', { token: 'basura' });
  ok('token inválido → 401', tokenBasura.estado === 401 && tokenBasura.datos?.codigo === 'NO_AUTORIZADO');

  // ---------- C. Secretaria del hospital: pacientes y citas, sin clínico ----------
  seccion('C. Secretaria (Hospital General, PostgreSQL)');
  const tSecretaria = sesiones['secretaria.hospital'].token;
  const tAdmin = sesiones['admin.hospital'].token;
  const tMedico = sesiones['medico.hospital'].token;

  const busqueda = await pedir('GET', '/api/pacientes?texto=P%C3%A9rez', { token: tSecretaria });
  ok('busca pacientes por texto', busqueda.estado === 200 && busqueda.datos.elementos.length > 0 && typeof busqueda.datos.total === 'number');
  const idAna = busqueda.datos.elementos.find((p) => p.nombres === 'Ana Lucía')?.id_paciente;

  const nuevoPacienteSecretaria = {
    nombres: 'Queta', apellidos: 'Prueba Secretaria', fecha_nacimiento: '1975-03-03',
    dpi_o_documento: `HG-QA-SEC-${SUFIJO}`, sexo: 'F', telefonos: [{ numero: '5555-9911', tipo: 'Casa' }], correos: [],
  };
  const creadoSecretaria = await pedir('POST', '/api/pacientes', { token: tSecretaria, cuerpo: nuevoPacienteSecretaria });
  ok('registra paciente', creadoSecretaria.estado === 201 && typeof creadoSecretaria.datos.id_paciente === 'string' && creadoSecretaria.datos.codigo_historial);
  const idPacienteSecretaria = creadoSecretaria.datos.id_paciente;

  const profesionales = await pedir('GET', '/api/catalogos/profesionales', { token: tSecretaria });
  ok('catálogo de profesionales activos', profesionales.estado === 200 && profesionales.datos.length > 0);
  const idProfesional = profesionales.datos.find((p) => p.rol === 'Médico')?.id_usuario;

  const citaNueva = await pedir('POST', '/api/citas', { token: tSecretaria, cuerpo: {
    id_paciente: idPacienteSecretaria, id_usuario_profesional: idProfesional, fecha_hora: fechaFutura(3), motivo_consulta: 'Control anual',
  } });
  ok('programa cita', citaNueva.estado === 201 && citaNueva.datos.estado === 'Programada' && typeof citaNueva.datos.id_cita === 'string');
  const idCitaSecretaria = citaNueva.datos.id_cita;

  const reprogramada = await pedir('PATCH', `/api/citas/${idCitaSecretaria}`, { token: tSecretaria, cuerpo: { fecha_hora: fechaFutura(5) } });
  ok('reprograma cita', reprogramada.estado === 200 && reprogramada.datos.fecha_hora === fechaFutura(5));

  const listaCitas = await pedir('GET', `/api/citas?id_paciente=${idPacienteSecretaria}`, { token: tSecretaria });
  ok('filtra citas por paciente', listaCitas.estado === 200 && listaCitas.datos.some((c) => c.id_cita === idCitaSecretaria));

  const noAsistio = await pedir('PATCH', `/api/citas/${idCitaSecretaria}`, { token: tSecretaria, cuerpo: { estado: 'No Asistió' } });
  ok('marca No Asistió', noAsistio.estado === 200 && noAsistio.datos.estado === 'No Asistió');
  const editarCerrada = await pedir('PATCH', `/api/citas/${idCitaSecretaria}`, { token: tSecretaria, cuerpo: { fecha_hora: fechaFutura(6) } });
  ok('cita cerrada no se modifica → 422', editarCerrada.estado === 422 && editarCerrada.datos.codigo === 'REGLA_NEGOCIO');

  const prohibidoHistorial = await pedir('GET', `/api/pacientes/${idPacienteSecretaria}/historial`, { token: tSecretaria });
  ok('secretaria no ve historial → 403', prohibidoHistorial.estado === 403 && prohibidoHistorial.datos.codigo === 'PROHIBIDO');
  const prohibidoConsulta = await pedir('POST', '/api/consultas', { token: tSecretaria, cuerpo: { id_paciente: idPacienteSecretaria } });
  ok('secretaria no registra consulta → 403', prohibidoConsulta.estado === 403);

  // ---------- D. Administrador del hospital: archivar e informes, sin clínico ----------
  seccion('D. Administrador (Hospital General)');
  const pacienteAdmin = await pedir('POST', '/api/pacientes', { token: tAdmin, cuerpo: {
    nombres: 'Romo', apellidos: 'Prueba Admin', fecha_nacimiento: '1960-08-08', dpi_o_documento: `HG-QA-ADM-${SUFIJO}`,
  } });
  ok('crea paciente', pacienteAdmin.estado === 201);
  const idPacienteAdmin = pacienteAdmin.datos.id_paciente;

  const edicion = await pedir('PATCH', `/api/pacientes/${idPacienteAdmin}`, { token: tAdmin, cuerpo: {
    nombres: 'Romo', apellidos: 'Prueba Admin', fecha_nacimiento: '1960-08-08', direccion: 'Av. Siempreviva 742',
  } });
  ok('edita paciente (PATCH parcial)', edicion.estado === 200 && edicion.datos.direccion === 'Av. Siempreviva 742');

  const archivado = await pedir('POST', `/api/pacientes/${idPacienteAdmin}/archivar`, { token: tAdmin, cuerpo: { estado: 'Inactivo', motivo: 'QA: baja voluntaria' } });
  ok('archiva paciente con motivo', archivado.estado === 200 && archivado.datos.estado === 'Inactivo' && archivado.datos.motivo_baja === 'QA: baja voluntaria');

  const citaArchivado = await pedir('POST', '/api/citas', { token: tAdmin, cuerpo: {
    id_paciente: idPacienteAdmin, id_usuario_profesional: idProfesional, fecha_hora: fechaFutura(2),
  } });
  ok('paciente inactivo no recibe cita → 422', citaArchivado.estado === 422 && citaArchivado.datos.codigo === 'REGLA_NEGOCIO' && Boolean(citaArchivado.datos.mensaje));

  const adminHistorial = await pedir('GET', `/api/pacientes/${idPacienteSecretaria}/historial`, { token: tAdmin });
  ok('administrador no ve historial → 403', adminHistorial.estado === 403);

  // ---------- E. Médico del hospital: flujo clínico completo ----------
  seccion('E. Médico (Hospital General, PostgreSQL)');
  const pacienteMedico = await pedir('POST', '/api/pacientes', { token: tMedico, cuerpo: {
    nombres: 'Elena', apellidos: 'Prueba Medico', fecha_nacimiento: '1992-02-02', dpi_o_documento: `HG-QA-MED-${SUFIJO}`, tipo_sangre: 'O+',
  } });
  const idPacienteMedico = pacienteMedico.datos.id_paciente;
  ok('crea paciente', pacienteMedico.estado === 201);

  const catalogoAlergias = await pedir('GET', '/api/catalogos/alergias', { token: tMedico });
  const idPenicilina = catalogoAlergias.datos.find((a) => a.sustancia === 'Penicilina')?.id_catalogo_alergia;
  const alergia = await pedir('POST', `/api/pacientes/${idPacienteMedico}/alergias`, { token: tMedico, cuerpo: {
    id_catalogo_alergia: idPenicilina, nivel_gravedad: 'Grave', reaccion: 'Urticaria',
  } });
  ok('agrega alergia', alergia.estado === 201 && alergia.datos.sustancia === 'Penicilina');

  const antecedente = await pedir('POST', `/api/pacientes/${idPacienteMedico}/antecedentes`, { token: tMedico, cuerpo: {
    tipo_antecedente: 'Personal', descripcion: 'Asma en la infancia', estado: 'Superado',
  } });
  ok('agrega antecedente', antecedente.estado === 201);

  const catalogoDiag = await pedir('GET', '/api/catalogos/diagnosticos', { token: tMedico });
  const idHta = catalogoDiag.datos.find((d) => d.codigo_clinico === 'I10').id_catalogo_diag;
  const idIvr = catalogoDiag.datos.find((d) => d.codigo_clinico === 'J06.9').id_catalogo_diag;
  const idDm2 = catalogoDiag.datos.find((d) => d.codigo_clinico === 'E11.9').id_catalogo_diag;
  const catalogoMed = await pedir('GET', '/api/catalogos/medicamentos', { token: tMedico });
  const idAmoxi = catalogoMed.datos.find((m) => m.nombre === 'Amoxicilina').id_medicamento;
  const idIbu = catalogoMed.datos.find((m) => m.nombre === 'Ibuprofeno').id_medicamento;

  const consultaCuerpo = {
    id_paciente: idPacienteMedico,
    motivo_consulta: 'Dolor de garganta',
    sintomas: 'Fiebre 38.5, odinofagia',
    signos_vitales: { temperatura: 38.5, frecuencia_cardiaca: 92, peso: 64.5, talla: 1.68 },
    diagnosticos: [{ id_catalogo_diag: idHta, tipo: 'Definitivo', observaciones: 'Cont roles' }],
    tratamientos: [{ descripcion: 'Dieta hiposódica', indicaciones: 'Control mensual' }],
    receta: { detalles: [{ id_medicamento: idAmoxi, dosis: '500 mg', frecuencia: ' cada 8 horas', via_administracion: 'Oral', duracion: '7 días' }] },
  };
  const consulta = await pedir('POST', '/api/consultas', { token: tMedico, cuerpo: consultaCuerpo });
  ok('registra consulta completa → 201', consulta.estado === 201 && typeof consulta.datos.consulta.id_consulta === 'string');
  ok('advertencia de alergia visible', Array.isArray(consulta.datos.advertencias) && consulta.datos.advertencias.some((a) => a.includes('Penicilina')),
    `→ ${JSON.stringify(consulta.datos.advertencias)}`);
  const idConsulta = consulta.datos.consulta.id_consulta;
  ok('consulta guarda receta con nombre', consulta.datos.consulta.recetas[0].detalles[0].nombre_medicamento === 'Amoxicilina');

  const duplicada = await pedir('POST', '/api/consultas', { token: tMedico, cuerpo: consultaCuerpo });
  ok('doble envío idéntico → 409', duplicada.estado === 409 && ['REGISTRO_DUPLICADO', 'CONSULTA_DUPLICADA'].includes(duplicada.datos.codigo));

  const detalle = await pedir('GET', `/api/consultas/${idConsulta}`, { token: tMedico });
  ok('lee consulta con detalle', detalle.estado === 200 && detalle.datos.diagnosticos.length === 1 && detalle.datos.signos_vitales?.temperatura === 38.5);

  const citaMedico = await pedir('POST', '/api/citas', { token: tSecretaria, cuerpo: {
    id_paciente: idPacienteMedico, id_usuario_profesional: idProfesional, fecha_hora: fechaFutura(1), motivo_consulta: 'Consulta QA',
  } });
  const consultaConCita = await pedir('POST', '/api/consultas', { token: tMedico, cuerpo: {
    id_paciente: idPacienteMedico, id_cita: citaMedico.datos.id_cita, motivo_consulta: 'Consulta con cita',
  } });
  ok('consulta desde la cita → cita Atendida', consultaConCita.estado === 201);
  const citaTrasConsulta = await pedir('GET', `/api/citas/${citaMedico.datos.id_cita}`, { token: tSecretaria });
  ok('cita queda Atendida', citaTrasConsulta.datos.estado === 'Atendida');

  const extraDiag = await pedir('POST', `/api/consultas/${idConsulta}/diagnosticos`, { token: tMedico, cuerpo: { id_catalogo_diag: idIvr, tipo: 'Seguimiento' } });
  const extraTrat = await pedir('POST', `/api/consultas/${idConsulta}/tratamientos`, { token: tMedico, cuerpo: { descripcion: 'Hidratación abundante' } });
  const extraReceta = await pedir('POST', `/api/consultas/${idConsulta}/recetas`, { token: tMedico, cuerpo: { detalles: [{ id_medicamento: idIbu, dosis: '400 mg', frecuencia: 'cada 8 horas' }] } });
  ok('agrega diagnóstico a consulta abierta', extraDiag.estado === 201);
  ok('agrega tratamiento a consulta abierta', extraTrat.estado === 201);
  ok('agrega receta y trae advertencias (puede ser ninguna)', extraReceta.estado === 201 && Array.isArray(extraReceta.datos.advertencias));

  const finalizada = await pedir('PATCH', `/api/consultas/${idConsulta}/estado`, { token: tMedico, cuerpo: { estado: 'Finalizada' } });
  ok('finaliza consulta', finalizada.estado === 200 && finalizada.datos.estado === 'Finalizada');
  const extraFinalizada = await pedir('POST', `/api/consultas/${idConsulta}/tratamientos`, { token: tMedico, cuerpo: { descripcion: 'Control en una semana' } });
  ok('permite agregar datos a consulta finalizada → 201', extraFinalizada.estado === 201);
  const anulada = await pedir('PATCH', `/api/consultas/${idConsulta}/estado`, { token: tMedico, cuerpo: { estado: 'Anulada' } });
  ok('anula consulta finalizada', anulada.estado === 200 && anulada.datos.estado === 'Anulada');
  const extraAnulada = await pedir('POST', `/api/consultas/${idConsulta}/diagnosticos`, { token: tMedico, cuerpo: { id_catalogo_diag: idDm2 } });
  ok('consulta anulada no admite extras → 422', extraAnulada.estado === 422 && extraAnulada.datos.codigo === 'REGLA_NEGOCIO');

  const historial = await pedir('GET', `/api/pacientes/${idPacienteMedico}/historial`, { token: tMedico });
  ok('historial con antecedentes, alergias y consultas', historial.estado === 200
    && historial.datos.antecedentes.length >= 1
    && historial.datos.alergias.some((a) => a.sustancia === 'Penicilina')
    && historial.datos.consultas.length >= 2);

  // ---------- F. Odontólogo de la clínica: paridad en MySQL ----------
  seccion('F. Odontólogo (Clínica Odontológica, MySQL)');
  const tOdonto = sesiones['odontologo.clinica'].token;
  const pacienteOdonto = await pedir('POST', '/api/pacientes', { token: tOdonto, cuerpo: {
    nombres: 'Nube', apellidos: 'Prueba Odonto', fecha_nacimiento: '1985-05-15', dpi_o_documento: `CL-QA-ODO-${SUFIJO}`,
  } });
  ok('crea paciente en MySQL', pacienteOdonto.estado === 201 && typeof pacienteOdonto.datos.id_paciente === 'string');
  const idPacienteOdonto = pacienteOdonto.datos.id_paciente;
  const alergiaCl = await pedir('POST', `/api/pacientes/${idPacienteOdonto}/alergias`, { token: tOdonto, cuerpo: { id_catalogo_alergia: idPenicilina, nivel_gravedad: 'Moderada' } });
  ok('agrega alergia en MySQL', alergiaCl.estado === 201);
  const consultaCl = await pedir('POST', '/api/consultas', { token: tOdonto, cuerpo: {
    id_paciente: idPacienteOdonto, motivo_consulta: 'Limpieza',
    receta: { detalles: [{ id_medicamento: idAmoxi, dosis: '875 mg', frecuencia: 'cada 12 horas' }] },
  } });
  ok('consulta con advertencia en MySQL (mismo contrato)', consultaCl.estado === 201 && consultaCl.datos.advertencias.some((a) => a.includes('Penicilina')));
  const cruzado = await pedir('GET', `/api/pacientes?texto=${encodeURIComponent('Prueba Medico')}`, { token: tOdonto });
  ok('no ve pacientes de otra institución', cruzado.datos.total === 0);

  // ---------- G. Laboratorista del laboratorio: órdenes y resultados ----------
  seccion('G. Laboratorista (Laboratorio Clínico, MongoDB)');
  const tLabo = sesiones['laboratorista.laboratorio'].token;
  const tipos = await pedir('GET', '/api/laboratorio/tipos-examen', { token: tLabo });
  ok('lista tipos de examen', tipos.estado === 200 && tipos.datos.length >= 2, `→ ${tipos.estado}`);
  const idsTipos = tipos.datos.slice(0, 2).map((t) => t.id_tipo_examen);

  const pacienteLabo = await pedir('POST', '/api/pacientes', { token: tLabo, cuerpo: {
    nombres: 'Onda', apellidos: 'Prueba Labo', fecha_nacimiento: '1999-09-09', dpi_o_documento: `LB-QA-LAB-${SUFIJO}`,
  } });
  const idPacienteLabo = pacienteLabo.datos.id_paciente;

  const ordenCuerpo = { id_paciente: idPacienteLabo, prioridad: 'Urgente', examenes: idsTipos.map((id) => ({ id_tipo_examen: id })) };
  const orden = await pedir('POST', '/api/laboratorio/ordenes', { token: tLabo, cuerpo: ordenCuerpo });
  ok('crea orden con varios exámenes', orden.estado === 201 && orden.datos.estado === 'Pendiente' && orden.datos.examenes.length === 2);
  const idOrden = orden.datos.id_orden_laboratorio;

  const ordenDuplicada = await pedir('POST', '/api/laboratorio/ordenes', { token: tLabo, cuerpo: ordenCuerpo });
  ok('orden duplicada inmediata → 409', ordenDuplicada.estado === 409);

  const entregadaAntes = await pedir('PATCH', `/api/laboratorio/ordenes/${idOrden}/estado`, { token: tLabo, cuerpo: { estado: 'Entregada' } });
  ok('transición inválida → 422', entregadaAntes.estado === 422 && entregadaAntes.datos.codigo === 'REGLA_NEGOCIO');

  const enProceso = await pedir('PATCH', `/api/laboratorio/ordenes/${idOrden}/estado`, { token: tLabo, cuerpo: { estado: 'En proceso' } });
  ok('pasa a En proceso', enProceso.estado === 200 && enProceso.datos.estado === 'En proceso');

  const resultado = await pedir('POST', `/api/laboratorio/ordenes/${idOrden}/resultados`, { token: tLabo, cuerpo: {
    id_tipo_examen: idsTipos[0], fecha_toma_muestra: '2026-11-01', resultado_general: 'Dentro de rangos',
    valores_detallados: [
      { parametro: 'Hemoglobina', valor: '13.5', unidad: 'g/dL', rango_referencia: '12-16' },
      { parametro: 'Glucosa', valor: '92', unidad: 'mg/dL', rango_referencia: '70-100' },
    ],
  } });
  ok('registra resultado de estructura variable', resultado.estado === 201 && resultado.datos.resultados.length === 1);

  const resultadoDuplicado = await pedir('POST', `/api/laboratorio/ordenes/${idOrden}/resultados`, { token: tLabo, cuerpo: {
    id_tipo_examen: idsTipos[0], resultado_general: 'repetido',
  } });
  ok('examen con resultado no se repite → 409', resultadoDuplicado.estado === 409);

  const resultado2 = await pedir('POST', `/api/laboratorio/ordenes/${idOrden}/resultados`, { token: tLabo, cuerpo: {
    id_tipo_examen: idsTipos[1], resultado_general: 'Normal',
  } });
  ok('segundo resultado', resultado2.estado === 201);
  ok('orden pasa a Finalizada al completar exámenes', resultado2.datos.estado === 'Finalizada');

  const entregada = await pedir('PATCH', `/api/laboratorio/ordenes/${idOrden}/estado`, { token: tLabo, cuerpo: { estado: 'Entregada' } });
  ok('entrega la orden', entregada.estado === 200 && entregada.datos.estado === 'Entregada');

  const fueraLabo = await pedir('GET', '/api/pediatria/vacunas', { token: tLabo });
  ok('pediatría fuera del centro pediátrico → 422', fueraLabo.estado === 422 && fueraLabo.datos.codigo === 'REGLA_NEGOCIO');
  const adminLaboOrdenes = await pedir('GET', '/api/laboratorio/ordenes', { token: sesiones['admin.laboratorio'].token });
  ok('administrador no lista órdenes (solo profesionales) → 403', adminLaboOrdenes.estado === 403);
  const secretariaLaboOrdenes = await pedir('GET', '/api/laboratorio/ordenes', { token: sesiones['secretaria.laboratorio'].token });
  ok('secretaria no lista órdenes → 403', secretariaLaboOrdenes.estado === 403);

  // ---------- H. Pediatra del centro pediátrico: controles y vacunas ----------
  seccion('H. Pediatra (Centro Médico Pediátrico, Firebase)');
  const tPedia = sesiones['pediatra.pediatrico'].token;
  const vacunasCatalogo = await pedir('GET', '/api/pediatria/vacunas', { token: tPedia });
  ok('catálogo de vacunas', vacunasCatalogo.estado === 200 && vacunasCatalogo.datos.length > 0);
  const idVacuna = vacunasCatalogo.datos[0].id_vacuna;

  const menorPedia = await pedir('GET', '/api/pacientes?texto=Mateo', { token: tPedia });
  const idMenor = menorPedia.datos.elementos[0]?.id_paciente;
  ok('encuentra al menor de prueba', Boolean(idMenor), `→ ${JSON.stringify(menorPedia.datos.elementos?.[0])}`);

  const adultoPedia = await pedir('POST', '/api/pacientes', { token: tPedia, cuerpo: {
    nombres: 'Viejo', apellidos: 'Prueba Pediatra', fecha_nacimiento: '1980-01-01', dpi_o_documento: `PD-QA-PED-${SUFIJO}`,
  } });
  const idAdultoPed = adultoPedia.datos.id_paciente;

  const controlAdulto = await pedir('POST', `/api/pediatria/pacientes/${idAdultoPed}/controles`, { token: tPedia, cuerpo: { peso: 70, talla: 175 } });
  ok('control de un adulto → 422 con mensaje', controlAdulto.estado === 422 && Boolean(controlAdulto.datos.mensaje));

  const control = await pedir('POST', `/api/pediatria/pacientes/${idMenor}/controles`, { token: tPedia, cuerpo: {
    fecha_control: '2026-11-05', peso: 26.2, talla: 128, perimetro_cefalico: 52,
  } });
  ok('registra control de crecimiento', control.estado === 201 && typeof control.datos.indice_masa_corporal === 'number');
  ok('IMC calculado por el backend', Math.abs(control.datos.indice_masa_corporal - 26.2 / (1.28 * 1.28)) < 0.01, `→ ${control.datos.indice_masa_corporal}`);

  const vacunaCuerpo = { id_vacuna: idVacuna, numero_dosis: `Segunda ${SUFIJO}`, fecha_aplicacion: '2026-11-05', lote: `L-${SUFIJO}` };
  const vacuna = await pedir('POST', `/api/pediatria/pacientes/${idMenor}/vacunas`, { token: tPedia, cuerpo: vacunaCuerpo });
  ok('registra dosis', vacuna.estado === 201 && vacuna.datos.nombre_vacuna.length > 0);
  const vacunaDuplicada = await pedir('POST', `/api/pediatria/pacientes/${idMenor}/vacunas`, { token: tPedia, cuerpo: vacunaCuerpo });
  ok('dosis repetida (misma vacuna, dosis y fecha) → 409', vacunaDuplicada.estado === 409);

  const control2 = await pedir('POST', `/api/pediatria/pacientes/${idMenor}/controles`, { token: tPedia, cuerpo: {
    fecha_control: '2026-10-01', peso: 25.5, talla: 126,
  } });
  ok('segundo control', control2.estado === 201);
  const controlesLista = await pedir('GET', `/api/pediatria/pacientes/${idMenor}/controles`, { token: tPedia });
  ok('lista controles descendente', controlesLista.estado === 200 && controlesLista.datos.length >= 2
    && controlesLista.datos[0].fecha_control >= controlesLista.datos[controlesLista.datos.length - 1].fecha_control);

  const laboFuera = await pedir('GET', '/api/laboratorio/tipos-examen', { token: tPedia });
  ok('laboratorio fuera del laboratorio → 422', laboFuera.estado === 422);

  // ---------- I. Documenación interactiva y IDs como texto ----------
  seccion('I. Varios');
  const docs = await fetch(`${BASE}/api/docs/`);
  ok('documentación interactiva disponible', docs.status === 200);
  ok('ids de SQL llegan como texto', typeof creadoSecretaria.datos.id_paciente === 'string');
  ok('fecha futura del contrato', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(fechaFutura(3)));

  console.log(fallos === 0 ? '\nQA COMPLETO: todo ok' : `\nQA CON ${fallos} FALLOS`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
  console.error('Error del script de QA:', e.message);
  process.exit(1);
});
