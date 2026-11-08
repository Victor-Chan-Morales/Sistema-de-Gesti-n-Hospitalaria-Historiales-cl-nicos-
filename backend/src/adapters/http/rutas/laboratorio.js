const { Router } = require('express');
const casos = require('../../../application/laboratorio');
const { tipoExamenDto, ordenLaboratorioDto } = require('../../../dto/respuestas');
const { PERMISOS } = require('../../../domain/roles');
const { autorizar } = require('../middlewares');

function crearRutasLaboratorio() {
  const rutas = Router();
  const ver = autorizar(PERMISOS.VER_HISTORIAL_CLINICO);
  const registrar = autorizar(PERMISOS.REGISTRAR_DATOS_CLINICOS);

  rutas.get('/tipos-examen', ver, async (req, res) => {
    res.json((await casos.listarTipos(req.repos, req.query)).map(tipoExamenDto));
  });

  rutas.post('/ordenes', registrar, async (req, res) => {
    res.status(201).json(ordenLaboratorioDto(await casos.crearOrden(req.repos, req.actor, req.body)));
  });

  rutas.get('/ordenes', ver, async (req, res) => {
    res.json((await casos.listarOrdenes(req.repos, req.query)).map(ordenLaboratorioDto));
  });

  rutas.get('/ordenes/:id', ver, async (req, res) => {
    res.json(ordenLaboratorioDto(await casos.obtenerOrden(req.repos, req.params.id)));
  });

  rutas.patch('/ordenes/:id/estado', registrar, async (req, res) => {
    res.json(ordenLaboratorioDto(await casos.cambiarEstadoOrden(req.repos, req.actor, req.params.id, req.body)));
  });

  rutas.post('/ordenes/:id/resultados', registrar, async (req, res) => {
    res.status(201).json(ordenLaboratorioDto(await casos.registrarResultado(req.repos, req.actor, req.params.id, req.body)));
  });

  return rutas;
}

module.exports = { crearRutasLaboratorio };
