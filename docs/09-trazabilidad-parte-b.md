# 09. Trazabilidad de la Parte B (MongoDB y Firebase)

Este documento responde una pregunta: ¿cada cosa que se implementó en la Parte B viene de un requisito
escrito, o es una decisión nuestra? Para cada una se indica de dónde sale y por qué se hizo así.

**Fuentes usadas:** `Proyecto Final BD - Red de hospitales.pdf` (Entrega I: entidades, reglas de negocio y
clasificación de la información), `Proyecto final bases II (1).pdf` (enunciado de la Entrega II),
`Propuesta de Proyecto - Entrega II.pdf` (reparto del equipo y consideraciones técnicas) y los documentos
de `docs/` (ADR-001, ADR-002, contratos de API, seguridad).

## 1. Laboratorio Clínico (MongoDB)

| Lo que pide el documento | Dónde lo pide | Cómo se implementó |
|---|---|---|
| Registrar órdenes y resultados con estructura variable según el examen | Entrega I, sección IV | Colecciones `ordenes_laboratorio` y `resultados_laboratorio`; `valores_detallados` es una lista libre de `{parametro, valor, unidad, rango_referencia}` |
| Orden con prioridad Normal, Urgente o Emergencia | Entidad Orden de laboratorio | Enum validado en `domain/laboratorio.js` |
| Orden con estado Pendiente, En proceso, Finalizada, Entregada o Cancelada | Entidad Orden de laboratorio | Enum validado; ver decisión D1 sobre las transiciones |
| Una orden incluye uno o varios tipos de examen | Regla 17 | Detalle de la orden con los exámenes; se rechazan listas vacías o con el mismo examen repetido |
| El resultado pertenece a una orden y a un paciente, y es de un examen de esa orden | Regla 16 | El resultado se guarda con el ID de la orden y del paciente; se valida que el examen forme parte de la orden |
| Los resultados varían según el tipo de examen | Regla 18 | `valores_detallados` sin estructura fija |
| Solo un profesional autorizado registra resultados; la secretaria no | Reglas 14 y 15 | Las rutas de registro exigen el permiso `registrar_datos_clinicos`, que la secretaria no tiene |
| Quedan registrados quién y cuándo modificó | Regla 22 | `id_usuario_solicitante` y `id_usuario_laboratorista` salen del token; hay auditoría de cada escritura |
| Catálogo de tipos de examen (nombre, descripción, tipo de muestra, estado) | Entidad Tipo de examen | Colección `tipos_examen`, cargada por el seeder, consultable en `GET /api/laboratorio/tipos-examen` |
| MongoDB con referenciación: colecciones separadas de Pacientes, Órdenes y Resultados | Propuesta, Integrante B | Ver `04-modelo-documental.md` |
| Transacciones multi-documento para mantener consistente una orden y su resultado | Propuesta, consideración 6 | Guardar un resultado y avanzar el estado de su orden ocurre en una sola transacción |

## 2. Centro Médico Pediátrico (Firebase)

| Lo que pide el documento | Dónde lo pide | Cómo se implementó |
|---|---|---|
| Seguimiento de crecimiento, peso, talla, vacunas | Entrega I, sección IV | Subcolecciones `controles_crecimiento` y `registro_vacunas` dentro del paciente |
| Control con fecha, peso, talla, perímetro cefálico, IMC, observaciones y consulta opcional | Entidad Control de crecimiento | Mismos campos; si no se manda el IMC se calcula como peso / talla² |
| Catálogo de vacunas con dosis requeridas y estado | Entidad Vacuna | Colección `vacunas`, cargada por el seeder, en `GET /api/pediatria/vacunas` |
| Registro de vacunación con dosis, fecha, lote, centro, próxima dosis y observaciones | Entidad Registro de vacunación | Mismos campos; `numero_dosis` es texto libre ("Primera", "Refuerzo") como en el documento |
| Un paciente pediátrico tiene varios controles y varios registros | Regla 19 | Subcolecciones sin límite de cantidad |
| Embebido con subcolecciones, no un documento gigante | Propuesta, Integrante B | Ver `04-modelo-documental.md` |
| Escrituras atómicas para que no queden datos a medias | Propuesta, consideraciones 2 y 6 | Ver decisión D5 |

## 3. Requisitos de la rúbrica que tocan la Parte B

| Requisito | Estado |
|---|---|
| Consultas equivalentes en los cuatro motores, misma estructura JSON | La misma suite de contrato valida los cuatro adaptadores. La comparación directa de JSON coincide entre los cuatro motores (P2) |
| Modelo documental justificado (embeber o referenciar) | Cumplido: `04-modelo-documental.md` |
| Documento comparativo por motor | Cumplido: `08-comparativo.md` |
| Enrutamiento por usuario según su institución | Cumplido: la fábrica del Integrante A ya registra los cuatro motores |
| Archivar pacientes y bloquear citas a archivados | Cumplido en ambos adaptadores, cubierto por la suite de contrato |
| Transacciones sin datos huérfanos | Verificado contra MongoDB Atlas y Firestore reales |
| Envíos duplicados simultáneos (idempotencia) | Verificado contra MongoDB Atlas y Firestore reales |
| Manejo de caída de un motor | Cumplido: con el motor apagado responde "servicio no disponible" (503) en pocos segundos |
| Seeders y reglas de seguridad | Cumplido: `npm run seed:nosql` y `backend/db/firebase/firestore.rules` |
| Contratos de API documentados | Cumplido: 8 rutas nuevas en `openapi.yaml` |

