// Requiere: docker compose up -d mysql && npm run seed
require('../../src/config/env');
const { ejecutarSuiteContrato } = require('../contrato/suiteRepositorio');
const { crearAdaptador } = require('../../src/adapters/persistence/mysql');

ejecutarSuiteContrato('MySQL', {
  crearRepos: () => crearAdaptador('Clínica Odontológica'),
  idInstitucion: 2,
  usuarioAdministrador: 'admin.clinica',
  usuarioProfesional: 'odontologo.clinica',
});
