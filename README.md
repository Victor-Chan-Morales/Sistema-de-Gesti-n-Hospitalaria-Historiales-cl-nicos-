# Red de hospitales: plataforma de historiales clínicos

Proyecto final de Bases de Datos II (Universidad Rafael Landívar). Plataforma compartida de historiales clínicos para cuatro instituciones médicas independientes. Cada una guarda sus datos en un motor distinto y el backend, con arquitectura hexagonal, dirige las operaciones de cada usuario al motor de su institución.

| Institución | ID | Motor | Estado |
|---|---|---|---|
| Hospital General | 1 | PostgreSQL | Implementado |
| Clínica Odontológica | 2 | MySQL | Implementado |
| Laboratorio Clínico | 3 | MongoDB | Implementado |
| Centro Médico Pediátrico | 4 | Firebase (Firestore) | Implementado |

## Estado del proyecto

| Parte | Responsable | Estado |
|---|---|---|
| A: núcleo del backend, autenticación, PostgreSQL y MySQL | Victor | Implementada |
| B: MongoDB, Firebase, modelo documental y comparativo | Integrante B | Implementada: [detalles](#integrante-b-mongodb-y-firebase) |
| C: pantallas, integración y pruebas | Integrante C | Por empezar: [instrucciones](#integrante-c-frontend-y-qa) |

### Lo implementado hasta el momento

**Arquitectura**
- Capas de dominio, puertos, casos de uso, DTOs, factory y adaptadores. Una prueba automática falla si el núcleo importa un driver o Express.
- El factory elige el motor según la institución del token. La relación institución-motor se define en `backend/src/config/instituciones.js`.

**Seguridad**
- Login con JWT y bcrypt. Busca al usuario en los motores implementados, en paralelo, y responde con la primera coincidencia ([ADR-002](docs/decisiones/ADR-002-login-entre-motores.md)).
- Permisos por rol. La institución sale siempre del token, así que un usuario no puede operar sobre otra institución.

**Funcionalidad, en los cuatro motores**
- Pacientes: registro con historial clínico, búsqueda, edición y archivo por baja.
- Historial: consulta completa, alergias y antecedentes.
- Citas: programar, reprogramar y cancelar. Un paciente archivado o inactivo no recibe citas nuevas.
- Consultas: consulta, signos vitales, diagnósticos, tratamientos y receta se guardan como una unidad. También se pueden agregar datos a una consulta existente, finalizarla o anularla.
- Catálogos de diagnósticos, medicamentos, alergias y profesionales.

**Funciones propias de cada institución**
- Laboratorio (MongoDB): órdenes de examen y resultados de estructura variable. El resultado y el estado de su orden se guardan como una unidad.
- Centro Pediátrico (Firebase): controles de crecimiento y registro de vacunación.

**Consistencia**
- Transacciones con `BEGIN/COMMIT/ROLLBACK` y auditoría de quién y cuándo hizo cada escritura.
- Protección contra doble envío, también ante peticiones simultáneas.
- Si un motor se cae, su institución recibe un 503 con un mensaje amigable y las demás siguen funcionando.

**Herramientas**
- Docker Compose, datos de prueba repetibles y documentación interactiva de la API.
- 124 pruebas unitarias y de arquitectura, y la suite de contrato de integración para los cuatro motores.

### Lo que aún no está

- Pantallas: `frontend/` solo tiene el formulario de login sin conectar y un panel vacío (C).
- Hospitalización y odontograma: las tablas de hospital y clínica existen, pero aún no tienen endpoints.
- Límite de intentos fallidos en el login. Además, un token sigue siendo válido hasta expirar, aunque se desactive al usuario.

## Cómo levantarlo

Requisitos: Node.js 22 o superior, y Docker con Docker Compose.

```bash
cp .env.example .env              # completar las variables (ver abajo)
docker compose up -d postgres mysql mongo firestore
cd backend && npm install
npm run seed                      # PostgreSQL y MySQL; se puede repetir
npm run seed:nosql                # MongoDB y Firebase; se puede repetir
npm start
```

En `.env` hay que definir:
- `JWT_SECRET`, con al menos 32 caracteres: `openssl rand -hex 32`.
- `SEED_CONTRASENA`: la contraseña de los usuarios de prueba.
- Usuario y contraseña de PostgreSQL y MySQL, y `MYSQL_ROOT_PASSWORD`. Cualquier valor sirve en local, porque Docker crea las bases con ellos.
- `FIREBASE_PROJECT_ID`, que para el emulador puede ser cualquiera, como `demo-red-hospitales`.

Con el servidor en marcha:
- Aplicación: <http://localhost:3000>
- Documentación de la API: <http://localhost:3000/api/docs>
- Estado de los motores: <http://localhost:3000/health/motores>

Los scripts SQL solo corren al crear un volumen nuevo. Para aplicar un cambio de esquema o limpiar los datos que dejan las pruebas de integración, ejecuta `docker compose down -v`, vuelve a levantar las bases y repite `npm run seed`. **Esto borra todos los datos de las bases.**

### Usuarios de prueba

La contraseña es el valor de `SEED_CONTRASENA`.

| Institución | Administrador | Secretaria | Profesional |
|---|---|---|---|
| Hospital General | `admin.hospital` | `secretaria.hospital` | `medico.hospital` |
| Clínica Odontológica | `admin.clinica` | `secretaria.clinica` | `odontologo.clinica` |
| Laboratorio Clínico | `admin.laboratorio` | `secretaria.laboratorio` | `laboratorista.laboratorio` |
| Centro Médico Pediátrico | `admin.pediatrico` | `secretaria.pediatrico` | `pediatra.pediatrico` |

### Pruebas

```bash
cd backend
npm test                    # unitarias y de arquitectura; sin Docker
npm run test:integracion    # requiere las bases levantadas, npm run seed y npm run seed:nosql
```

## Arquitectura

La regla de dependencias es `adapters → application → domain`.

```
backend/src/
  domain/        reglas de negocio, roles, validación y errores
  ports/         contrato que cumple cada motor (repositorioClinico.js)
  application/   casos de uso; reciben el repositorio como parámetro
  dto/           contrato JSON único hacia el frontend
  factory/       elige el motor según la institución del JWT
  config/        relación institución-motor y variables de entorno
  adapters/      http/, seguridad/ y persistence/{postgres, mysql, mongo, firebase}
backend/db/      esquemas SQL y seeder
backend/tests/   unit/, contrato/ e integracion/
docs/            modelos, API, seguridad, comparativo y decisiones
frontend/        HTML + Tailwind (CDN) + JavaScript vanilla
```

Una petición entra por `adapters/http`, donde el JWT indica la institución. El factory entrega el repositorio de ese motor, el caso de uso aplica las reglas y el DTO responde con el mismo JSON para todos.

## Cómo trabajar en equipo

- Las ramas son `main`, `dev` y `feature/*`. Crea tu rama desde `dev` e intégrala con un pull request.
- Nunca subas `.env` ni credenciales de Firebase; `.gitignore` ya los excluye.
- Antes de integrar, ejecuta `npm test`.
- Un cambio en el puerto (`backend/src/ports/repositorioClinico.js`), en una tabla común o en el contrato de la API afecta a todos: acuérdenlo antes.

## Integrante B: MongoDB y Firebase

Implementado. Ambos adaptadores cumplen el mismo contrato que PostgreSQL y MySQL y pasan la misma suite (`backend/tests/contrato/suiteRepositorio.js`). Qué se embebe y qué se referencia está en [`docs/04-modelo-documental.md`](docs/04-modelo-documental.md); la comparación entre motores, en [`docs/08-comparativo.md`](docs/08-comparativo.md).

- **MongoDB (Laboratorio):** `backend/src/adapters/persistence/mongo/`. Referenciación: pacientes, historiales, consultas, órdenes y resultados en colecciones separadas. Índices únicos y transacciones multi-documento.
- **Firebase (Pediátrico):** `backend/src/adapters/persistence/firebase/`. Subcolecciones del paciente para controles de crecimiento y vacunas. Unicidad y doble envío con `runTransaction`.
- **Funciones propias**, fuera del contrato común (`backend/src/ports/repositoriosEspecializados.js`) y solo en el motor de su institución:
  - Laboratorio: `/api/laboratorio/*`, con órdenes de uno o varios exámenes y resultados de estructura variable.
  - Pediátrico: `/api/pediatria/*`, con controles de crecimiento (IMC calculado si no se envía) y registro de vacunación.
  - En otra institución responden 422.
- **Laboratorista:** registra órdenes y resultados. Conserva los permisos clínicos comunes de `roles.js`, que son los que usa el contrato compartido de consultas.
- **Pediatra:** es un usuario con rol `Médico` en el Centro Pediátrico. El seguimiento pediátrico exige un paciente activo y menor de 18 años.
- **Firestore:** `backend/db/firebase/firestore.rules` deniega todo acceso directo; solo el backend, con el SDK de administración, accede.

Para probarlos:

```bash
docker compose up -d mongo firestore
cd backend
npm run seed:nosql                       # o: npm run seed:nosql -- mongo | firebase
node --test tests/integracion/mongo.test.js
node --test tests/integracion/firebase.test.js
```

Define `FIREBASE_PROJECT_ID` en `.env`; para el emulador sirve cualquier ID, como `demo-red-hospitales`.

Puntos importantes:
- **MongoDB sin autenticación:** el replica set de desarrollo corre sin usuario ni contraseña; activarla requiere un keyfile.
- **Firestore:** la búsqueda por texto y los filtros combinados se completan en memoria; ver los límites en [`docs/08-comparativo.md`](docs/08-comparativo.md#7-límites-de-la-implementación).

## Integrante C: frontend y QA

La interfaz no debe cambiar según el motor. Express sirve `frontend/` en <http://localhost:3000>, así que no hay que configurar CORS. Prueba siempre desde esa dirección.

1. Levanta el backend con las instrucciones de [Cómo levantarlo](#cómo-levantarlo).
2. Revisa los contratos en [`docs/06-api-contratos.md`](docs/06-api-contratos.md) y prueba los endpoints en `/api/docs`.
3. Conecta `frontend/js/api.js` al token: hoy no envía el encabezado `Authorization`. Guarda el token que devuelve `POST /api/auth/login` y envíalo como `Authorization: Bearer <token>`. Ante un 401, regresa al login.
4. Construye las pantallas: login, búsqueda y registro de pacientes, historial, citas y registro de consulta.
5. Adapta la interfaz al rol que devuelve el login, según la [matriz de permisos](docs/07-seguridad.md#control-de-acceso-por-roles). Por ejemplo, una secretaria no debe ver los formularios clínicos.

Puntos importantes:
- **Errores:** toda respuesta de error trae `{ codigo, mensaje }`, y `mensaje` está listo para mostrarse. Un 503 significa que el motor de esa institución no responde; muéstralo como aviso, sin romper la pantalla. `api.js` ya lanza ese mensaje como `Error`, pero no conserva el estado HTTP: tendrás que agregarlo para distinguir un 401.
- **Advertencias:** `POST /api/consultas` y `POST /api/consultas/:id/recetas` devuelven `advertencias`, con alergias relacionadas a lo recetado. Hay que mostrarlas de forma visible.
- **Datos:** trata los IDs como texto, porque Mongo y Firebase no usan números. Envía las fechas como `YYYY-MM-DD` y `YYYY-MM-DDTHH:MM:SS`.
- **Doble clic:** un 409 indica un envío duplicado. Desactiva el botón mientras se guarda.

Para QA:
- Prueba los flujos completos con cada institución y rol, y confirma que la interfaz sea idéntica.
- Simula una caída con `docker compose stop mysql`: la clínica debe mostrar el aviso y el hospital debe seguir funcionando.
- Repite todo con el laboratorio y el centro pediátrico. Sus pantallas propias (órdenes y resultados, controles y vacunas) usan `/api/laboratorio` y `/api/pediatria`, documentados en `/api/docs`.

## Documentación

- [Reglas de negocio](docs/02-reglas-negocio.md)
- [Modelo relacional](docs/03-modelo-relacional.md)
- [Modelo documental](docs/04-modelo-documental.md)
- [Contratos de la API](docs/06-api-contratos.md) y [OpenAPI](docs/openapi.yaml)
- [Seguridad](docs/07-seguridad.md)
- [Comparativo de motores](docs/08-comparativo.md)
- [Decisiones de arquitectura](docs/decisiones/)
- [Guía de los motores NoSQL](docs/guia-integrante-b.md)

Aún sin redactar: `docs/01-requisitos.md` y `docs/05-operaciones.md`.
