// Puertos de seguridad. Mantienen bcrypt y jsonwebtoken fuera de los casos de uso.
//
// ServicioCredenciales
//   hashear(contrasena)              => Promise<string>
//   comparar(contrasena, hash)       => Promise<boolean>
//   hashFicticio                     => hash válido para igualar tiempos de respuesta
//
// ServicioTokens
//   emitir({ id_usuario, id_institucion, rol }) => string
//   verificar(token)                 => actor; lanza NoAutorizado si no es válido
//
// Los implementan los módulos de adapters/seguridad/.

module.exports = {};
