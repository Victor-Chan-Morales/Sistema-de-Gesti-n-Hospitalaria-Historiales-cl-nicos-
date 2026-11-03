# ADR-002: Localizar al usuario entre motores al iniciar sesión

**Estado:** aceptada.

## Contexto

Cada institución guarda sus usuarios en su propio motor. Al iniciar sesión, el backend todavía no sabe a qué institución pertenece el usuario, pero el enunciado pide dirigirlo automáticamente a su motor.

## Decisión

El login consulta todos los motores implementados en paralelo, con un timeout de 2 segundos por motor, y responde con la primera coincidencia sin esperar a los demás.

| Situación | Respuesta |
|---|---|
| Usuario encontrado y contraseña correcta | 200, aunque otro motor esté caído |
| Contraseña incorrecta o usuario inactivo | 401 |
| Nadie lo encuentra y todos los motores respondieron | 401 |
| Nadie lo encuentra y algún motor no respondió | 503: no se puede afirmar que el usuario no exista |

Si el usuario no existe, igual se ejecuta bcrypt contra un hash ficticio, para que el tiempo de respuesta no revele qué nombres existen.

## Rendimiento

La búsqueda es por un campo indexado de una tabla pequeña, y el volumen de datos clínicos no influye. Solo ocurre al iniciar sesión: después, el claim `id_institucion` del JWT dirige cada petición a un único motor.

## Alternativas descartadas

- **Selector de institución en el login:** el usuario elige manualmente, lo que cumple peor el "dirigir automáticamente" del enunciado.
- **Directorio central:** crea una dependencia entre instituciones que son dueñas de sus datos, y hay que mantenerlo sincronizado.
- **Prefijo en el nombre de usuario:** evita consultar varios motores, pero liga el nombre a la institución.

## Consecuencias

- `usuario` debe ser único entre **todas** las instituciones, y ningún motor puede imponerlo por sí solo. Se resuelve con la convención `<rol>.<institución>` (`medico.hospital`). Si dos instituciones repitieran un nombre, ganaría el motor que responda primero.
- MongoDB necesita un índice único sobre `usuario`.
- Un motor aún no implementado no participa: no cuenta como caído.
