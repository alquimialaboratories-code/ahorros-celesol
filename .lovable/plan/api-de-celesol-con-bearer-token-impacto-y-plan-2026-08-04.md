# API de Celesol con Bearer Token — impacto y plan

## Situación actual (verificada)

- Toda consulta al sistema de origen pasa por una sola función de backend (`celesol-proxy`), en un único punto: la función `celesolFetch`, que hace `POST` a la URL guardada en el secreto `CELESOL_API_URL` con solo `Content-Type: application/json`. No hay autenticación hacia el sistema de origen hoy.
- El navegador nunca habla con la API de Celesol: solo llama a nuestro backend. Por lo tanto, agregar un bearer token **no afecta al frontend en absoluto**.
- Los secretos ya viven como variables de entorno del backend (`CELESOL_API_URL`, `EDNA_*`, `SMTP_*`, `INTERNAL_FN_SECRET`, etc.), leídos con `Deno.env.get`. El modelo que usan sus otros proyectos (GitHub + Kestra + variables de entorno) es el mismo que este proyecto ya aplica.

## Cambio necesario cuando la API pase a bearer token

1. Nuevo secreto de backend: `CELESOL_API_TOKEN` (y, si la URL cambia, actualizar `CELESOL_API_URL`).
2. Modificar únicamente `celesolFetch` para enviar `Authorization: Bearer <token>`.
3. Manejo de fallos de autenticación: distinguir `401/403` del upstream (token vencido o revocado) de una caída general, registrarlo en logs y devolver al cliente un mensaje genérico —sin filtrar detalles del origen, como ya se hace hoy.
4. El token es **fijo** (sin expiración ni refresh): no hace falta lógica de renovación ni cacheo. Solo leer el secreto y enviarlo en cada llamada.

> Este plan queda guardado para ejecutarlo cuando la API con bearer token esté efectivamente disponible. No se aplica ningún cambio al proyecto hasta entonces.


Impacto de esfuerzo: bajo. Un solo punto de cambio en el código, más el alta del secreto.

## Rotación de claves

Al pasar a token, la rotación se vuelve una tarea operativa periódica:
- Si el token se rota manualmente: actualizar el secreto en el proyecto y la función se recarga sola. No requiere despliegue de código.
- Recomendación: documentar quién posee el token, su vigencia y el procedimiento de rotación, para no depender de una sola persona.

## Qué se justifica automatizar/vincular con Kestra

Kestra aporta valor donde hay tareas programadas o de integración entre sistemas, no dentro del flujo de consulta del socio (que debe ser sincrónico y de baja latencia).

Candidatos con buen retorno:
- **Renovación de ahorros**: hoy la solicitud se guarda y se notifica por WhatsApp/email. Un flujo Kestra podría tomar cada solicitud nueva y orquestar el resto del circuito (registro en el sistema de gestión, seguimiento, recordatorios, escalamiento si no se procesa en X horas).
- **Refresco de tasas de mercado**: hoy la caché de PF, FCI y LECAP se refresca por demanda cada 6 horas, con lo cual el primer usuario del día paga la espera y una caída de la fuente deja datos viejos. Un flujo programado de Kestra que dispare el refresco cada N horas y alerte si una fuente falla mejora la experiencia y da visibilidad.
- **Monitoreo de salud de la API de Celesol**: un flujo que verifique periódicamente que el token sigue siendo válido y que la API responde, y avise por WhatsApp/email antes de que lo note un socio. Esto cobra especial sentido justamente con la llegada del token (vencimientos, revocaciones).
- **Higiene de datos**: limpieza programada de OTPs y sesiones vencidas, y de registros de envío de correo antiguos.

Candidatos que **no** conviene mover a Kestra:
- Login, OTP y consulta de ahorros: son interactivos y deben seguir en el backend de la app.
- Guardar los secretos "en Kestra" para que la app los lea: agregaría una dependencia externa en el camino crítico. Los secretos de la app deben seguir en su propio entorno; si Kestra necesita el token, se lo carga como secreto propio en Kestra.

## Recomendación de secuencia

1. Recibir del proveedor el token fijo y la URL definitiva.
2. Dar de alta el secreto y aplicar el cambio en `celesolFetch` + manejo de 401/403.
3. Probar login y consulta de ahorros de punta a punta con un usuario de prueba.
4. Recién después, evaluar los flujos de Kestra, empezando por monitoreo de salud y refresco de tasas (bajo riesgo, valor inmediato).

## Detalle técnico

- Único archivo a tocar para el token: `supabase/functions/celesol-proxy/index.ts`, función `celesolFetch` (líneas ~68-82).
- Secreto nuevo: `CELESOL_API_TOKEN` (token fijo).
- Sin cambios en frontend, base de datos ni en las demás funciones.
- Para los flujos Kestra: se expondrían endpoints internos protegidos con el `INTERNAL_FN_SECRET` ya existente, para que Kestra los invoque sin credenciales nuevas de usuario.
