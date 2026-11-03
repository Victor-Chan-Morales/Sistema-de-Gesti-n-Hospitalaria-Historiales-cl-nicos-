const { Router } = require('express');
const casos = require('../../../application/pacientes');
const dto = require('../../../dto/respuestas');
const { PERMISOS } = require('../../../domain/roles');
const { autorizar } = require('../middlewares');

function crearRutasPacientes() {
  const rutas = Router();
  const gestionar = autorizar(PERMISOS.GESTIONAR_PACIENTES_Y_CITAS);
  const verClinico = autorizar(PERMISOS.VER_HISTORIAL_CLINICO);
  const registrarClinico = autorizar(PERMISOS.REGISTRAR_DATOS_CLINICOS);

  rutas.get('/', gestionar, async (req, res) => {
    res.json(dto.paginaDto(await casos.buscarPacientes(req.repos, req.query), dto.pacienteResumenDto));
  });

  rutas.post('/', gestionar, async (req, res) => {
    res.status(201).json(dto.pacienteDto(await casos.registrarPaciente(req.repos, req.actor, req.body)));
  });

  rutas.get('/:id', gestionar, async (req, res) => {
    res.json(dto.pacienteDto(await casos.obtenerPaciente(req.repos, req.params.id)));
  });

  rutas.patch('/:id', gestionar, async (req, res) => {
    res.json(dto.pacienteDto(await casos.actualizarPaciente(req.repos, req.actor, req.params.id, req.body)));
  });

  rutas.post('/:id/archivar', autorizar(PERMISOS.ARCHIVAR_PACIENTES), async (req, res) => {
    res.json(dto.pacienteDto(await casos.archivarPaciente(req.repos, req.actor, req.params.id, req.body)));
  });

  rutas.get('/:id/historial', verClinico, async (req, res) => {
    res.json(dto.historialCompletoDto(await casos.obtenerHistorialCompleto(req.repos, req.params.id)));
  });

  rutas.get('/:id/alergias', verClinico, async (req, res) => {
    res.json((await casos.listarAlergias(req.repos, req.params.id)).map(dto.alergiaDto));
  });

  rutas.post('/:id/alergias', registrarClinico, async (req, res) => {
    res.status(201).json(dto.alergiaDto(await casos.agregarAlergia(req.repos, req.actor, req.params.id, req.body)));
  });

  rutas.post('/:id/antecedentes', registrarClinico, async (req, res) => {
    res.status(201).json(dto.antecedenteDto(await casos.agregarAntecedente(req.repos, req.actor, req.params.id, req.body)));
  });

  return rutas;
}

module.exports = { crearRutasPacientes };
