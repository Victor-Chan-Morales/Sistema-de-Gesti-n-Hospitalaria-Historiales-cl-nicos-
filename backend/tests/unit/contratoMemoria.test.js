const { ejecutarSuiteContrato } = require('../contrato/suiteRepositorio');
const { crearRepoMemoria } = require('./apoyo/repoMemoria');

ejecutarSuiteContrato('memoria', {
  crearRepos: () => crearRepoMemoria(),
  idInstitucion: 1,
  usuarioAdministrador: 'admin.prueba',
  usuarioProfesional: 'medico.prueba',
});
