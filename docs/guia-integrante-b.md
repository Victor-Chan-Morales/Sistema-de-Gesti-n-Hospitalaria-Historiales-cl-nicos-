# Guía para implementar los adaptadores de MongoDB y Firebase

Un adaptador es correcto si pasa la misma suite de contrato que PostgreSQL y MySQL. No hay que tocar el dominio, los casos de uso ni las rutas.

## Pasos

1. Instala el driver: `npm install mongodb` o `npm install firebase-admin`.
2. Crea `backend/src/adapters/persistence/mongo/index.js` (o `firebase/`) con esta forma:

   ```js
   function crearAdaptador(etiqueta) {
     return {
       usuarios: { /* ... */ },
       pacientes: { /* ... */ },
       historiales: { /* ... */ },
       citas: { /* ... */ },
       consultas: { /* ... */ },
       catalogos: { /* ... */ },
       salud: { /* ... */ },
       cerrar: async () => { /* cierra la conexión */ },
     };
   }
   module.exports = { crearAdaptador };
   ```

3. Implementa los métodos de `backend/src/ports/repositorioClinico.js`. Ese archivo documenta qué recibe y qué devuelve cada uno. `tests/unit/apoyo/repoMemoria.js` es un ejemplo completo y sin dependencias.
4. Regístralo en `backend/src/factory/repositoryFactory.js`, reemplazando `null`:

   ```js
   mongo: (etiqueta) => require('../adapters/persistence/mongo').crearAdaptador(etiqueta),
   ```

   Con eso, el motor participa automáticamente en el login.
5. Agrega sus datos de prueba en un seeder propio. Usa `id_institucion` 3 (laboratorio) o 4 (pediátrico) y nombres de usuario con la convención `<rol>.<institución>`, como `laboratorista.laboratorio`. Deben ser únicos entre todas las instituciones.
6. Agrega su prueba, copiando `tests/integracion/postgres.test.js`:

   ```js
   ejecutarSuiteContrato('MongoDB', {
     crearRepos: () => crearAdaptador('Laboratorio Clínico'),
     idInstitucion: 3,
     usuarioAdministrador: 'admin.laboratorio',
     usuarioProfesional: 'laboratorista.laboratorio',
   });
   ```

## Lo que hay que cuidar

- **IDs:** devuélvelos siempre como string. Un ID con formato inválido para el motor (por ejemplo, `abc` como `ObjectId`) debe equivaler a "no existe", nunca a un error del driver.
- **Tipos:** fechas `YYYY-MM-DD`, fecha y hora `YYYY-MM-DDTHH:MM:SS`, decimales como `number`, campos sin valor como `null`. Evita los `Timestamp` de Firestore y los `Date` de Mongo en las respuestas.
- **Errores:** traduce los del driver a los de `domain/errores.js`. Un motor inalcanzable debe lanzar `new MotorNoDisponible(etiqueta)`; así, el frontend muestra el aviso amigable.
- **Referencias:** la suite espera `DatosInvalidos` si se referencia un medicamento, un diagnóstico o una alergia inexistentes. Sin claves foráneas, hay que comprobarlo a mano.
- **Unicidad:** `usuario` y `dpi_o_documento` son únicos. En MongoDB, crea índices únicos, también porque el login busca por `usuario`. En Firestore no existen: valida dentro de una transacción.
- **Atomicidad:** `registrarAtencion` debe guardar todo o nada, incluida la auditoría. La suite fuerza un fallo en la receta y comprueba que no quede nada. Usa transacciones multi-documento en MongoDB y transacciones de Firestore en Firebase.
- **Concurrencia:** la suite envía dos consultas idénticas a la vez y espera que solo una se guarde. Los batched writes de Firebase no leen, así que esta verificación necesita una transacción (`runTransaction`).
- **Auditoría:** cada escritura guarda `{ id_usuario, accion, entidad, id_entidad, fecha_hora }` en una colección `auditoria`, dentro de la misma transacción.

## Comandos

```bash
cd backend
npm test                                                   # sin Docker
node --test tests/integracion/mongo.test.js                # tu motor
npm run test:integracion                                   # todos los motores
```

## Por acordar

- Qué hace `Laboratorista` en el flujo de consultas, ya que el laboratorio trabaja con órdenes y resultados.
- Si órdenes, resultados, controles de crecimiento y vacunas se exponen como puertos adicionales. No forman parte del contrato común; se pueden añadir en un puerto propio sin afectar a los demás motores.
