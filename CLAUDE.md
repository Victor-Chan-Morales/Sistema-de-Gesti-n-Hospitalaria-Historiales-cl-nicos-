# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contexto del proyecto

Proyecto universitario (Universidad Rafael Landívar, Bases de Datos II): una plataforma compartida de historiales clínicos para cuatro instituciones médicas independientes, cada una con su datos en un **motor de base de datos distinto**. Todos los identificadores, documentos y términos del dominio están en español; el código y los nombres de esquema nuevos deben mantenerse en español.

| Institución | Motor | Archivo en el repositorio |
|---|---|---|
| Hospital General | PostgreSQL | `backend/db/postgres/01-hospital_general.sql` |
| Clínica Odontológica | MySQL | `backend/db/mysql/01-clinica_odontologica.sql` |
| Laboratorio Clínico | MongoDB | `backend/src/adapters/persistence/mongo/` (colecciones e índices en `indices.js`) |
| Centro Médico Pediátrico | Firebase (Firestore) | `backend/src/adapters/persistence/firebase/` (reglas en `backend/db/firebase/firestore.rules`) |

Documentos de referencia (PDF) en la raíz del repositorio:
- `Proyecto final bases II (1).pdf`: el enunciado oficial y la rúbrica (Entrega I: modelo relacional; Entrega II: aplicación cliente-servidor).
- `Proyecto Final BD - Red de hospitales.pdf`: la Entrega I del equipo (entidades, atributos, clasificación de la información, justificación de motores).
- `Propuesta de Proyecto - Entrega II.pdf`: el plan acordado para la Entrega II (stack, arquitectura, reparto del trabajo).

Leerlos con `pdftotext -layout <archivo> -` cuando haya dudas sobre los requisitos. Las imágenes de WhatsApp probablemente son fotos de diagramas (modelo ER).

## Estado actual

El núcleo hexagonal y los cuatro adaptadores están implementados: PostgreSQL y MySQL (Integrante A), MongoDB y Firebase (Integrante B). Si un motor no tuviera adaptador, `factory/repositoryFactory.js` lo resuelve con un stub que responde 503. El frontend (Integrante C) está pendiente. Las decisiones de modelado de MongoDB y Firebase están en `docs/04-modelo-documental.md` y `docs/08-comparativo.md`.

```bash
cp .env.example .env                 # completar las variables
docker compose up -d postgres mysql mongo firestore  # los SQL se cargan solo si el volumen es nuevo
cd backend && npm install
npm run seed                         # PostgreSQL y MySQL; repetible
npm run seed:nosql                   # MongoDB y Firebase; repetible
npm start                            # http://localhost:3000, docs en /api/docs
npm test                             # unitarias y arquitectura, sin Docker
npm run test:integracion             # contrato y equivalencia; requiere las cuatro bases y ambos seeds
node --test --test-name-pattern="<patrón>" tests/unit/http.test.js   # una sola prueba
```

Regla de dependencias: `adapters → application → domain`. El dominio, los puertos y los casos de uso no importan drivers ni Express (`tests/arquitectura.test.js` lo verifica). `factory/` y `server.js` son los únicos puntos que conectan adaptadores.

Cualquier cambio al puerto (`ports/repositorioClinico.js`) debe reflejarse en los cuatro adaptadores, en `tests/unit/apoyo/repoMemoria.js` y en `tests/contrato/suiteRepositorio.js`. Los repositorios de PostgreSQL y MySQL son casi idénticos a propósito: al corregir uno, revisar el otro. Los de MongoDB y Firebase comparten utilidades en `adapters/persistence/nosql-comun/`.

Las funciones propias de una institución (órdenes y resultados del laboratorio; controles y vacunas del pediátrico) no forman parte del contrato común: viven en `ports/repositoriosEspecializados.js`, se exponen como una propiedad adicional del adaptador (`examenes`, `seguimiento`) y sus rutas son `/api/laboratorio` y `/api/pediatria`.

## Arquitectura del esquema

Ambos scripts SQL (`backend/db/`) comparten una **sección común** idéntica ("ENTIDADES GENERALES"): `Institucion`, `Usuario`, `Paciente`, `Historial_Clinico`, `Cita`, `Consulta`, `Signos_Vitales`, diagnósticos (`Catalogo_Diagnostico` / `Diagnostico_Consulta`), `Tratamiento`, `Receta` / `Detalle_Receta` / `Medicamento`, alergias, antecedentes, contactos de emergencia, representantes y `Auditoria`. Los teléfonos y correos (multivaluados) están normalizados en tablas `Telefono_*` / `Correo_*` separadas por cada entidad propietaria.

Después, cada script agrega **tablas específicas de su institución**:
- Hospital (PostgreSQL): `Especialidad_Medica`, `Usuario_Especialidad`, `Habitacion`, `Hospitalizacion`, `Hospitalizacion_Habitacion`.
- Clínica (MySQL): `Odontograma`, `Pieza_Dental`, `Procedimiento_Odontologico`.

Las diferencias de dialecto entre las dos copias de la sección común son mecánicas y deben mantenerse consistentes al editar cualquiera de ellas:
- MySQL: `INT AUTO_INCREMENT`, `ENUM(...)`, `DATETIME`, cláusulas `FOREIGN KEY (...) REFERENCES ...` al final de la tabla.
- PostgreSQL: `SERIAL`, `VARCHAR(n) CHECK (col IN (...))` en lugar de ENUM, `TIMESTAMP`, `REFERENCES` en línea sobre la columna.

Cualquier cambio a una tabla común debe aplicarse en ambos archivos (y, más adelante, reflejarse en los modelos documentales de MongoDB/Firebase y en los DTOs).

El script de MySQL debe conservar `SET NAMES utf8mb4` al inicio: sin esto, los `ENUM` con acentos se corrompen al cargarlo.

Regla de negocio clave incluida en el modelo: `Paciente.estado` (Activo / Archivado / Inactivo) junto con `motivo_baja`; los pacientes archivados o inactivos no pueden recibir citas nuevas.

## Arquitectura de la Entrega II (según la propuesta)

- **Backend**: Node.js + Express con arquitectura hexagonal (dominio, puertos, adaptadores). Librerías: `pg`, `mysql2`, `mongodb`, `firebase-admin`, `jsonwebtoken`, `bcrypt`, `dotenv`.
- **Frontend**: HTML + Tailwind (CDN) + JavaScript vanilla con `fetch`. La interfaz no debe cambiar según el motor activo.
- **Enrutamiento por institución**: el JWT incluye `id_institucion` y `rol`; un Factory lee ese claim y devuelve el adaptador de repositorio correspondiente.
- **DTOs**: cada adaptador transforma su estructura nativa (filas o documentos) a un único contrato JSON, documentado en Swagger/Postman.
- **Middleware RBAC**: p. ej., una `Secretaria` no puede crear diagnósticos; los usuarios solo operan dentro de su propia institución.
- **Atomicidad**: consulta + diagnóstico + receta se guardan como una unidad: `BEGIN/COMMIT/ROLLBACK` en SQL, transacciones multi-documento en MongoDB, batched writes en Firebase.
- **Modelado NoSQL**: MongoDB usa *referenciación* (colecciones separadas para pacientes, órdenes y resultados; los resultados de exámenes tienen estructura variable según el tipo de examen). Firebase usa *embebido mediante subcolecciones* (p. ej., `pacientes/{id}/controles_crecimiento`, registro de vacunas).
- Los endpoints POST deben evitar envíos duplicados (verificación de idempotencia contra registros idénticos recientes).
- Las credenciales van en `.env`; solo se sube `.env.example`.
