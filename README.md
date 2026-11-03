# Red de hospitales: plataforma de historiales clínicos

Proyecto final de Bases de Datos II (Universidad Rafael Landívar). Plataforma compartida de historiales clínicos para cuatro instituciones médicas independientes. Cada una guarda sus datos en un motor distinto y el backend, con arquitectura hexagonal, dirige las operaciones de cada usuario al motor de su institución.

| Institución | Motor |
|---|---|
| Hospital General | PostgreSQL |
| Clínica Odontológica | MySQL |
| Laboratorio Clínico | MongoDB |
| Centro Médico Pediátrico | Firebase (Firestore) |

## Estructura

- `docs/`: documentación del proyecto (requisitos, modelos, API, seguridad, comparativo, decisiones).
- `backend/`: API en Node.js + Express (`src/domain`, `src/ports`, `src/adapters`, `src/factory`, `src/dto`, `src/config`).
- `backend/db/`: scripts de inicialización de PostgreSQL y MySQL (Docker los ejecuta al crear los contenedores).
- `frontend/`: HTML + Tailwind (CDN) + JavaScript vanilla.

## Cómo levantarlo

Requisitos: Node.js y Docker con Docker Compose.

```bash
cp .env.example .env              # completar las variables
docker compose up -d              # PostgreSQL, MySQL, MongoDB (replica set) y emulador de Firestore
cd backend && npm install
node src/server.js                # http://localhost:3000/health
```

El frontend se abre directamente desde `frontend/index.html` (o con cualquier servidor estático).

## Pendientes

- Asignación de motores justificada por escrito (`docs/decisiones/ADR-001-asignacion-motores.md`).
- Contenido de todos los documentos de `docs/`.
- Mover o copiar `hospital_general.sql` y `clinica_odontologica.sql` a `backend/db/postgres/` y `backend/db/mysql/` (siguen en la raíz).
- Relación entre `id_institucion` y motor en el factory, y los métodos del puerto de repositorio.
- Modelo documental de MongoDB y Firebase (colecciones, índices, reglas de seguridad).
- Autenticación de MongoDB: el replica set de desarrollo corre sin usuario ni contraseña (activar autenticación requiere un keyfile).
- ID de proyecto de Firebase y si se usará un proyecto real además del emulador.
- Sistema de módulos del backend (se dejó CommonJS, el valor por defecto de `npm init`).
- Framework de pruebas para `backend/tests/`.
- Herramienta de documentación de la API: Swagger o Postman.
- Cómo servir el frontend y la configuración de CORS en el backend.
- Seeders con datos de prueba.
- Repositorio remoto en GitHub y ramas (`main`, `dev`, `feature/*`).
