const { Router } = require('express');
const { iniciarSesion, obtenerPerfil } = require('../../../application/autenticacion');
const { usuarioDto } = require('../../../dto/respuestas');

function crearRutasAutenticacion({ listarInstituciones, credenciales, tokens, autenticar }) {
  const rutas = Router();

  rutas.post('/login', async (req, res) => {
    const { token, usuario } = await iniciarSesion(
      {
        // Solo participan los motores implementados: uno pendiente no es un motor caído.
        instituciones: listarInstituciones().filter((i) => i.implementado),
        credenciales,
        tokens,
      },
      req.body,
    );
    res.json({ token, usuario: usuarioDto(usuario) });
  });

  rutas.get('/yo', autenticar, async (req, res) => {
    res.json(usuarioDto(await obtenerPerfil(req.repos, req.actor)));
  });

  return rutas;
}

module.exports = { crearRutasAutenticacion };
