# MG WEB STUDIO CLOUD — V69 | Ensamblaje HTTP aislado y revisión de laboratorio

**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** V69 desarrollada, probada con servicios sintéticos y guardada en GitHub; sin listeners, HTTP por red, PostgreSQL remoto ni autenticación real. **STAGING y producción: NO GO.**

## 1. Qué se implementó

Se creó `server/unbound-tenant-stack-v69.cjs`, que exporta `assembleUnboundTenantHttpV69({verifyAccessToken,query,observe?,makeRequestId?})`. Ensambla explícitamente siete fábricas de servidor ya existentes, en este orden:

1. **V60** — `createAuthBoundary`: exige un **verificador de tokens inyectado**. El ensamblador no verifica firmas JWT por sí mismo ni agrega un autenticador permisivo.
2. **V62** — `createPgTenantRepository`: exige una función `query({text,values})` inyectada. El ensamblador **no crea conexión**, credencial, pool, driver PostgreSQL ni cliente Supabase.
3. **V61** — `createTenantAuthorizer`: enlaza autenticación y repositorio de empresa, membresía y ámbito del sitio.
4. **V63** — `createHttpSiteGate`: restringe el endpoint conceptual a lectura `GET`, ruta exacta, cabeceras crudas y respuesta pública mínima.
5. **V64** — `createNodeHttpTransport`: revisa flujo de entrada, límites, finalización y respuesta.
6. **V66** — `createRequestBudget`: administra presupuestos locales de solicitudes/concurrencia y telemetría de esquema cerrado.
7. **V65** — `createHttpServerBlueprint`: expone opciones para un servidor HTTP de Node y el configurador de controles para un servidor **aún no enlazado**.

El resultado es únicamente `{serverOptions,onRequest,configureUnboundServer,readiness}`, sin `listen()`, sin llamada automática a `http.createServer()`, sin puerto, sin servidor iniciado y sin conexión de red. El objeto de `readiness` es inmutable y siempre indica `networkAuthorized=false`, `deploymentAuthorized=false` y `decision=NO_GO`.

El código admite un segundo parámetro opcional con las siete fábricas para **pruebas unitarias exclusivamente**; su proveedor es código de servidor confiable, **nunca una solicitud HTTP**, cuerpo de cliente o una configuración publicada. La ruta normal carga los módulos reales; no debe permitirse elegir componentes desde el navegador.

## 2. Revisión de propuestas de laboratorio

El módulo `server/lab-proposal-v69.cjs` exporta `reviewLabProposalV69(proposal)`, sin recursos externos ni acciones. Solo considera formalmente apta para revisión una propuesta con:

| Campo | Condición de laboratorio | Estado |
| --- | --- | --- |
| `interface` | `127.0.0.1` o `::1` | Se valida el formato |
| `port` | Puerto explícito entero entre 1024 y 65535 | Ningún puerto se abre |
| `transport` | `HTTP_ONLY_LOOPBACK` | Nunca tráfico externo |
| `database` | `SYNTHETIC_ONLY` | Sin conexión PostgreSQL |
| `identities` | `SYNTHETIC_ONLY` | Sin JWT o cuentas reales |
| `exposure` | `LOCAL_MACHINE_ONLY` | Sin LAN, VPN, nube o internet |
| `purpose` | `HTTP_PARSER_VALIDATION` | No despliegue/publicación |
| `nodeMajor` | Versión mayor entre 22 y 26 | Revisión de compatibilidad futura |

Los parámetros desconocidos se rechazan. El evaluador nunca comunica tokens, IP, puertos ni credenciales en su resultado. Una propuesta formalmente apta **todavía no está autorizada**: `portOpened=false`, `labAuthorized=false`, `deploymentAuthorized=false`, `httpParserTested=false` y `NO_GO`. Es indispensable una autorización humana **separada** del destino concreto antes de usar `listen()`.

## 3. QA realmente realizado

**Pruebas unitarias en Node.js v22.16.0, sin red:**

```sh
cd apps/mg-web-studio-cloud
node --test tests/unbound-tenant-stack-v69.test.cjs tests/lab-proposal-v69.test.cjs
```

