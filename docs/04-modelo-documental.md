# Modelo documental

Modelo de Laboratorio Clínico (MongoDB) y Centro Médico Pediátrico (Firebase): qué se embebe, qué se referencia y por qué. La regla que se siguió en ambos: **se embebe lo pequeño, acotado y que siempre se lee junto con su dueño; se referencia lo que crece sin límite o se consulta por separado.**

Ambos adaptadores cumplen el mismo contrato que PostgreSQL y MySQL (`backend/src/ports/repositorioClinico.js`), así que el JSON que recibe el frontend es idéntico. Lo que cambia es cómo se guarda cada cosa.

## MongoDB: Laboratorio Clínico (referenciación)

Un paciente acumula cientos de exámenes a lo largo de los años. Embeberlos en el documento del paciente lo haría crecer sin control hasta el límite de 16 MB de MongoDB y degradaría cada lectura. Por eso las entidades que crecen viven en colecciones propias y se enlazan por ID.

| Colección | Qué guarda | Relación |
|---|---|---|
| `usuarios` | Cuentas de la institución | Índice único en `usuario` |
| `pacientes` | Datos del paciente, con teléfonos, correos, contactos de emergencia y representantes **embebidos** | Referencia a su historial |
| `historiales` | Historial clínico, con alergias y antecedentes **embebidos** | `id_paciente` (índice único) |
| `citas` | Citas | Referencian paciente y profesional |
| `consultas` | Consulta con signos, diagnósticos, tratamientos y recetas **embebidos** | Referencia `id_historial` e `id_paciente` |
| `ordenes_laboratorio` | Orden con sus exámenes solicitados **embebidos** | Referencia `id_historial`, `id_paciente` |
| `resultados_laboratorio` | Un resultado por examen de la orden | Referencia `id_orden_laboratorio` y `id_tipo_examen` |
| `tipos_examen`, `catalogo_diagnostico`, `medicamentos`, `catalogo_alergia` | Catálogos | Se copian los campos que se muestran (nombre, código) al embeber |
| `auditoria` | Quién hizo qué y cuándo (regla 22) | Se escribe en la misma transacción |

### Qué se embebe y por qué

- **Teléfonos, correos, contactos y representantes** dentro del paciente: son pocos, se leen siempre con él y no tienen sentido solos.
- **Alergias y antecedentes** dentro del historial: acotados por paciente y consultados con el historial.
- **Signos, diagnósticos, tratamientos y recetas** dentro de la consulta: pertenecen a una sola consulta y se guardan y leen como una unidad (regla 7, 8 y 9).
- **Exámenes solicitados** dentro de la orden (regla 17): son pocos y siempre se leen con ella.

### Qué se referencia y por qué

- **Consultas, órdenes y resultados** en colecciones propias: crecen sin límite por paciente, y el historial completo las pide ordenadas por fecha sin cargar el documento del paciente.
- **Resultados separados de la orden:** su estructura varía según el tipo de examen (regla 18). Un hemograma trae decenas de parámetros y una glucosa, uno. Con un documento por resultado cada examen guarda exactamente sus parámetros, sin columnas vacías ni tablas por tipo de examen.

Ejemplo de un resultado:

```json
{
  "id_orden_laboratorio": "ObjectId",
  "id_tipo_examen": "ObjectId",
  "fecha_toma_muestra": "2026-02-01",
  "fecha_resultado": "2026-02-02",
  "resultado_general": "Normal",
  "valores_detallados": [
    { "parametro": "Hemoglobina", "valor": "13.5", "unidad": "g/dL", "rango_referencia": "12-16" }
  ],
  "id_usuario_laboratorista": "..."
}
```

### Integridad sin claves foráneas

MongoDB no las tiene, así que el adaptador las sustituye:

- **Unicidad:** índices únicos en `usuario`, `dpi_o_documento` (parcial: varios pacientes sin documento no chocan), `codigo_historial`, y `(orden, examen)` en resultados. Los crea el adaptador al primer uso.
- **Una cita programada idéntica:** índice único parcial sobre `(paciente, profesional, fecha_hora)` solo cuando `estado = 'Programada'`.
- **Referencias válidas:** antes de guardar una receta, un diagnóstico o una alergia, el adaptador comprueba que el registro del catálogo exista; si no, `DatosInvalidos` y se revierte todo.
- **IDs:** se guardan como `ObjectId` y salen como string. Un ID con formato inválido equivale a "no existe".

## Firebase (Firestore): Centro Médico Pediátrico (embebido mediante subcolecciones)

El seguimiento de un niño (controles de crecimiento y vacunas) se consulta siempre junto con su paciente y no es masivo: unas pocas visitas por año. Las subcolecciones lo mantienen junto a su dueño, se leen con una sola consulta y no cuentan para el límite de 1 MB del documento.

```
pacientes/{id}                      datos, teléfonos, contactos, representantes e historial (embebidos)
  alergias/{id_catalogo_alergia}    el ID es el de la sustancia: una alergia por sustancia
  antecedentes/{id}
  controles_crecimiento/{id}        peso, talla, perímetro cefálico, IMC
  registro_vacunas/{id}             el ID se deriva de vacuna, dosis y fecha
citas/{id}
consultas/{id}                      con signos, diagnósticos, tratamientos y recetas embebidos
vacunas/{id}                        catálogo
catalogo_diagnostico, medicamentos, catalogo_alergia
usuarios/{id}
indices_unicos/{clave}              claves de unicidad (ver abajo)
auditoria/{id}
```

### Decisiones

- **Historial dentro del paciente:** es un solo documento por paciente (relación 1 a 1), así que archivar actualiza paciente e historial en una operación.
- **Citas y consultas de primer nivel:** se buscan por su ID o por profesional sin conocer al paciente. Estar en una subcolección obligaría a consultas de grupo con índices adicionales.
- **IMC:** se registra el que envía el profesional o se calcula con peso (kg) y talla (cm).

### Límites de Firestore y cómo se resuelven

| Falta | Solución |
|---|---|
| Índices únicos | Documentos en `indices_unicos` cuyo ID es la clave (`dpi_…`, `historial_…`, `cita_…`), comprobados y creados dentro de la transacción |
| Claves foráneas | Se lee el documento referenciado dentro de la transacción |
| Búsqueda por subcadena | Se leen los documentos y se filtra en memoria (volumen pequeño); se evitan además índices compuestos |
| Una cita Programada idéntica | Su clave de unicidad existe solo mientras la cita está `Programada`; al atenderse o cancelarse se elimina |

### Reglas de seguridad

`backend/db/firebase/firestore.rules` deniega todo acceso directo. Solo el backend, con el SDK de administración, lee y escribe.

## Resumen de la comparación

| Dato | PostgreSQL / MySQL | MongoDB | Firestore |
|---|---|---|---|
| Teléfonos, correos, contactos | Tablas `Telefono_*`, `Contacto_*` | Embebidos en el paciente | Embebidos en el paciente |
| Alergias y antecedentes | Tablas con clave foránea | Embebidos en el historial | Subcolecciones del paciente |
| Consulta y su detalle | Tablas relacionadas | Documento con detalle embebido | Documento con detalle embebido |
| Resultados de laboratorio | No aplica | Colección propia, estructura variable | No aplica |
| Controles y vacunas | No aplica | No aplica | Subcolecciones del paciente |
