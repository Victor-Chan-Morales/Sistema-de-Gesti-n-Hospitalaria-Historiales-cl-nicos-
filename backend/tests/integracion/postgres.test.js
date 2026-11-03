// Requiere: docker compose up -d postgres && npm run seed
require('../../src/config/env');
const { ejecutarSuiteContrato } = require('../contrato/suiteRepositorio');
const { crearAdaptador } = require('../../src/adapters/persistence/postgres');

ejecutarSuiteContrato('PostgreSQL', {
  crearRepos: () => crearAdaptador('Hospital General'),
  idInstitucion: 1,
  usuarioAdministrador: 'admin.hospital',
  usuarioProfesional: 'medico.hospital',
});
