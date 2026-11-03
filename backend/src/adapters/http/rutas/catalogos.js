const { Router } = require('express');
const dto = require('../../../dto/respuestas');

function crearRutasCatalogos() {
  const rutas = Router();

  rutas.get('/diagnosticos', async (req, res) => {
    const texto = typeof req.query.texto === 'string' ? req.query.texto.trim() || undefined : undefined;
    res.json((await req.repos.catalogos.diagnosticos({ texto })).map(dto.catalogoDiagnosticoDto));
  });

  rutas.get('/medicamentos', async (req, res) => {
    res.json((await req.repos.catalogos.medicamentos()).map(dto.medicamentoDto));
  });

  rutas.get('/alergias', async (req, res) => {
    res.json((await req.repos.catalogos.alergias()).map(dto.catalogoAlergiaDto));
  });

  rutas.get('/profesionales', async (req, res) => {
    res.json((await req.repos.usuarios.listarProfesionales()).map(dto.profesionalDto));
  });

  return rutas;
}

module.exports = { crearRutasCatalogos };
