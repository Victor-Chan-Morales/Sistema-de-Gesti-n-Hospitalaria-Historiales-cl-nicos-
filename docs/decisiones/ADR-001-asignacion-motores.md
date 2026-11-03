# ADR-001: Asignación de motores

**Estado:** aceptada (Entrega I). La justificación de MongoDB y Firebase la amplía el Integrante B en `docs/04-modelo-documental.md` y `docs/08-comparativo.md`.

## Contexto

El enunciado exige que cada institución use un motor distinto, elegido entre PostgreSQL, MySQL, MongoDB y Firebase, y que la asignación se justifique según el volumen de datos, la estructura de la información y la necesidad de transacciones estrictas.

## Decisión

| Institución | Motor | Justificación |
|---|---|---|
| Hospital General | PostgreSQL | Requiere control estricto de citas, diagnósticos y tratamientos, con integridad transaccional fuerte: no puede perderse un diagnóstico a medias. |
| Clínica Odontológica | MySQL | Información estructurada y procesos simples. No tiene personal técnico propio, así que le conviene un motor fácil de administrar y muy utilizado. |
| Laboratorio Clínico | MongoDB | La estructura de los resultados varía según el tipo de examen, lo que favorece un esquema flexible. |
| Centro Médico Pediátrico | Firebase | Consultas frecuentes, rápidas y centradas en el seguimiento de cada paciente. |

## Consecuencias

- La relación institución-motor vive en `backend/src/config/instituciones.js`. Se puede cambiar por configuración con `MOTOR_INSTITUCION_n`, sin tocar la lógica de negocio.
- Cada institución es dueña de sus usuarios, así que no existe una base central de cuentas. Ver [ADR-002](ADR-002-login-entre-motores.md).
- Los IDs son strings opacos en todo el contrato, porque cada motor los genera con un formato distinto.
