# Documento comparativo

Comparativo de los cuatro motores: por qué se asignó cada uno a su institución, cómo se modelaron los datos, cómo se garantiza la consistencia y cómo se aplica la seguridad. El modelo documental se detalla en [04-modelo-documental.md](04-modelo-documental.md) y la decisión de asignación en [ADR-001](decisiones/ADR-001-asignacion-motores.md).

## 1. Asignación de motores

| Institución | Motor | Por qué | Lo que se paga |
|---|---|---|---|
| Hospital General | PostgreSQL | Citas, diagnósticos y tratamientos con integridad estricta: no puede perderse un diagnóstico a medias. Claves foráneas, `CHECK` y transacciones ACID maduras | Esquema rígido: cambiar un campo exige migrar |
| Clínica Odontológica | MySQL | Información estructurada y procesos simples. Sin personal técnico propio, conviene un motor ampliamente conocido y fácil de administrar | Menos restricciones declarativas que PostgreSQL |
| Laboratorio Clínico | MongoDB | La estructura de un resultado cambia según el examen; un esquema flexible evita tablas por tipo o columnas casi siempre vacías. Los exámenes crecen sin límite por paciente | La integridad referencial pasa a la aplicación |
| Centro Médico Pediátrico | Firebase (Firestore) | Consultas frecuentes y rápidas centradas en cada niño: controles y vacunas cuelgan de su paciente y se leen de una vez | Sin búsqueda por subcadena ni índices únicos |

## 2. Cómo se modeló lo mismo en cada motor

| Concepto | PostgreSQL y MySQL | MongoDB | Firestore |
|---|---|---|---|
| Unidad de almacenamiento | Fila | Documento | Documento |
| Teléfonos y correos (multivaluados) | Tablas `Telefono_*` y `Correo_*` | Arreglo embebido | Arreglo embebido |
| Historial del paciente | Tabla con clave foránea | Colección propia, enlazada por `id_paciente` | Campo del documento del paciente |
| Detalle de la consulta | Cuatro tablas relacionadas | Embebido en la consulta | Embebido en la consulta |
| Crecimiento, vacunas, resultados | Fuera de alcance | Resultados en colección propia | Subcolecciones del paciente |
| ID | Entero autoincremental | `ObjectId` | Cadena de 20 caracteres |

Hacia el frontend todo es igual: el DTO convierte cada estructura al mismo JSON y los IDs son siempre strings opacos.

## 3. Consistencia

### Transacciones

El requisito: consulta, signos, diagnósticos, tratamientos, receta, cambio de la cita y auditoría se guardan como una unidad, o no se guarda nada.

| Motor | Mecanismo | Si algo falla |
|---|---|---|
| PostgreSQL, MySQL | `BEGIN` / `COMMIT` / `ROLLBACK` | `ROLLBACK`: no queda ninguna fila |
| MongoDB | Transacción multi-documento (`withTransaction`, replica set) | Se aborta: no queda ningún documento |
| Firestore | `runTransaction`: todas las lecturas y validaciones antes de escribir | Una referencia inválida se detecta antes de la primera escritura |

En los tres casos la auditoría (regla 22) se escribe dentro de la misma transacción que la operación que describe. En MongoDB, además, guardar un resultado y actualizar el estado de su orden es una transacción, para que nunca haya un resultado con la orden sin avanzar. Firestore también ofrece *batched writes*, pero no leen, y casi todas las operaciones necesitan comprobar algo antes de escribir (duplicados, referencias), por lo que se usan transacciones.

### Doble envío (idempotencia)

Hay dos defensas. La primera es un filtro del backend que rechaza un POST idéntico del mismo usuario durante unos segundos. Es memoria de un solo proceso, así que la garantía fuerte está en cada adaptador:

| Motor | Citas idénticas | Consultas idénticas |
|---|---|---|
| PostgreSQL, MySQL | `SELECT ... FOR UPDATE` sobre el paciente y comprobación | `FOR UPDATE` sobre el historial y comprobación en la ventana de 30 s |
| MongoDB | Índice único parcial (solo cita `Programada`) | Se escribe primero en el historial: el segundo envío choca, se reintenta y ve la consulta del primero |
| Firestore | Documento-clave `cita_…` creado en la transacción | Se escribe el documento del paciente: la transacción perdedora se reintenta y ve la consulta del primero |

### Unicidad e integridad referencial

| | PostgreSQL / MySQL | MongoDB | Firestore |
|---|---|---|---|
| Usuario y documento únicos | `UNIQUE` | Índice único (el de documento es parcial) | Documento-clave en `indices_unicos` |
| Referencia a un registro inexistente | Clave foránea | El adaptador lee el catálogo antes de guardar | El adaptador lee el documento dentro de la transacción |
| Alergia no repetida | Clave primaria compuesta | Filtro `$ne` en la actualización | ID del documento = ID de la sustancia |

Todos traducen el fallo al mismo error de dominio (`RegistroDuplicado`, `DatosInvalidos`), de modo que la API responde igual.

### Cómo se comprueba

Los cuatro motores pasan la misma suite de contrato (`backend/tests/contrato/suiteRepositorio.js`). Incluye atomicidad (un fallo en la receta no deja consulta ni diagnóstico), dos envíos simultáneos y los tipos de cada campo. Cada motor tiene además pruebas de sus funciones propias.

```bash
cd backend
npm run test:integracion
```

## 4. Seguridad

- **Aplicación, no base de datos:** la autenticación (JWT con `id_institucion` y `rol`) y el control de acceso por roles se aplican en el backend y son idénticos para los cuatro motores. Ver [07-seguridad.md](07-seguridad.md).
- **Aislamiento:** la institución sale del token, y el Factory entrega el adaptador de ese motor. Un usuario del laboratorio nunca llega a PostgreSQL.
- **Entradas:** los filtros se fuerzan a texto y las búsquedas escapan caracteres especiales, para que un valor enviado como objeto no se interprete como un operador de MongoDB.
- **Firestore:** `backend/db/firebase/firestore.rules` deniega todo acceso directo; solo el backend, con el SDK de administración, lee y escribe.
- **Credenciales:** en `.env`, nunca en el repositorio.

## 5. Disponibilidad

Si un motor no responde, solo su institución recibe un 503 con un mensaje legible; las demás siguen funcionando. MongoDB falla en 2 segundos (`serverSelectionTimeoutMS`) y, en Firebase, el adaptador comprueba la conexión con un límite de 2 segundos antes de operar, porque Firestore reintenta durante mucho tiempo sin avisar. `GET /health/motores` informa el estado de cada uno.

## 6. Cuándo conviene cada uno

| Necesidad | Motor |
|---|---|
| Integridad estricta y consultas relacionales complejas | PostgreSQL |
| Datos estructurados y operación sencilla | MySQL |
| Estructura que varía por registro y volumen que crece sin límite | MongoDB |
| Lecturas centradas en una entidad, escala administrada y tiempo real | Firestore |

## 7. Límites de la implementación

- **Firestore:** la búsqueda de pacientes por texto y los filtros combinados de citas se completan en memoria. Es razonable para un centro pediátrico; con decenas de miles de pacientes habría que añadir un campo de búsqueda indexado o un servicio de búsqueda.
- **Consultas dentro de Firestore y MongoDB:** el detalle de la consulta va embebido. Si una receta pudiera crecer a cientos de líneas, convendría separarla.
- **Login entre motores:** consulta todos los motores en paralelo ([ADR-002](decisiones/ADR-002-login-entre-motores.md)). Con cuatro motores el costo es bajo; con muchos habría que añadir un directorio de usuarios.
