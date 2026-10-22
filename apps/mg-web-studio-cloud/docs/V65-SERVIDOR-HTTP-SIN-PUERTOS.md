# MG WEB STUDIO CLOUD — V65 | Configuración HTTP segura sin apertura de puertos

**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** código y pruebas automatizadas aisladas. **No se habilitó ningún servidor de red**, no hubo conexiones a Supabase, SQL, migraciones, despliegues ni publicación.

## Resultado

Se creó `server/http-server-blueprint-v65.cjs` como **plan de configuración** para un servidor `node:http` que se podría construir en una etapa posterior. Este módulo **no importa ni ejecuta `http.createServer()`, `listen()` o `connect()`**.

El factory `createHttpServerBlueprint({ serve })` necesita la función explícita V64 `serve(req,res)`. Devuelve tres campos:

- `options`: opciones inmutables para un eventual `http.createServer(options, onRequest)`.
- `onRequest`: delega a V64 y sanitiza excepciones inesperadas.
- `configure(server)`: añade manejadores de seguridad **antes** de que el servidor escuche; rechaza explícitamente un objeto con `listening !== false` y evita registrar los mismos handlers dos veces.

## Límites preparados

| Ajuste | Valor V65 | Alcance |
|---|---:|---|
| `maxHeaderSize` | 16 KiB | Límite propuesto del parser Node |
| `maxHeadersCount` | 32 | Límite de cabeceras por servidor |
| `insecureHTTPParser` | `false` | No habilitar parser permisivo |
| `joinDuplicateHeaders` | `false` | V63/V64 inspeccionan `rawHeaders` originales |
| `requireHostHeader` | `true` | Host obligatorio en HTTP/1.1 |
| `headersTimeout` | 5000 ms | Timeout de cabeceras |
| `requestTimeout` | 10000 ms | Tiempo máximo de recepción |
| `keepAliveTimeout` | 1000 ms | Evitar conexiones persistentes prolongadas |
| `maxRequestsPerSocket` | 1 | Restringir reutilización de conexiones |
| `server.setTimeout` | 5000 ms | Destruir sockets inactivos |

El módulo añade respuestas genéricas y conexión cerrada ante errores de parser (`400` o `431`), `Expect: 100-continue` u otras expectativas (`417`), saturación `dropRequest` (`503`); rechaza `upgrade` y `CONNECT` sin permitir túneles. Los cuerpos internos y cabeceras de error no incluyen credenciales o paquetes recibidos.

**Estos límites no están activos en STAGING ni producción.** Hasta que exista y se despliegue un servidor real, son únicamente un objeto de configuración y manejadores verificables en laboratorio.

## QA realizado

Entorno del agente con Node.js `v22.16.0`, sin iniciar listeners ni abrir puertos.

```sh
cd apps/mg-web-studio-cloud
node --test tests/http-server-blueprint-v65.test.cjs tests/http-server-v65-integration.test.cjs
```

**30/30 pruebas correctas, cero fallos:**
- **21 unitarias**: validación de opciones y fábrica, comprobación de límites, eventos `clientError`, `upgrade`, `connect`, `checkContinue`, `checkExpectation`, `dropRequest`, timeout, respuesta genérica y construcción de objeto real `node:http.Server` sin `listen()`.
- **9 de integración sintética**: cadena **V65 → V64 → V63**, con solicitudes `EventEmitter` y autorizador de prueba. Casos: lectura aprobada, sin credenciales, doble Authorization, empresa ajena, cambio de membresía, cuerpo no permitido, POST denegado, WebSocket/Expect rechazados y garantía de no abrir puertos.

Para ejecutar la integración se usaron **exactamente los archivos fuente V63 y V64 de la rama** (verificados mediante Git blob). No se usaron JWT reales, bases de datos, credenciales o tráfico TCP.

## Límites que impiden declararlo listo para producción

1. El control V65 **no es un servidor funcionando**. Requiere futura decisión explícita sobre el entorno de pruebas, interfaz, host, puerto, firewall, TLS y publicación; no usar por defecto `0.0.0.0`. Construir un `http.Server` sin `listen()` no equivale a demostrar defensas de red.
2. No hay protección de proxy inverso, balanceador, HTTP/2, request smuggling, parser real bajo ataque, límite de conexiones concurrentes ni rate limiting distribuido.
3. Los timeouts de Node y V64 **no cancelan necesariamente el trabajo de autenticación/SQL** ya enviado; falta timeout efectivo del driver y contención de recursos.
4. V60 utiliza un verificador JWT inyectado; no está implementada ni probada la verificación criptográfica real de emisor, audiencia, caducidad, MFA y revocación. V61/V62 todavía no han ejecutado consultas de autorización con Postgres real.
5. Falta comprobar ACL/RLS, permisos mínimos, propiedad de recursos y auditoría en un entorno autorizado; para mutaciones deberán evitarse carreras TOCTOU con verificaciones dentro de transacciones.
6. El ensayo de recuperación PostgreSQL permanece pausado, sin nueva evidencia de espacio disponible en C:. Sin recuperación probada no hay autorización para producción.

## Continuidad propuesta

**V66**: endurecimiento de presupuestos por conexión/solicitud, política de observabilidad sin secretos y plan de pruebas del parser real en un entorno explícitamente autorizado; continuar sin exposición de red, credenciales, migraciones ni gastos mientras no se apruebe el entorno.

## Archivos

- `server/http-server-blueprint-v65.cjs`
- `tests/http-server-blueprint-v65.test.cjs`
- `tests/http-server-v65-integration.test.cjs`
- `docs/V65-SERVIDOR-HTTP-SIN-PUERTOS.md`

**Dictamen:** V65 completada a nivel de código y QA aislado (**30/30**). **STAGING, recuperación real y producción: NO GO.**
