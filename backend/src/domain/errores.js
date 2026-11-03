// Errores del dominio. No conocen HTTP ni ningún motor: el adaptador HTTP los
// traduce a códigos de estado y cada adaptador de persistencia traduce a ellos
// los errores de su driver.

class ErrorDominio extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.name = new.target.name;
    this.codigo = codigo;
  }
}

class DatosInvalidos extends ErrorDominio {
  constructor(mensaje) {
    super(mensaje, 'DATOS_INVALIDOS');
  }
}

class ReglaNegocio extends ErrorDominio {
  constructor(mensaje) {
    super(mensaje, 'REGLA_NEGOCIO');
  }
}

class NoEncontrado extends ErrorDominio {
  constructor(mensaje = 'El registro solicitado no existe.') {
    super(mensaje, 'NO_ENCONTRADO');
  }
}

class RegistroDuplicado extends ErrorDominio {
  constructor(mensaje = 'El registro ya existe.', codigo = 'REGISTRO_DUPLICADO') {
    super(mensaje, codigo);
  }
}

class ConsultaDuplicada extends RegistroDuplicado {
  constructor(mensaje = 'Ya se registró una consulta idéntica hace un momento.') {
    super(mensaje, 'CONSULTA_DUPLICADA');
  }
}

class MotorNoDisponible extends ErrorDominio {
  constructor(institucion = 'la institución') {
    super(`Servicio de ${institucion} temporalmente no disponible.`, 'MOTOR_NO_DISPONIBLE');
  }
}

class NoAutorizado extends ErrorDominio {
  constructor(mensaje = 'Credenciales inválidas.') {
    super(mensaje, 'NO_AUTORIZADO');
  }
}

class Prohibido extends ErrorDominio {
  constructor(mensaje = 'Tu rol no tiene permiso para realizar esta acción.') {
    super(mensaje, 'PROHIBIDO');
  }
}

module.exports = {
  ErrorDominio,
  DatosInvalidos,
  ReglaNegocio,
  NoEncontrado,
  RegistroDuplicado,
  ConsultaDuplicada,
  MotorNoDisponible,
  NoAutorizado,
  Prohibido,
};
