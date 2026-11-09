# Contratos de la API

El contrato completo está en [`openapi.yaml`](openapi.yaml). Con el servidor en marcha, se puede explorar y probar en `http://localhost:3000/api/docs`.

## Convenciones

- **Autenticación:** `Authorization: Bearer <token>`, obtenido con `POST /api/auth/login`. El token dura 8 horas.
- **Institución:** sale siempre del token, nunca de la URL ni del cuerpo.
- **IDs:** strings opacos. No deben tratarse como números, porque cada motor los genera con un formato distinto.
- **Fechas:** `YYYY-MM-DD`. **Fecha y hora:** `YYYY-MM-DDTHH:MM:SS`, en hora local, sin zona horaria.
- **Campos sin valor:** siempre presentes, con `null`. Las colecciones vacías son `[]`.
- **Autor de un registro:** sale del token; si se envía en el cuerpo, se ignora.

## Errores

Todas las respuestas de error tienen la misma forma, y `mensaje` está listo para mostrarse al usuario:

```json
{ "codigo": "MOTOR_NO_DISPONIBLE", "mensaje": "Servicio de Clínica Odontológica temporalmente no disponible." }
```

| Estado | `codigo` | Cuándo |
|---|---|---|
| 400 | `DATOS_INVALIDOS` | Falta un campo, el formato es incorrecto o hace referencia a un registro inexistente |
| 401 | `NO_AUTORIZADO` | Sin sesión, sesión expirada o credenciales inválidas |
| 403 | `PROHIBIDO` | El rol no tiene permiso |
| 404 | `NO_ENCONTRADO` | El registro no existe |
| 409 | `REGISTRO_DUPLICADO`, `CONSULTA_DUPLICADA` | Doble envío o dato único repetido |
| 422 | `REGLA_NEGOCIO` | La operación incumple una regla, por ejemplo una cita para un paciente archivado |
| 503 | `MOTOR_NO_DISPONIBLE` | El motor de la institución no responde |
| 500 | `ERROR_INTERNO` | Error inesperado; el detalle queda solo en el log del servidor |

## Endpoints

| Método y ruta | Descripción | Permiso |
|---|---|---|
| `POST /api/auth/login` | Inicia sesión | Público |
| `GET /api/auth/yo` | Perfil de la sesión | Sesión |
| `GET, POST /api/pacientes` | Busca o registra pacientes | Pacientes y citas |
| `GET, PATCH /api/pacientes/:id` | Lee o actualiza un paciente | Pacientes y citas |
| `POST /api/pacientes/:id/archivar` | Da de baja al paciente | Archivar |
| `GET /api/pacientes/:id/historial` | Historial clínico completo | Ver clínico |
| `GET, POST /api/pacientes/:id/alergias` | Lista o agrega alergias | Ver clínico / Registrar clínico |
| `POST /api/pacientes/:id/antecedentes` | Agrega un antecedente | Registrar clínico |
| `GET, POST /api/citas` | Lista o programa citas | Pacientes y citas |
| `GET, PATCH /api/citas/:id` | Lee, reprograma o cancela | Pacientes y citas |
| `POST /api/consultas` | Registra la atención completa, de forma atómica | Registrar clínico |
| `GET /api/consultas/:id` | Consulta con su detalle | Ver clínico |
| `PATCH /api/consultas/:id/estado` | Finaliza o anula | Registrar clínico |
| `POST /api/consultas/:id/diagnosticos` | Agrega un diagnóstico | Registrar clínico |
| `POST /api/consultas/:id/tratamientos` | Agrega un tratamiento | Registrar clínico |
| `POST /api/consultas/:id/recetas` | Agrega una receta | Registrar clínico |
| `GET /api/catalogos/{diagnosticos, medicamentos, alergias, profesionales}` | Catálogos | Sesión |
| `GET /api/laboratorio/tipos-examen` | Tipos de examen del laboratorio | Ver clínico |
| `GET, POST /api/laboratorio/ordenes` | Lista o crea órdenes de examen | Ver clínico / Registrar clínico |
| `GET /api/laboratorio/ordenes/:id` | Orden con sus resultados | Ver clínico |
| `PATCH /api/laboratorio/ordenes/:id/estado` | Avanza o cancela la orden | Registrar clínico |
| `POST /api/laboratorio/ordenes/:id/resultados` | Carga el resultado de un examen | Registrar clínico |
| `GET /api/pediatria/vacunas` | Catálogo de vacunas | Ver clínico |
| `GET, POST /api/pediatria/pacientes/:id/controles` | Controles de crecimiento | Ver clínico / Registrar clínico |
| `GET, POST /api/pediatria/pacientes/:id/vacunas` | Dosis aplicadas | Ver clínico / Registrar clínico |
| `GET /health`, `GET /health/motores` | Estado del servidor y de cada motor | Público |

La matriz de permisos por rol está en [`07-seguridad.md`](07-seguridad.md).
