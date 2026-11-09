# Seguridad

## Autenticación

- Contraseñas con bcrypt, costo 10. El hash nunca sale del backend: los DTOs eligen sus campos de forma explícita.
- JWT firmado con HS256 y algoritmo fijado al verificar. Claims: `sub` (id_usuario), `id_institucion` y `rol`. Expira en 8 horas.
- El servidor no arranca si `JWT_SECRET` falta o tiene menos de 32 caracteres.
- El login responde igual, y tarda lo mismo, si el usuario no existe o si la contraseña es incorrecta ([ADR-002](decisiones/ADR-002-login-entre-motores.md)).

## Aislamiento entre instituciones

La institución se obtiene únicamente del token firmado, y el Factory devuelve el repositorio de ese motor. No existe ningún parámetro en la URL o el cuerpo que permita dirigir una petición a otra institución.

## Control de acceso por roles

Se define en `backend/src/domain/roles.js` y se aplica con el middleware `autorizar`.

| Acción | Administrador | Secretaria | Médico / Odontólogo / Laboratorista |
|---|---|---|---|
| Pacientes y citas (crear, ver, editar) | Sí | Sí | Sí |
| Archivar paciente | Sí | No | Sí |
| Ver historial clínico | No | No | Sí |
| Registrar consulta, diagnóstico, tratamiento, receta, alergia o antecedente | No | No | Sí |

Un pediatra es un usuario con rol `Médico` en el Centro Pediátrico: el esquema no tiene un rol `Pediatra`.

**Pendiente de acordar con el Integrante B:** qué hace `Laboratorista` en el flujo de consultas, ya que el laboratorio trabaja con órdenes y resultados.

## Clasificación de la información

Según la Entrega I:

| Nivel | Ejemplos | Protección |
|---|---|---|
| Pública | Institución, catálogo de medicamentos | Requiere sesión en esta versión |
| Confidencial | Datos de contacto del paciente, citas | Permiso de pacientes y citas |
| Restringida | Historial, consultas, diagnósticos, tratamientos, recetas | Solo profesionales de salud |
| Restringida | `contrasena_hash` | Nunca sale del backend |

## Otras medidas

- Consultas SQL parametrizadas. Los nombres de tabla y columna son siempre constantes del código, nunca datos de entrada.
- Los campos de entrada se filtran según esquemas, así que un cliente no puede cambiar `estado` ni el autor de un registro.
- Los errores inesperados no exponen detalles al cliente.
- Las credenciales van en `.env`, que está en `.gitignore`.
- `Auditoria` registra quién y cuándo hizo cada escritura, dentro de la misma transacción.

## Limitaciones conocidas

- El login no limita los intentos fallidos. Es una decisión de alcance de esta entrega: no se implementa.
- Un token sigue siendo válido hasta que expira, aunque el usuario se desactive. Decisión de alcance: no se implementa revocación en esta entrega.
- El frontend y la API corren sobre HTTP en desarrollo. En un despliegue real requieren HTTPS.
