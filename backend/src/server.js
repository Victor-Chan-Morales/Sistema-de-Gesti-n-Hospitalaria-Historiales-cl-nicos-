const { exigirConfiguracion } = require('./config/env');

exigirConfiguracion();

const { crearApp } = require('./app');
const { obtenerRepositorio, listarInstituciones, cerrarConexiones } = require('./factory/repositoryFactory');
const credenciales = require('./adapters/seguridad/credencialesBcrypt');
const { crearServicioTokens } = require('./adapters/seguridad/tokensJwt');

const app = crearApp({
  obtenerRepositorio,
  listarInstituciones,
  credenciales,
  tokens: crearServicioTokens(process.env.JWT_SECRET),
});

const PORT = process.env.PORT || 3000;

const servidor = app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});

function apagar() {
  servidor.close(async () => {
    await cerrarConexiones();
    process.exit(0);
  });
}

process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