**32/32 correctas, cero fallos**: 17 de ensamblaje y 15 de revisión de propuestas; usan componentes de prueba inyectados, no los módulos originales. Incluyen validación de proveedores obligatorios, rechazo de `port`/`listen`/producción como parámetros, identidad y permiso simulados, aislamiento de instancias, ausencia de llamadas al proveedor antes de procesar solicitudes, `http.Server` **creado sin `listen()`**, decisión `NO_GO` y restricciones de loopback.

**Verificación lógica adicional de integración, también sin red:** se cargó el código original de los ocho módulos **V60, V61, V62, V63, V64, V65, V66 y V69** desde la rama GitHub en un aislado JavaScript/V8; se reemplazaron primitivas de Node por implementaciones de prueba, y se inyectaron token y respuestas de `query` sintéticos. **7/7 casos correctos** usando la suite `tests/unbound-tenant-stack-v69-real.test.cjs`: lectura válida, token inválido, doble Authorization, empresa ajena, membresía revocada, scope retirado y método POST denegado. Un resultado preliminar de empresa ajena se corrigió en el **fixture de consulta**, que inicialmente devolvía la misma organización para cualquier ID; la repetición final pasó 7/7.

Esta verificación **NO es una ejecución nativa de esa suite bajo Node.js con los módulos completos**; sus primitivas estuvieron simuladas. La suite queda guardada en el repositorio para ejecutarse posteriormente con Node nativo y comprobar el contrato sin red.

**Importante:** las 39 verificaciones nuevas (32 Node + 7 en aislado V8) no implican 39 pruebas TCP, un JWT criptográficamente verificado o una base real. Los **32 controles operativos V67 siguen PENDING** y no se suman ni se marcan PASS.

## 4. Controles que siguen pendientes

- **Parser HTTP real:** aun no se enviaron solicitudes TCP, se revisaron proxies ni se probaron cabeceras/framing bajo un parser Node real. Para ello se requiere autorización específica de loopback, puerto, equipo, límites y ventana; se deben registrar resultados independientes por cada caso V67.
- **Identidad:** V60 requiere un proveedor que verifique firma, emisor, audiencia, caducidad, revocación y condiciones MFA reales. El callback V69 únicamente se inyecta; no asegura por sí solo el nivel de confianza.
- **Base de datos:** V62 sigue sin cliente de PostgreSQL ni validación con roles de mínimo privilegio, TLS, GRANT/RLS reales, timeouts/cancelación de consultas y controles transaccionales.
- **Concurrencia:** V66 limita solicitudes en curso dentro del proceso, no sockets reales ni el trabajo de consultas que sobreviva a timeout del transporte.
- **Recuperación:** el ensayo PostgreSQL 17 permanece pendiente. No se solicitó ninguna credencial, copia, restore ni consulta a STAGING.
- **Observabilidad:** la salida mínima V66 no constituye aún un sistema de retención, alertas y respuesta a incidentes.

Se revisó la documentación vigente para Node v22 `http.createServer(options, requestListener)`, `server.listening` y sus parámetros de timeout/headers. Referencia técnica: https://nodejs.org/download/release/v22.23.3/docs/api/http.html . La validación de opciones **sin `listen()`** no acredita comportamiento sobre sockets reales.

## 5. Restricciones de cambios

**No se ejecutó SQL, migración, cambios de datos, descarga de credenciales, conexión a servicios pagados, consumo de créditos Lovable, publicación ni modificación de producción.** Ninguna aprobación se infiere del simple texto «sigamos». No iniciar listeners ni usar credenciales reales sin instrucción específica.

## 6. Archivos entregados

- `server/unbound-tenant-stack-v69.cjs`
- `server/lab-proposal-v69.cjs`
- `tests/unbound-tenant-stack-v69.test.cjs`
- `tests/lab-proposal-v69.test.cjs`
- `tests/unbound-tenant-stack-v69-real.test.cjs`
- `docs/V69-ENSAMBLAJE-HTTP-Y-LABORATORIO-SIN-RED.md`

**V70 recomendada:** ejecutar en Node.js nativo la suite de integración V69 **con los módulos reales y datos sintéticos**, sin sockets, y preparar un checklist de autorización específico para el eventual ensayo HTTP en loopback. No ejecutar tráfico real ni despliegue sin permiso expreso.

**Dictamen V69:** ensamblaje completo a nivel de código, pruebas unitarias y simulación lógica; publicación y laboratorio de red **NO GO**.
