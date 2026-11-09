const { Router } = require('express');
const casos = require('../../../application/pediatria');
const { vacunaDto, controlCrecimientoDto, registroVacunaDto } = require('../../../dto/respuestas');
const { PERMISOS } = require('../../../domain/roles');
const { autorizar } = require('../middlewares');

function crearRutasPediatria() {
  const rutas = Router();
  const ver = autorizar(PERMISOS.VER_HISTORIAL_CLINICO);
  const registrar = autorizar(PERMISOS.REGISTRAR_DATOS_CLINICOS);

  rutas.get('/vacunas', ver, async (req, res) => {
    res.json((await casos.listarVacunas(req.repos)).map(vacunaDto));
  });

  rutas.get('/pacientes/:id/controles', ver, async (req, res) => {
    res.json((await casos.listarControles(req.repos, req.params.id)).map(controlCrecimientoDto));
  });

  rutas.post('/pacientes/:id/controles', registrar, async (req, res) => {
    res.status(201).json(controlCrecimientoDto(await casos.agregarControl(req.repos, req.actor, req.params.id, req.body)));
  });

  rutas.get('/pacientes/:id/vacunas', ver, async (req, res) => {
    res.json((await casos.listarRegistroVacunas(req.repos, req.params.id)).map(registroVacunaDto));
  });

  rutas.post('/pacientes/:id/vacunas', registrar, async (req, res) => {
    res.status(201).json(registroVacunaDto(await casos.registrarVacuna(req.repos, req.actor, req.params.id, req.body)));
  });

  return rutas;
}

module.exports = { crearRutasPediatria };
