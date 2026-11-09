# Requisitos

Requisitos funcionales y no funcionales del sistema, según el enunciado del proyecto (`Proyecto final bases II (1).pdf`) y la Entrega I. La última columna indica dónde se cumple cada uno.

## Restricciones del enunciado

| Restricción | Cumplimiento |
|---|---|
| Cada institución usa un motor distinto, sin repetir | Hospital: PostgreSQL; Clínica: MySQL; Laboratorio: MongoDB; Pediátrico: Firebase |
| Al menos cuatro motores, ninguno ligero (SQLite, Realm, LiteDB) | Los cuatro anteriores, levantados con `docker compose` |
| Asignación justificada por escrito | [`08-comparativo.md`](08-comparativo.md) |
| Arquitectura hexagonal como base común | `backend/src/domain`, `application/ports`, `adapters`; `tests/arquitectura.test.js` |

## Requisitos funcionales

| # | Requisito | Dónde se cumple |
|---|---|---|
| RF1 | Iniciar sesión y dirigir las operaciones del usuario al motor de su institución | JWT con `id_institucion`; `factory/repositoryFactory.js` |
| RF2 | Registrar un paciente nuevo y abrir su historial clínico | `POST /api/pacientes`; vista Pacientes → Registrar paciente |
| RF3 | Buscar pacientes y ver sus datos | `GET /api/pacientes`; vista Pacientes |
| RF4 | Actualizar los datos de un paciente | `PATCH /api/pacientes/:id`; detalle del paciente |
| RF5 | Dar de baja a un paciente (archivo o inactivación) con su motivo, sin borrar datos | `POST /api/pacientes/:id/archivar`; botón Dar de baja |
| RF6 | Programar, reprogramar, cancelar y marcar como no asistida una cita | `/api/citas`; vista Citas |
| RF7 | Registrar una consulta completa (signos, diagnósticos, tratamientos y receta) como una sola unidad | `POST /api/consultas` (transacción en los cuatro motores) |
| RF8 | Agregar diagnósticos, tratamientos y recetas a una consulta existente | `POST /api/consultas/:id/{diagnosticos,tratamientos,recetas}` |
| RF9 | Finalizar o anular una consulta | `PATCH /api/consultas/:id/estado` |
| RF10 | Consultar el historial completo: alergias, antecedentes y consultas | `GET /api/pacientes/:id/historial`; vista Historial |
| RF11 | Registrar alergias y antecedentes | `/api/pacientes/:id/{alergias,antecedentes}` |
| RF12 | Laboratorio: órdenes de examen y resultados con estructura variable según el tipo de examen | `/api/laboratorio`; vista Laboratorio |
| RF13 | Pediátrico: controles de crecimiento y esquema de vacunación | `/api/pediatria`; vista Pediátrico |
| RF14 | Avisar si un medicamento recetado se relaciona con una alergia del paciente | Regla 10 en [`02-reglas-negocio.md`](02-reglas-negocio.md) |

## Requisitos no funcionales

| # | Requisito | Dónde se cumple |
|---|---|---|
| RNF1 | La interfaz no cambia según el motor activo | Un solo contrato JSON (DTO) por recurso; un solo tema visual ([`10-frontend.md`](10-frontend.md)) |
| RNF2 | Las consultas funcionan de forma equivalente en los cuatro motores | `npm run test:integracion` (suite de contrato y equivalencia) |
| RNF3 | Consistencia: una consulta no queda guardada a medias | `BEGIN/COMMIT/ROLLBACK` en SQL, transacciones multidocumento en MongoDB y `runTransaction` en Firestore |
| RNF4 | Seguridad: autenticación, permisos por rol y aislamiento por institución | JWT, bcrypt, middleware `autorizar`; [`07-seguridad.md`](07-seguridad.md) |
| RNF5 | Clasificación de la información (pública, confidencial y restringida) | Entrega I y [`07-seguridad.md`](07-seguridad.md) |
| RNF6 | Sin envíos duplicados en los POST | Middleware de doble envío y verificación dentro de la transacción |
| RNF7 | Trazabilidad: quién hizo cada cambio y cuándo | Tabla o colección `Auditoria`, escrita en la misma transacción |
| RNF8 | Credenciales fuera del repositorio | `.env` (ignorado); solo se sube `.env.example` |
| RNF9 | Modelo documental justificado (qué se embebe y qué se referencia) | [`04-modelo-documental.md`](04-modelo-documental.md) |
