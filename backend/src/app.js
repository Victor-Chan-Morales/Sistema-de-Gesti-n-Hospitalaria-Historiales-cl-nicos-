const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');

const { crearAutenticar, crearEvitarEnvioDoble } = require('./adapters/http/middlewares');
const { manejarErrores, rutaNoEncontrada } = require('./adapters/http/errores');
const { crearRutasAutenticacion } = require('./adapters/http/rutas/autenticacion');
const { crearRutasPacientes } = require('./adapters/http/rutas/pacientes');
const { crearRutasCitas } = require('./adapters/http/rutas/citas');
const { crearRutasConsultas } = require('./adapters/http/rutas/consultas');
const { crearRutasCatalogos } = require('./adapters/http/rutas/catalogos');

const RUTA_FRONTEND = path.resolve(__dirname, '../../frontend');
const RUTA_OPENAPI = path.resolve(__dirname, '../../docs/openapi.yaml');

// Crea la aplicación sin ponerla a escuchar. Recibe sus dependencias como parámetros
// para poder probarla con un repositorio en memoria.
function crearApp({ obtenerRepositorio, listarInstituciones, credenciales, tokens }) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const autenticar = crearAutenticar({ tokens, obtenerRepositorio });
  const evitarEnvioDoble = crearEvitarEnvioDoble();
  const protegido = [autenticar, evitarEnvioDoble];

  app.get('/health', (req, res) => res.json({ estado: 'ok' }));

  app.get('/health/motores', async (req, res) => {
    const motores = await Promise.all(listarInstituciones().map(async (i) => {
      const base = { id_institucion: i.id_institucion, nombre: i.nombre, motor: i.motor };
      if (!i.implementado) return { ...base, estado: 'no_implementado' };
      try {
        await i.repos.salud.verificar();
        return { ...base, estado: 'disponible' };
      } catch {
        return { ...base, estado: 'no_disponible' };
      }
    }));
    res.json({ motores });
  });

  app.use('/api/auth', crearRutasAutenticacion({ listarInstituciones, credenciales, tokens, autenticar }));
  app.use('/api/pacientes', protegido, crearRutasPacientes());
  app.use('/api/citas', protegido, crearRutasCitas());
  app.use('/api/consultas', protegido, crearRutasConsultas());
  app.use('/api/catalogos', protegido, crearRutasCatalogos());

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(YAML.parse(fs.readFileSync(RUTA_OPENAPI, 'utf8'))));
  app.use('/api', rutaNoEncontrada);

  // Mismo origen para frontend y API: no hace falta configurar CORS.
  app.use(express.static(RUTA_FRONTEND));
  app.use(rutaNoEncontrada);
  app.use(manejarErrores);

  return app;
}

module.exports = { crearApp };
