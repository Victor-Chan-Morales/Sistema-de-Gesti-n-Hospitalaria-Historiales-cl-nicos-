# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contexto del proyecto

Proyecto universitario (Universidad Rafael Landívar, Bases de Datos II): una plataforma compartida de historiales clínicos para cuatro instituciones médicas independientes, cada una con su datos en un **motor de base de datos distinto**. Todos los identificadores, documentos y términos del dominio están en español; el código y los nombres de esquema nuevos deben mantenerse en español.

| Institución | Motor | Archivo en el repositorio |
|---|---|---|
| Hospital General | PostgreSQL | `hospital_general.sql` |
| Clínica Odontológica | MySQL | `clinica_odontologica.sql` |
| Laboratorio Clínico | MongoDB | aún no creado |
| Centro Médico Pediátrico | Firebase (Firestore) | aún no creado |

Documentos de referencia (PDF) en la raíz del repositorio:
- `Proyecto final bases II (1).pdf`: el enunciado oficial y la rúbrica (Entrega I: modelo relacional; Entrega II: aplicación cliente-servidor).
- `Proyecto Final BD - Red de hospitales.pdf`: la Entrega I del equipo (entidades, atributos, clasificación de la información, justificación de motores).
- `Propuesta de Proyecto - Entrega II.pdf`: el plan acordado para la Entrega II (stack, arquitectura, reparto del trabajo).

Leerlos con `pdftotext -layout <archivo> -` cuando haya dudas sobre los requisitos. Las imágenes de WhatsApp probablemente son fotos de diagramas (modelo ER).

## Estado actual

Todavía no hay código de aplicación, repositorio git ni herramientas de build o pruebas. Los únicos archivos ejecutables son los dos scripts DDL.

Cargar los esquemas (los scripts solo contienen `CREATE TABLE`; no tienen `CREATE DATABASE`, `USE` ni `DROP`, así que deben ejecutarse sobre una base de datos nueva y vacía):

```bash
createdb hospital_general && psql -d hospital_general -f hospital_general.sql
mysql -e "CREATE DATABASE clinica_odontologica" && mysql clinica_odontologica < clinica_odontologica.sql
```

## Arquitectura del esquema

Ambos scripts SQL comparten una **sección común** idéntica ("ENTIDADES GENERALES"): `Institucion`, `Usuario`, `Paciente`, `Historial_Clinico`, `Cita`, `Consulta`, `Signos_Vitales`, diagnósticos (`Catalogo_Diagnostico` / `Diagnostico_Consulta`), `Tratamiento`, `Receta` / `Detalle_Receta` / `Medicamento`, alergias, antecedentes, contactos de emergencia y representantes. Los teléfonos y correos (multivaluados) están normalizados en tablas `Telefono_*` / `Correo_*` separadas por cada entidad propietaria.

Después, cada script agrega **tablas específicas de su institución**:
- Hospital (PostgreSQL): `Especialidad_Medica`, `Usuario_Especialidad`, `Habitacion`, `Hospitalizacion`, `Hospitalizacion_Habitacion`.
- Clínica (MySQL): `Odontograma`, `Pieza_Dental`, `Procedimiento_Odontologico`.

Las diferencias de dialecto entre las dos copias de la sección común son mecánicas y deben mantenerse consistentes al editar cualquiera de ellas:
- MySQL: `INT AUTO_INCREMENT`, `ENUM(...)`, `DATETIME`, cláusulas `FOREIGN KEY (...) REFERENCES ...` al final de la tabla.
- PostgreSQL: `SERIAL`, `VARCHAR(n) CHECK (col IN (...))` en lugar de ENUM, `TIMESTAMP`, `REFERENCES` en línea sobre la columna.

Cualquier cambio a una tabla común debe aplicarse en ambos archivos (y, más adelante, reflejarse en los modelos documentales de MongoDB/Firebase y en los DTOs).

Regla de negocio clave incluida en el modelo: `Paciente.estado` (Activo / Archivado / Inactivo) junto con `motivo_baja`; los pacientes archivados o inactivos no pueden recibir citas nuevas.

## Arquitectura planificada para la Entrega II (según la propuesta)

- **Backend**: Node.js + Express con arquitectura hexagonal (dominio, puertos, adaptadores). Librerías: `pg`, `mysql2`, `mongodb`, `firebase-admin`, `jsonwebtoken`, `bcrypt`, `dotenv`.
- **Frontend**: HTML + Tailwind (CDN) + JavaScript vanilla con `fetch`. La interfaz no debe cambiar según el motor activo.
- **Enrutamiento por institución**: el JWT incluye `id_institucion` y `rol`; un Factory lee ese claim y devuelve el adaptador de repositorio correspondiente.
- **DTOs**: cada adaptador transforma su estructura nativa (filas o documentos) a un único contrato JSON, documentado en Swagger/Postman.
- **Middleware RBAC**: p. ej., una `Secretaria` no puede crear diagnósticos; los usuarios solo operan dentro de su propia institución.
- **Atomicidad**: consulta + diagnóstico + receta se guardan como una unidad: `BEGIN/COMMIT/ROLLBACK` en SQL, transacciones multi-documento en MongoDB, batched writes en Firebase.
- **Modelado NoSQL**: MongoDB usa *referenciación* (colecciones separadas para pacientes, órdenes y resultados; los resultados de exámenes tienen estructura variable según el tipo de examen). Firebase usa *embebido mediante subcolecciones* (p. ej., `pacientes/{id}/controles_crecimiento`, registro de vacunas).
- Los endpoints POST deben evitar envíos duplicados (verificación de idempotencia contra registros idénticos recientes).
- Las credenciales van en `.env`; solo se sube `.env.example`.
