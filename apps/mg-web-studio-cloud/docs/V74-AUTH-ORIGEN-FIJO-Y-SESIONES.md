# MG WEB STUDIO CLOUD — V74 | Contratos de autenticación con origen fijo

**Rama:** `feature/mg-digital-v5-web-services`  
**Fecha de validación:** 23/10/2026  
**Dictamen:** **V74 implementada y probada nativamente con datos sintéticos; NO GO** para proveedores reales, STAGING y producción.

## Entrega

Se añadió `server/pinned-auth-contract-v74.cjs` con dos funciones:

- `createPinnedAuthContractsV74({issuer,audience,requestJwks,readSession,nowSec?,maxJwksBytes?,maxSessionStalenessSec?,...})`: crea `loadPublicKeys` y `checkSession` **sin cliente de red ni acceso a bases de datos**. Los proveedores son callbacks de confianza inyectados por el backend, nunca por una solicitud del navegador.
- `createPinnedAuthVerifierV74(config)`: compone los contratos anteriores con **V73 → V72 → V71**. La salida `verifyAccessToken(token)` se puede conectar al ensamblaje V69/V60; continúa el control por empresa/sitio y la comprobación de sesiones por solicitud. Expone invalidación de claves y estado limitado de proveedores, sin exponer secreto ni SQL.

**Proveedores que todavía no existen en la aplicación:** `requestJwks(request)` y `readSession({subject,sessionId,signal})`. Los ejemplos en pruebas responden con memoria y claves creadas durante la ejecución. No se configuró `fetch`, cliente Supabase, pool PostgreSQL, credenciales ni un listener HTTP.

## Contrato JWKS y red

- `issuer` debe ser una URL HTTPS canónica que termine en `/auth/v1`, definida exclusivamente por configuración confiable del backend. Se rechazan userinfo, query, fragment, puerto arbitrario, URL no canónica, direcciones IP, `localhost` y dominios de red interna.
- La única ruta aceptada es `issuer + '/.well-known/jwks.json'`. El callback recibe indicaciones inmutables: `GET`, `Accept: application/json`, `redirect: error`, límite máximo de 16 KiB por defecto y `AbortSignal`.
- La respuesta del callback debe declarar `status:200`, `redirected:false`, `finalUrl` idéntica a la ruta fijada, y `mediaType` JSON válido. Se comprueba UTF-8 y el tamaño del cuerpo antes de analizar las claves.
- La colección contiene 1–8 JWK públicos; solo se aceptan **ES256 (P-256)** y **RS256 (RSA)**, identificadores únicos, atributos permitidos y ausencia de claves privadas. V71 verifica posteriormente la forma y fortaleza criptográfica de las claves. No se permite que `jku` o `x5u` proporcionados por el token definan destinos de red.

**Límite crítico:** los encabezados `redirect:error` y `maxBytes` son **instrucciones para el futuro cliente confiable**, no una garantía de red. Antes de una conexión real debe verificarse independientemente TLS, resolución DNS, redirecciones, tamaño durante streaming, límite de conexiones, respuesta final, mitigación de SSRF y ausencia de acceso a redes internas. La comprobación `finalUrl` no sustituye la seguridad del transporte ni la validación de certificados.

**Conformidad y compatibilidad:** la documentación oficial de Supabase indica el endpoint `GET https://project-id.supabase.co/auth/v1/.well-known/jwks.json`, y reconoce distintos sistemas de firmas (asimétricas y secretas) y periodos de caché. Este contrato **solo** soporta claves asimétricas ES256/RS256; será imprescindible confirmar cuál usa el proyecto autorizado antes de conectarlo. Referencia: https://supabase.com/docs/guides/auth/signing-keys .

## Contrato de sesión

El callback autoritativo pendiente debe responder con `{active:boolean,revocationChecked:true,subject,sessionId,checkedAtSec,expiresAtSec}`. La capa valida que los UUID coincidan con los de la petición, que la comprobación tenga edad máxima de **5 segundos** por defecto y que no provenga del futuro. Una sesión ya caducada se convierte en `active:false` incluso si la fuente envió `active:true`.

