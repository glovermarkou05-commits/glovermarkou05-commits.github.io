# MG WEB STUDIO CLOUD — V64 | Adaptador de transporte HTTP aislado

**Rama:** `feature/mg-digital-v5-web-services`  
**Resultado:** módulo Node.js CommonJS, pruebas automáticas con streams sintéticos, sin servidores escuchando ni despliegue. **STAGING y producción: NO GO.**

## Entregables

- `server/node-http-transport-v64.cjs` exporta `createNodeHttpTransport({ gate, deadlineMs = 3000, maxBodyBytes = 4096, makeRequestId })`.
- `tests/node-http-transport-v64.test.cjs`: 27 casos automatizados ejecutados con Node.js 22.16.0.
- Este documento establece las condiciones de integración.

El factory devuelve una función `serve(req, res)` para un `http.IncomingMessage` y un `http.ServerResponse` futuros. **No llama a http.createServer(), listen(), connect() ni accede a la red, credenciales o base de datos.** Su dependencia `gate` se inyecta desde el servidor y está prevista para ser la función V63. No se ha conectado a V63 mediante un servidor real.

## Contrato de entrada y respuesta

V63 exige una solicitud `GET /api/v1/organizations/:orgUuid/sites/:siteUuid/access` sin cuerpo; V64 prepara el sobre con `method`, `target`, `rawHeaders` intactas y `Buffer.alloc(0)` **únicamente después de recibir fin de stream completo**. Nunca remite credenciales normalizadas, roles de cabeceras ni un cuerpo del navegador.

Antes de activar la lectura del stream:

1. Se exige `rawHeaders` como matriz par `[nombre,valor,...]`, hasta **64 entradas** (**32 parejas**). Se rechazan nombres/valores malformados, caracteres de control, cabeceras duplicadas (incluso Authorization y Content-Length con distinto uso de mayúsculas).
2. Se limita el total de cabeceras a **16 KiB**, con valores individuales de hasta **8192 caracteres**; se deniegan `Transfer-Encoding`, `Expect`, `Cookie`, `Proxy-Authorization`, `Trailer` y `Upgrade`. `Content-Length` solamente puede ser `0`.
3. Se escucha el cuerpo del mensaje con eventos de Node. Como **la ruta V63 no admite cuerpo**, cualquier fragmento no vacío se rechaza inmediatamente (400), y uno que excede `maxBodyBytes` se rechaza 413, sin agregar ni conservar ese fragmento. Se verifica `req.complete === true` y que no existan trailers.
4. El plazo máximo de manejo se mide desde la entrada hasta la respuesta (valor por defecto **3000 ms**): el stream incompleto devuelve 408, el gate que no responde devuelve 503. Se limpian temporizador y listeners al finalizar; se conserva un listener de error de un solo uso para absorber errores tardíos del stream.
5. Las respuestas tienen JSON mínimo, `no-store`, `nosniff` y `Connection: close`. Las respuestas del gate solo se propagan si tienen un código esperado, estructura JSON cerrada y ningún campo adicional de datos privados; nunca se reenvían cabeceras arbitrarias del gate.
6. Una conexión cerrada antes de finalizar la solicitud no recibe respuesta y resuelve `null`. Una respuesta tardía del gate no produce una segunda escritura.

El adaptador está intencionalmente limitado a **la operación de lectura V63**: ni POST, ni publicación, ni mutaciones, ni formularios con cuerpo están admitidos.

## QA realmente ejecutado

Comando desde `apps/mg-web-studio-cloud`:

```sh
node --test tests/node-http-transport-v64.test.cjs
```

**27/27 casos correctos, cero fallos**, en Node.js **22.16.0**. Los tests utilizan `EventEmitter` para simular `IncomingMessage`, una respuesta de prueba y un gate sintético compatible con el formato V63. Verifican configuración obligatoria, manejo de cabeceras duplicadas, framing prohibido, topes, rutas sin cuerpo, respuesta segura, desconexión, timeout, promesas tardías, errores de stream, fallos del gate y concurrencia.

**No se ejecutó un servidor ni tráfico HTTP real, ni la suite completa V60–V63 en esta sesión.** Las pruebas V64 no acreditan integridad de mensajes a través de proxies, protección contra request smuggling, Node `clientError`, TLS ni velocidad de red.

## Límites y requisitos antes de desplegar

- El adaptador no crea ni configura `http.Server`; el futuro servidor deberá tener `maxHeaderSize`, `headersTimeout`, `requestTimeout`, límites de conexiones, política de upgrades, `clientError` y manejo seguro de proxies con valores revisados. Estos controles **no están operativos** por existir el módulo V64.
- El plazo V64 deja de escuchar y responder, **pero no cancela automáticamente el trabajo remoto del gate** (por ejemplo, una consulta PostgreSQL que quedó ejecutándose). El futuro driver debe tener timeout y cancelación propios y un límite de concurrencia; tampoco hay rate limiting ni presupuesto por identidad/IP.
- Node puede descartar o combinar algunas cabeceras en `req.headers`; por eso V64/V63 solo aceptan `req.rawHeaders`. Es obligatorio controlar la capa de proxy anterior, donde podría normalizarse o rechazarse tráfico antes de llegar al código.
- No se han validado autenticación JWT real, revocación de sesiones real, MFA, permisos reales PostgreSQL/RLS/GRANT, propiedad de recursos concretos, recuperación ni protección transaccional frente a carreras.
- Los valores de `deadlineMs` y `maxBodyBytes` son topes de laboratorio, no una política final de producción; el stream se debe limitar además en infraestructura. El máximo de cuerpo clasifica como 413 un fragmento demasiado grande; el permiso funcional sigue siendo **cero bytes**.
- No se realizó SQL, migración, conexión Supabase, descarga de imágenes, cambio de costos, publicación web ni modificación de otros proyectos. La recuperación de PostgreSQL sigue pausada por las limitaciones locales reportadas anteriormente.

## Trazabilidad y siguiente etapa

- Fuente V63: `server/http-site-gate-v63.cjs`.
- Fuente V64: `server/node-http-transport-v64.cjs`; Git blob **`5ff67d7b6117e99ed9beb0b29b1def6ee4f6749a`**.
- Test V64: `tests/node-http-transport-v64.test.cjs`; Git blob **`ea56ca161fa29db80acb74252e40df1aa3b8f181`**.
- **V65 sugerida**: preparar configuración segura del servidor HTTP y una prueba de integración de V63+V64 en laboratorio exclusivamente aislado, con autorización explícita antes de abrir incluso un puerto loopback. Mantener la conexión a Auth real, STAGING y producción bloqueada hasta cumplir las puertas de seguridad y recuperación.

**Dictamen:** V64 desarrollada y aprobada solo mediante QA local con datos sintéticos; integración operativa, autenticación real y publicación **NO GO**.
