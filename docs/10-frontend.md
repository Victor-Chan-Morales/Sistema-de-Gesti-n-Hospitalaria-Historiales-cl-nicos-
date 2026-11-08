# Frontend y manual de pruebas (Parte C)

La interfaz de las cuatro instituciones. No cambia según el motor: el JSON que
consume es el mismo porque el backend lo normaliza en sus DTOs. Express sirve
`frontend/` en el mismo origen de la API (puerto 3000), así que no hay CORS y
`js/api.js` usa rutas relativas.

## Estructura

```
frontend/
  index.html        login
  dashboard.html    panel: encabezado con sesión, navegación y contenedor de vistas
  js/
    sesion.js      token y usuario en localStorage; matriz de permisos espejo del backend
    api.js         cliente HTTP: Authorization Bearer, ApiError con estado y código
    utilidades.js  fechas del contrato, insignias, avisos, modales, selector de paciente
    login.js       conecta el formulario de entrada
    panel.js       encabezado, navegación por hash y enrutado a vistas
    vistas/
      pacientes.js    búsqueda, registro, edición y archivar
      citas.js        programación, reprogramación, cancelación y estados
      historial.js    historial clínico, alergias y antecedentes
      consultas.js    registro atómico, extras y estados de la consulta
      laboratorio.js  órdenes y resultados (solo institución 3)
      pediatria.js    controles y vacunas (solo institución 4)
```

## Decisiones

- **Sesión:** `POST /api/auth/login` devuelve `{ token, usuario }` y se guarda en
  `localStorage` (`js/sesion.js`). Ante un 401, `js/api.js` limpia la sesión y
  vuelve al login con un aviso de expiración; el login con credenciales
  inválidas no dispara esa salida, porque su 401 es de autenticación y no de
  sesión.
- **Permisos:** `js/sesion.js` repite la matriz de `backend/src/domain/roles.js`.
  Con ella el panel arma la navegación: la secretaria no ve historial ni
  consultas, el administrador tampoco, y las pantallas de laboratorio o
  pediatría solo aparecen en su institución. Es presentación: el backend sigue
  aplicando permisos en cada endpoint.
- **IDs y fechas:** los ids se tratan siempre como texto (Mongo y Firebase no
  usan números) y los `<input type="date">` / `datetime-local` producen el
  formato del contrato (`YYYY-MM-DD` y `YYYY-MM-DDTHH:MM:SS`, hora local).
- **Doble envío:** cada botón de guardado se deshabilita mientras responde la
  petición (`conCarga`). Si aún así llega un 409, se muestra el mensaje del
  servidor.
- **Errores:** toda respuesta de error trae `{ codigo, mensaje }` listo para
  mostrarse. El 503 de un motor caído se presenta como aviso dentro de la
  vista, sin romper la pantalla; el resto, como aviso de error.
- **Advertencias de alergias:** `POST /api/consultas` y
  `POST /api/consultas/:id/recetas` responden `advertencias`; el panel las
  muestra en un aviso destacado y visible encima del detalle de la consulta.
- **Extras de consulta:** el dominio solo bloquea los extras en consulta
  Anulada; sobre una Finalizada todavía se pueden agregar diagnóstico,
  tratamiento o receta. La interfaz refleja esa regla.

## Flujo por pantallas con los usuarios de prueba

La contraseña es el valor de `SEED_CONTRASENA`.

| Sesión | Qué se ve | Qué se prueba |
|---|---|---|
| `secretaria.hospital` o `secretaria.clinica` | Pacientes y Citas | buscar, registrar, editar; programar, reprogramar, marcar No Asistió, cancelar; inhabilitado el clínico |
| `admin.hospital` / `admin.clinica` | Pacientes y Citas | archivar con motivo; el paciente inactivo rechaza citas (422) |
| `medico.hospital` / `odontologo.clinica` | Añade Historial y Consultas | alergias, antecedentes, consulta atómica, estados, advertencia de alergia al recetar |
| `laboratorista.laboratorio` | Añade Órdenes de laboratorio | nueva orden con varios exámenes, registrar resultado, transiciones de estado |
| `pediatra.pediatrico` | Añade Pediátrico | control de crecimiento (IMC calculado), dosis de vacuna |

1. Inicia sesión en <http://localhost:3000> con cada usuario. La navegación
   cambia con el rol y la institución; la interfaz es idéntica entre motores.
2. Registrando una alergia y recetando `Amoxicilina` (principio activo
   penicilina) se ve el aviso de advertencia: no bloquea, avisa.
3. Con un clic doble rápido sobre un guardado, el botón deshabilitado evita el
   409; si llega, el aviso muestra el mensaje del servidor.
4. Con `docker compose stop mysql`, la clínica muestra el aviso de servicio no
   disponible y el hospital sigue operando. `GET /health/motores` refleja el
   estado de cada motor.

## QA ejecutable

Bajo `frontend/qa/`, ejecutables con Node desde la raíz del proyecto:

```bash
# Lógica del frontend sin navegador (fechas, permisos, ApiError con 401/409/503).
node frontend/qa/humo-utilidades.cjs

# Flujos completos contra la API con las cuatro bases levantadas. Usa la
# misma SEED_CONTRASENA de .env y crea datos de prueba en cada corrida.
cd backend && npm start   # en otra terminal
SEED_CONTRASENA=... node frontend/qa/flujos-api.cjs
```

`flujos-api.cjs` reproduce por HTTP las llamadas y cuerpos que dispara la
interfaz: login de los 12 usuarios, pacientes, citas, historial, consultas con
advertencias y doble envío, órdenes y resultados de laboratorio, controles y
vacunas pediátricas, aislamiento entre instituciones, permisos (403), reglas de
negocio (422) y duplicados (409). Sale con código 1 si algo falla, así que sirve
como verificación rápida antes de integrar.

## Cobertura de QA ejecutada

- Flujos por API reproduciendo las llamadas y cuerpos exactos de la interfaz:
  login de los 12 usuarios, pacientes, citas, historial, consultas con
  advertencias y doble envío, órdenes y resultados de laboratorio, controles y
  vacunas pediátricas, aislamiento entre instituciones y permisos por rol
  (403), reglas de negocio (422) y 409 de duplicados. 92 verificaciones en
  verde sobre las cuatro bases levantadas.
- Caída de motor: con MySQL detenido, la clínica recibe 503 con mensaje
  amigable y el hospital responde 200. `/health/motores` marca
  `no_disponible` solo a la clínica.
- Suite del equipo: `npm test` en verde (124 pruebas de unidad y arquitectura).
- Pruebas de humo del propio frontend (formatos de fecha, permisos, ApiError
  con 401/409/503) ejecutadas en Node simulando el entorno del navegador.

## Recorrido manual sugerido (presentación o entrega)

1. Inicia como `secretaria.hospital`: registra un paciente menor con su
   representante y programa una cita para el `medico.hospital`.
2. Cierra sesión y entra como `medico.hospital`: abre el historial del menor,
   agrega una alergia y registra la consulta desde la cita que dejó la
   secretaria en la agenda.
3. Cierra sesión y entra como `laboratorista.laboratorio`: crea una orden para
   su paciente, registra el resultado con valores detallados y entrega la orden.
4. Cierra sesión y entra como `pediatra.pediatrico`: registra un control de
   crecimiento (IMC automático) y una dosis de vacuna del catálogo.
5. Con la clínica abierta, ejecuta `docker compose stop mysql` y recarga la
   vista de citas de la clínica: aviso de motor no disponible; entra al
   hospital y sigue funcionando.
