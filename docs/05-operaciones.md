# Operaciones

Operaciones que la aplicación realiza sobre los datos, descritas en lenguaje sencillo (punto de partida de la Entrega II). No dicen cómo se implementan: todas se comportan igual en las cuatro instituciones, aunque cada una guarde los datos en un motor distinto. La ruta de la API está entre paréntesis como referencia; el detalle de cada una está en [`06-api-contratos.md`](06-api-contratos.md).

## Sesión

1. **Entrar al sistema.** El usuario escribe su usuario y su contraseña. Si son correctos, el sistema sabe a qué institución pertenece y qué puede hacer, y desde ese momento solo trabaja con los datos de esa institución (`POST /api/auth/login`).
2. **Ver quién soy.** Muestra el nombre, el rol y la institución de la persona conectada (`GET /api/auth/yo`).

## Pacientes

3. **Buscar un paciente** por nombre, apellido, documento o estado (`GET /api/pacientes`).
4. **Registrar un paciente nuevo** con sus datos personales, teléfonos, correos, contactos de emergencia y, si es menor de edad, al menos un representante legal. Al registrarlo se le abre su historial clínico (`POST /api/pacientes`).
5. **Ver la ficha de un paciente** (`GET /api/pacientes/:id`).
6. **Corregir los datos de un paciente** (`PATCH /api/pacientes/:id`).
7. **Dar de baja a un paciente** por traslado, fallecimiento u otra causa. Se indica el motivo; el paciente queda archivado o inactivo y su historial se cierra, pero nada se borra. Sus citas que seguían programadas se cancelan, y ya no recibe citas ni consultas nuevas (`POST /api/pacientes/:id/archivar`).

## Historial clínico

8. **Ver el historial completo** de un paciente: alergias, antecedentes y consultas anteriores (`GET /api/pacientes/:id/historial`).
9. **Anotar una alergia** (`POST /api/pacientes/:id/alergias`).
10. **Anotar un antecedente** personal, familiar, quirúrgico, etc. (`POST /api/pacientes/:id/antecedentes`).

## Citas

11. **Ver la agenda**, filtrada por paciente, profesional, estado o fechas (`GET /api/citas`).
12. **Programar una cita** con un profesional activo, en una fecha futura y para un paciente activo (`POST /api/citas`).
13. **Reprogramar, cancelar o marcar que el paciente no asistió.** Una cita atendida, cancelada o no asistida ya no cambia (`PATCH /api/citas/:id`).

## Consultas

14. **Registrar la atención de un paciente:** motivo, síntomas, examen físico, signos vitales, diagnósticos, tratamientos y receta. Se guarda todo junto: si algo falla, no se guarda nada. Si la consulta viene de una cita, la cita queda como atendida (`POST /api/consultas`).
15. **Ver una consulta** con todo su detalle (`GET /api/consultas/:id`).
16. **Agregar un diagnóstico, un tratamiento o una receta** a una consulta que ya existe. Al recetar, el sistema avisa si un medicamento parece relacionado con una alergia del paciente, pero la decisión es del profesional (`POST /api/consultas/:id/diagnosticos`, `/tratamientos`, `/recetas`).
17. **Finalizar o anular una consulta.** Una consulta anulada queda en el historial, pero ya no admite datos nuevos. Si la consulta venía de una cita atendida, la cita pasa a cancelada (`PATCH /api/consultas/:id/estado`).

## Catálogos

18. **Consultar las listas de apoyo:** diagnósticos, medicamentos, tipos de alergia y profesionales de la institución (`GET /api/catalogos/...`).

## Laboratorio Clínico

19. **Ver los tipos de examen** que ofrece el laboratorio (`GET /api/laboratorio/tipos-examen`).
20. **Crear una orden de exámenes** para un paciente (`POST /api/laboratorio/ordenes`).
21. **Ver las órdenes** y el detalle de cada una (`GET /api/laboratorio/ordenes`, `/ordenes/:id`).
22. **Avanzar el estado de una orden:** pendiente, en proceso, finalizada, entregada o cancelada (`PATCH /api/laboratorio/ordenes/:id/estado`).
23. **Cargar el resultado de un examen.** Cada tipo de examen tiene sus propios parámetros: una hematología no tiene los mismos campos que un examen de orina (`POST /api/laboratorio/ordenes/:id/resultados`).

## Centro Médico Pediátrico

24. **Registrar un control de crecimiento** (peso, talla, perímetro cefálico; el IMC se calcula si no se indica) y ver los anteriores (`/api/pediatria/pacientes/:id/controles`).
25. **Registrar una dosis de vacuna** y ver el esquema aplicado, con la fecha de la próxima dosis (`/api/pediatria/pacientes/:id/vacunas`).
26. **Consultar el catálogo de vacunas** (`GET /api/pediatria/vacunas`).

## Lo que ocurre en todas las operaciones

- Solo se ven y se modifican datos de la institución del usuario.
- Cada rol tiene sus permisos: por ejemplo, una secretaria programa citas, pero no registra diagnósticos ([`07-seguridad.md`](07-seguridad.md)).
- Cada cambio queda anotado con su autor y su fecha en la auditoría.
- Si el mismo formulario se envía dos veces seguidas, el segundo envío se rechaza.