## 4. Decisiones que van más allá del documento

Estas cosas no están escritas en los requisitos. Se tomaron porque hacían falta para que el sistema funcione
de forma coherente.

| # | Decisión | Por qué hizo falta | Alternativa descartada |
|---|---|---|---|
| D1 | Una orden solo cambia de estado en un orden lógico (Pendiente → En proceso → Finalizada → Entregada; se puede Cancelar antes de finalizar), y no admite resultados si está finalizada, entregada o cancelada | El documento da los estados pero no el flujo. Sin esto se podrían cargar resultados a una orden cancelada, contra las reglas 15 y 16 | Dejar cualquier cambio de estado, lo que permite datos incoherentes |
| D2 | El seguimiento pediátrico solo acepta pacientes menores de 18 años y activos | El documento habla de "niños y adolescentes" y la regla 12 de "menores de edad". Se tomó 18 como mayoría de edad. Un paciente archivado no recibe atención nueva (consideración 5 de la propuesta) | No validar la edad |
| D3 | Si se llaman las rutas de laboratorio o pediatría desde otra institución, responden 422 con un mensaje claro | Las rutas están montadas para todas las instituciones, y sin esto se tendría un error genérico | Montar las rutas solo en la institución correspondiente |
| D4 | Los servicios propios usan puertos y rutas aparte (`/api/laboratorio`, `/api/pediatria`) y no se agregan al puerto común | El puerto común es el contrato único que implementan los cuatro motores. Meter funciones de una sola institución obligaría a los adaptadores relacionales a implementarlas. Lo decidió el equipo al elegir "puertos y rutas propios" | Ampliar el puerto común |
| D5 | Firebase usa transacciones (`runTransaction`) en vez de escrituras por lotes (`batched writes`) | Una transacción también garantiza todo o nada, y además permite leer antes de escribir. Se necesita para la idempotencia y para comprobar el estado del paciente sin carreras. Cumple lo que pedía la propuesta | Batched writes, que no permiten lecturas |
| D6 | En Firestore hay una colección `indices_unicos` con documentos marcadores | Firestore no tiene índices únicos. Es la forma de rechazar un documento repetido o un doble envío | Comprobar duplicados sin transacción, que falla con dos envíos simultáneos |
| D7 | En MongoDB el historial tiene un campo `version` que se incrementa en cada escritura | Hace que dos envíos simultáneos se ejecuten uno tras otro. El segundo ve al primero ya guardado y se detecta el duplicado (propuesta, consideración 7) | Confiar solo en índices, que no cubren la ventana de 30 segundos |
| D8 | Variable `ESPERA_MOTOR_MS` en `.env` | Con motores en la nube (Atlas, Firebase) la primera conexión tarda más de los 2 segundos de local | Dejar 2 segundos fijos, que daba falsos "servicio no disponible" |
| D9 | El Laboratorista tiene los mismos permisos clínicos que el médico, y el pediatra es un usuario con rol Médico en el Centro Pediátrico | La matriz de roles ya existía en la Parte A. El documento lista Laboratorista y Pediatra como actores | Crear un rol Pediatra aparte |
| D10 | El registro de vacunación en Firebase se identifica por vacuna, dosis y fecha de aplicación | Si solo contara vacuna y dosis, un refuerzo que se aplica más de una vez se rechazaría como duplicado. Con la fecha, el doble clic se sigue detectando y un refuerzo en otra fecha se admite | Identificar solo por vacuna y dosis |
| D11 | Si faltan las credenciales de Firebase (o el archivo no es legible), el adaptador responde "servicio no disponible" (503) desde la primera operación | Se comprobó que el SDK, en ese caso, deja una promesa rechazada sin atender que puede tumbar el servidor, y devuelve un error que no se traduce a 503 | Dejar que el SDK falle por su cuenta |

## 5. Pendientes y riesgos

- **P1. Resuelto.** Las pruebas de integración pasan contra servicios reales: 26 contra MongoDB Atlas y
  27 contra un proyecto de Firestore, incluidas las de envíos simultáneos y atomicidad.
- **P2. Resuelto.** `equivalencia-motores.test.js` corre el mismo flujo en cada motor (usando la fábrica,
  como la aplicación) y compara el JSON. Se ejecutó con `EQUIVALENCIA_EXIGIR_TODOS=1` sobre PostgreSQL, MySQL,
  MongoDB y Firebase (emulador de Firestore) levantados con Docker, y los cuatro devuelven lo mismo. Las
  pruebas de contrato de PostgreSQL y MySQL también pasan (40 de 40).
- **P3. Parámetros de examen.** La clasificación de la información menciona "Parámetro de examen"
  (parámetros y rangos de referencia por tipo de examen), pero no tiene atributos definidos en las entidades.
  Hoy el rango de referencia viaja dentro de cada valor del resultado. Si el equipo quiere un catálogo de
  parámetros por tipo, se puede embeber en `tipos_examen`.
- **P5. Interfaz.** Las pantallas para las rutas nuevas son parte del trabajo del Integrante C. El contrato está en `openapi.yaml`.
