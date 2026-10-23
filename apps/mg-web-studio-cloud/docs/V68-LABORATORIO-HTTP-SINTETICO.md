# MG WEB STUDIO CLOUD — V68 | Laboratorio HTTP sintético y reproducible

**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** Código, fixtures y tests sin conectar servidores, bases de datos, herramientas externas ni Supabase. **NO GO** para uso real, publicación y recuperación.

## Qué se creó

- `server/offline-http-harness-v68.cjs`: `createOfflineHttpHarness({onRequest,deadlineMs})`. Emite eventos sintéticos de `node:events` con forma de `IncomingMessage` y captura únicamente estados HTTP y coincidencia esperada. Nunca usa `listen`, `http.createServer`, `net`, `fetch`, credenciales ni acceso externo.
- `server/offline-http-fixtures-v68.cjs`: 15 casos **fijos**, con UUID, direcciones loopback y tokens ficticios: respuesta positiva, sin token, Authorization duplicado, Content-Length duplicado, Transfer-Encoding, POST, ruta inválida, cuerpos pequeño/grande, Content-Length no cero, token inválido, otra empresa, cabeceras falsas de rol y origen, segundo peer.
- `tests/offline-http-harness-v68.test.cjs`: pruebas de validación de fixtures, eventos sintéticos, tratamiento de fallos, errores sin filtración, duplicados, seguridad del registro y tiempos máximos del simulador.

### Distinción esencial de evidencia

Estos casos **NO** son paquetes HTTP en bruto ni utilizan el parser de red de Node. Un `EventEmitter` sintético **no detecta** problemas reales de framing, request smuggling, normalización de proxies, TLS, TCP, retransmisiones ni conexiones WebSocket. Los tests se ejecutaron contra un **transporte simulado** inyectado con reglas deterministas; no constituyen una prueba end-to-end de V63–V66. Los módulos V63–V66 no se modificaron en V68.

El resultado de la suite fija `evidenceClass=SYNTHETIC_NODE_EVENTS`, `realHttp=false`, `realParser=false`, `realAuth=false`, `realDatabase=false`, `recoveryVerified=false`, `v67OperationalCasesPassed=0` y `decision=NO_GO`, **incluso si todos los casos coinciden**. Los **32 controles operativos V67 permanecen PENDING** hasta que se recoja evidencia independiente en un laboratorio autorizado.

### Ejecución local

Desde `apps/mg-web-studio-cloud`:

```sh
node --test tests/offline-http-harness-v68.test.cjs
```

**Resultado realmente ejecutado:** Node.js **22.16.0**, **25/25 pruebas correctas**, cero fallos. Una prueba del corpus comprueba las **15/15 coincidencias** con el transporte simulado. La ejecución no abrió ningún puerto ni consultó proyectos de clientes.

El simulador impone hasta 64 casos por suite, 4 fragmentos de máximo 8192 bytes por caso, nombres acotados, lista cerrada de métodos y dos pares loopback ficticios. `deadlineMs` admite valores entre 10 y 5000 ms; ante espera prolongada se devuelve una falta de coincidencia, **sin prometer cancelar el trabajo interno** del manejador inyectado. Los resultados nunca copian la URL, cuerpo, token, cabeceras, IP ni excepciones, solo el ID sintético y estado HTTP observado.

## Pruebas operativas futuras (todavía NO ejecutadas)

1. Aprobar expresamente un entorno de laboratorio aislado, interfaces, puerto, límites y procedencia de identidades de prueba; no abrir conexiones hasta ello.
2. Construir un servidor local con V65 y su capa V66→V64→V63, protegiendo la conexión con los timeouts, parser y restricciones de infraestructura; documentar versiones de Node y proxy.
3. Ejecutar **paquetes HTTP reales** para los 14 controles `HTTP-01..HTTP-14` de V67, incluyendo cabeceras duplicadas, Host, Content-Length/Transfer-Encoding, bytes inválidos, cierre anticipado, lentitud, upgrade/CONNECT y errores del parser. No sustituir esos resultados por V68.
4. Comprobar por separado JWT real, revocación/MFA, grants/RLS PostgreSQL, aislamiento multiorganización y tiempo máximo de consultas.
5. Completar restauración PostgreSQL 17 en un destino aislado, verificación de esquemas/políticas/conteos, RPO/RTO y retención; el ensayo sigue pendiente, sin cambios en STAGING.
6. Revisar evidencia, responsables y autorizaciones antes de considerar siquiera un cambio de estado de publicación. La decisión de despliegue permanece independiente y expresamente bloqueada.

**Resultado V68:** laboratorio sintético preparado y probado; ninguna conexión de red, SQL, migración, publicación, consumo de créditos Lovable ni modificación de STAGING/producción.
