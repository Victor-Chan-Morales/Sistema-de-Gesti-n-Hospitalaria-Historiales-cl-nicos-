const { Router } = require('express');
const casos = require('../../../application/citas');
const { citaDto } = require('../../../dto/respuestas');
const { PERMISOS } = require('../../../domain/roles');
const { autorizar } = require('../middlewares');

function crearRutasCitas() {
  const rutas = Router();
  rutas.use(autorizar(PERMISOS.GESTIONAR_PACIENTES_Y_CITAS));

  rutas.get('/', async (req, res) => {
    res.json((await casos.listarCitas(req.repos, req.query)).map(citaDto));
  });

  rutas.post('/', async (req, res) => {
    res.status(201).json(citaDto(await casos.crearCita(req.repos, req.actor, req.body)));
  });

  rutas.get('/:id', async (req, res) => {
    res.json(citaDto(await casos.obtenerCita(req.repos, req.params.id)));
  });

  rutas.patch('/:id', async (req, res) => {
    res.json(citaDto(await casos.actualizarCita(req.repos, req.actor, req.params.id, req.body)));
  });

  return rutas;
}

module.exports = { crearRutasCitas };
