# Reglas de negocio

Las reglas viven en `backend/src/domain/reglas.js`, son iguales para los cuatro motores y no consultan ninguna base de datos. Los números corresponden a la sección de reglas de la Entrega I.

| Regla | Comportamiento | Dónde se aplica |
|---|---|---|
| 5 | Una cita pasa a `Atendida` al registrar su consulta, en la misma transacción | Adaptador |
| 7, 8, 9 | Una consulta admite varios diagnósticos, tratamientos y recetas | Adaptador |
| 10 | Al recetar, la respuesta incluye `advertencias` si hay alergias relacionadas. Avisa, pero no bloquea: la decisión es del profesional | `detectarAlergiasRelacionadas` |
| 12 | Un menor de 18 años requiere al menos un representante | `exigirRepresentanteSiEsMenor` |
| 13, 14, 15 | Acceso según rol e institución | `domain/roles.js` y middleware `autorizar` |
| 21 | No hay borrado físico: archivar exige motivo y cierra el historial en la misma transacción | `exigirPacienteArchivable` y adaptador |
| 22 | Autor y fecha salen del token y quedan en `Auditoria`, dentro de la misma transacción | Adaptador |

## Reglas adicionales

- Un paciente `Archivado` o `Inactivo` no recibe citas nuevas (propuesta, punto 5) ni datos clínicos nuevos.
- Una cita solo se asigna a un profesional de salud activo y no puede estar en el pasado.
- Una cita `Atendida`, `Cancelada` o `No Asistió` ya no se puede modificar.
- Estados de la consulta: `Abierta` puede pasar a `Finalizada` o `Anulada`, y `Finalizada` a `Anulada`. A una consulta anulada no se le agregan datos.
- Una receta debe incluir al menos un medicamento.

## Eliminación lógica

El "CRUD completo" de la rúbrica se cumple sin borrar datos clínicos: el paciente se archiva, la cita se cancela y la consulta se anula.

## Envíos duplicados

Hay dos niveles de protección:

1. **Middleware HTTP (`crearEvitarEnvioDoble`):** rechaza con 409 un POST idéntico del mismo usuario durante 5 segundos. Un envío fallido se puede reintentar de inmediato. Su memoria es de un solo proceso.
2. **Dentro de la transacción del adaptador:** una consulta idéntica en un margen de 30 segundos, o una cita programada idéntica, produce 409. En SQL se bloquea la fila del historial o del paciente con `SELECT ... FOR UPDATE`, de modo que dos envíos simultáneos no pasan ambos.