Una respuesta revocada pero bien formada devuelve **negación verificada** (`active:false`), no una avería del proveedor: esto impide que un usuario con sesión revocada pueda saturar el circuit breaker simplemente autenticándose repetidamente. Errores, datos faltantes, respuestas antiguas, expiración falsa o proveedores sin respuesta devuelven `null`, que deniega acceso.

**Límite crítico:** la marca `revocationChecked:true` y el timestamp provienen de la función externa **de confianza**. El contrato no demuestra por sí solo que exista una consulta autoritativa fresca o que se hayan aplicado permisos mínimos; eso requiere verificar el adaptador real, la sesión en la fuente de verdad y su política de revocación. V73 sigue imponiendo plazos y concurrencia, con cancelación cooperativa no garantizada.

## Evidencia de QA

Ejecución en GitHub Actions: https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/39974355308

- **Run ID:** `39974355308` · **Job ID:** `120484979686`
- **Commit probado:** `e4a5fc49766ded8234419f74e657186d68ae4adf`
- **Node.js:** `v22.23.3` sobre runner Linux.
- **Conclusión:** `completed/success`; **sin fallos ni pruebas canceladas**.

| Suite ejecutada | Pruebas | Aprobadas | Fallidas |
| --- | ---: | ---: | ---: |
| V74: contrato JWKS/sesiones e integración JWT original | 39 | 39 | 0 |
| V73: presupuestos y recuperación de proveedores | 34 | 34 | 0 |
| V72: rotación y revocación de sesiones sintéticas | 28 | 28 | 0 |
| V71: firmas y JWT asimétricos | 44 | 44 | 0 |
| V70: siete suites nativas del backend | 92 | 92 | 0 |
| **TOTAL de tests ejecutados** | **237** | **237** | **0** |

La primera ejecución de V74 (Run ID `39973811469`) detectó un **UUID con seis grupos en lugar de cinco** en `checkSession`; produjo fallos en casos de sesión válida. Se corrigió la expresión regular en el commit `2aeb19cdc010d688604a20ff1fd46e96286d2ebc` y se repitió el flujo con los resultados anteriores. Esta es evidencia de corrección y no de una supuesta aprobación previa. Los tests de integración emplean el ensamblaje original V60–V73, JWT firmados localmente y respuestas en memoria.

## Pendientes para operar

1. **Fuente de JWKS real:** implementar proveedor HTTPS seguro y revisión de origen/TLS/DNS/SSRF. Validar rotaciones y revocaciones urgentes, incluida propagación de invalidaciones a todas las réplicas.
2. **Fuente autoritativa de sesiones:** definir el mínimo acceso necesario, datos de vencimiento/revocación, timeout/cancelación y verificación real de un proyecto autorizado; nunca usar `service_role` en un cliente público.
3. **JSON/JWT:** el parser usa `JSON.parse` y **no detecta claves JSON duplicadas por sí mismo**. Antes de producción, hacer revisión criptográfica independiente y considerar una biblioteca JOSE mantenida y probada.
4. **Database:** comprobar roles efectivos, grants, RLS, aislamiento multiempresa, interrupción real de consultas y restauración PostgreSQL 17 en entorno aislado. Ninguna operación SQL se ejecutó en V74.
5. **HTTP:** siguen pendientes los ensayos del parser Node sobre TCP/loopback y los controles reales de TLS, proxies, rate limiting y memoria.
6. Los **32 controles operativos V67 siguen PENDING**. La integración simulada V74 no es evidencia equivalente a pruebas de la infraestructura auténtica.

No se modificó Supabase, Lovable, STAGING ni producción; no se abrió ningún puerto y no se consumieron créditos Lovable.

## Próximo paso propuesto — V75

Preparar el **adaptador de consulta de sesión mediante PostgreSQL de solo lectura**, verificando las consultas parametrizadas, mínimo privilegio, políticas de error y revocación con un repositorio falso, sin credenciales ni conexiones reales. Separar el eventual acceso a Supabase o STAGING mediante autorización explícita.

**Conclusión:** V74 completada en desarrollo y pruebas nativas offline; **237/237 PASS**. Integración real y publicación: **NO GO**.
