# Modelo relacional

Scripts: `backend/db/postgres/01-hospital_general.sql` y `backend/db/mysql/01-clinica_odontologica.sql`. Docker los ejecuta solo al crear un volumen nuevo.

Ambos comparten una sección común con las mismas columnas. Después, cada uno agrega las tablas de su institución: `Especialidad_Medica`, `Habitacion` y `Hospitalizacion` en el hospital; `Odontograma`, `Pieza_Dental` y `Procedimiento_Odontologico` en la clínica.

## Correcciones respecto a la Entrega I

| Cambio | Motivo |
|---|---|
| Nueva tabla `Auditoria` en ambos motores | La regla 22 exige asociar cada modificación importante a un usuario y una fecha. Tablas como `Tratamiento`, `Receta` y `Paciente` no lo registraban |
| `SET NAMES utf8mb4` al inicio del script de MySQL | Sin esto, el cliente de inicialización corrompía los `ENUM` con acentos: `Médico` quedaba como `MÃ©dico` y las inserciones fallaban |

## Diferencias de dialecto

| Aspecto | PostgreSQL | MySQL |
|---|---|---|
| Autoincremento | `SERIAL` | `INT AUTO_INCREMENT` |
| Dominios | `VARCHAR(n) CHECK (col IN (...))` | `ENUM(...)` |
| Fecha y hora | `TIMESTAMP` | `DATETIME` |
| Claves foráneas | `REFERENCES` en línea | `FOREIGN KEY` al final de la tabla |
| Marcadores | `$1, $2` | `?` |
| ID generado | `RETURNING` | `insertId` |
| Comparar con NULL | `IS NOT DISTINCT FROM` | `<=>` |
| Búsqueda sin distinguir mayúsculas | `ILIKE` | `LIKE` con la intercalación por defecto |
| Pertenencia a una lista | `= ANY($1)` | `IN (?)` |

Una diferencia visible: la búsqueda de MySQL tampoco distingue acentos, y la de PostgreSQL sí (`Perez` no encuentra `Pérez`).

## Consistencia

Cada escritura corre dentro de `BEGIN/COMMIT`, con `ROLLBACK` ante cualquier error, e incluye su registro de auditoría. `consultas.registrarAtencion` guarda como una unidad la consulta, los signos, los diagnósticos, los tratamientos, la receta, el cambio de estado de la cita y la auditoría.

Una diferencia importante de aislamiento: PostgreSQL usa `READ COMMITTED` y MySQL `REPEATABLE READ`. La verificación de duplicados funciona en ambos porque el primer paso de la transacción es la lectura con bloqueo: en MySQL, la instantánea de lectura se crea en la primera lectura sin bloqueo, es decir, después de obtener el bloqueo. Lo comprueba la prueba de envíos simultáneos de la suite de contrato.

## Normalización de tipos

| Tipo | Por defecto | Contrato |
|---|---|---|
| `DATE` | `pg` lo convierte a `Date`, con riesgo de cambiar de día por zona horaria | String `YYYY-MM-DD` (type parser en `pg`, `dateStrings` en `mysql2`) |
| `TIMESTAMP` / `DATETIME` | Distinto en cada driver | String `YYYY-MM-DDTHH:MM:SS` |
| `NUMERIC` / `DECIMAL` | String en ambos | Number (type parser en `pg`, `decimalNumbers` en `mysql2`) |
| IDs enteros | Number | String |
