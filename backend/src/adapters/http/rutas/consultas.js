const { Router } = require('express');
const casos = require('../../../application/consultas');
const { consultaDto } = require('../../../dto/respuestas');
const { PERMISOS } = require('../../../domain/roles');
const { autorizar } = require('../middlewares');

const conAdvertencias = ({ consulta, advertencias }) => ({
  consulta: consultaDto(consulta),
  advertencias,
});

function crearRutasConsultas() {
  const rutas = Router();
  const registrar = autorizar(PERMISOS.REGISTRAR_DATOS_CLINICOS);

  rutas.post('/', registrar, async (req, res) => {
    res.status(201).json(conAdvertencias(await casos.registrarAtencion(req.repos, req.actor, req.body)));
  });

  rutas.get('/:id', autorizar(PERMISOS.VER_HISTORIAL_CLINICO), async (req, res) => {
    res.json(consultaDto(await casos.obtenerConsulta(req.repos, req.params.id)));
  });

  rutas.patch('/:id/estado', registrar, async (req, res) => {
    res.json(consultaDto(await casos.cambiarEstadoConsulta(req.repos, req.actor, req.params.id, req.body)));
  });

  rutas.post('/:id/diagnosticos', registrar, async (req, res) => {
    res.status(201).json(consultaDto(await casos.agregarDiagnostico(req.repos, req.actor, req.params.id, req.body)));
  });

  rutas.post('/:id/tratamientos', registrar, async (req, res) => {
    res.status(201).json(consultaDto(await casos.agregarTratamiento(req.repos, req.actor, req.params.id, req.body)));
  });

  rutas.post('/:id/recetas', registrar, async (req, res) => {
    res.status(201).json(conAdvertencias(await casos.agregarReceta(req.repos, req.actor, req.params.id, req.body)));
  });

  return rutas;
}

module.exports = { crearRutasConsultas };
