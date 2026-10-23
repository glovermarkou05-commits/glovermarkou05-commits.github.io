# MG WEB STUDIO CLOUD — V72 | Rotación de claves y comprobación de sesiones

**Rama:** `feature/mg-digital-v5-web-services`  
**Fecha de validación:** 23/10/2026  
**Estado:** lógica de servidor y pruebas criptográficas nativas con material sintético. **NO GO** para Auth real, red, Supabase, PostgreSQL, STAGING y producción.

## Alcance implementado

Se creó `server/rotating-session-verifier-v72.cjs`. Exporta `createRotatingSessionVerifierV72({issuer,audience,loadPublicKeys,checkSession,nowSec?,refreshIntervalSec?,maxTokenAgeSec?})`. El resultado inmutable incluye:

- `verifyAccessToken(token)`: llama primero al verificador criptográfico V71 (ES256/RS256), y **solo si la firma, emisor, audiencia y vigencia son correctos**, extrae `session_id` del payload firmado. Requiere UUID y llama al proveedor `checkSession({sessionId,subject})` en **cada** petición. Acepta únicamente `{active:true,subject:<mismo UUID>,sessionId:<mismo UUID>}`; cualquier respuesta insuficiente, excepción, fallo de firma o discrepancia devuelve `null`. La salida positiva queda limitada a `{verified:true,subject}`, compatible con el límite de V60. Ningún rol, MFA o claim de privilegio del token se transforma en autorización de empresa.
- `invalidateKeys()`: invalida explícitamente el snapshot actual y descarta resultados pendientes de una generación anterior. Exige volver a cargar la lista antes de autorizar la siguiente petición.
- `readiness`: `SYNTHETIC_ONLY`, `jwksNetworkConnected:false`, `sessionStoreConnected:false`, `realSessionRevocationVerified:false`, `deploymentAuthorized:false`, `decision:NO_GO`.

Las claves públicas provienen **solo** del callback confiable `loadPublicKeys()`; el módulo no hace peticiones de red ni descubre automáticamente una URL `jwks_uri` proporcionada por tokens. El callback debe devolver un objeto con **únicamente** `keys`: array de 1 a 8 entradas normalizadas `{kid,alg,jwk}`. Se rechazan `kid` duplicados, algoritmos fuera de ES256/RS256, material privado, curvas erróneas y claves inválidas mediante los controles V71.

El conjunto de claves tiene una **edad máxima antes de renovación** `refreshIntervalSec` (predeterminado 300 segundos; rango 10–3600). Si la renovación falla, no se utiliza un snapshot caducado. Claves desconocidas no provocan una descarga sin límite: se incorporan en el siguiente refresh o por invalidación explícita. Peticiones concurrentes comparten una misma carga de claves (single-flight). Una invalidación durante una comprobación de firma o consulta de sesión hace que su resultado quede rechazado por cambio de generación. Se comprueba retroceso del reloj y se rechaza la autorización hasta volver a obtener claves.

## Pruebas ejecutadas y evidencia real

- **GitHub Actions:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/39969078171
- **Run ID:** `39969078171`; **Job ID:** `120466629788`
- **Commit probado:** `8850e95ec337e0604b5b555588fdc8d963d177da`
- **Ambiente:** Node.js **v22.23.3** en runner Linux. La tarea concluyó `completed/success`.
- **Control de red de pruebas:** `--require ./server/native-network-guard-v70.cjs`; sus límites e implicaciones están descritos en V70.

| Batería | Correctas | Fallos |
| --- | ---: | ---: |
| V72: 22 pruebas de rotación/sesión + 6 pruebas de integración original V60–V69 | **28/28** | **0** |
| V71: firmas asimétricas y ensamblaje original | **44/44** | **0** |
| V70: siete suites de regresión | **92/92** | **0** |
| **Total de tests ejecutados** | **164/164** | **0** |

Además, durante el desarrollo se ejecutó una batería local ampliada de **28 pruebas unitarias V72** en Node.js v22.16.0. Un error inicial de expresión regular UUID de laboratorio fue detectado y corregido antes del commit final del código; la versión probada en GitHub utiliza la expresión de cinco grupos correcta.

Las pruebas verifican firmas ES256/RS256 generadas en el proceso, renovación de claves, superposición temporal de claves, eliminación de clave antigua, invalidación forzada, fallo de un proveedor, sesiones revocadas, identidades incoherentes, desconocimiento de `kid`, solicitudes paralelas y regreso a estado `NO_GO`. La integración envuelve el código original V60–V69 pero sus consultas SQL y comprobaciones de sesión son **simuladas**.

## Limitaciones que impiden conectar a producción

1. **Sin proveedor de claves real.** Se requiere una fuente JWKS del emisor comprobada por servidor, TLS, autenticidad de respuesta, límites, timeout, caché política y protección frente a SSRF. `loadPublicKeys()` es un contrato de inyección, **no una descarga JWKS implementada**. Un token recibido del cliente nunca debe controlar la URL de búsqueda.
2. **Sin repositorio de sesiones real.** `checkSession()` necesita consultar una fuente autoritativa fresca (incluida revocación), con permisos mínimos, timeout y estrategia frente a fallas. El ejemplo de laboratorio responde usando variables locales, no `auth.sessions` ni tablas del proyecto.
3. **Caducidad de caché y revocación urgente.** Mientras no expire el intervalo de refresh, una clave antigua puede permanecer confiable. El operador deberá diseñar distribución de invalidaciones entre procesos y revocación inmediata ante compromiso. El mecanismo V72 actual es **por proceso**, sin caché distribuida.
4. **No se prueban tiempos de espera reales de proveedores.** Los callbacks podrían tardar indefinidamente; V72 no cancela trabajos de DB/red. Antes de usarlo en producción se requieren deadlines, cancelación y límites del driver.
5. **Parser JOSE y casos ambiguos.** Se heredan las restricciones de V71, que implementa parsing JWT propio sin revisión criptográfica independiente; en producción se debe valorar una librería JOSE mantenida y su análisis frente a campos JSON duplicados. Una prueba aislada no constituye auditoría de producción.
6. **No se verificó MFA, RLS, GRANT, políticas de sesión reales, red HTTP/TCP ni restauración PostgreSQL 17.** Permanecen **32/32** controles V67 operativos pendientes.
7. **Sin despliegue.** Esta etapa no abrió puertos, no consultó ni modificó Supabase, no realizó SQL, migraciones, publicación ni gasto de créditos Lovable.

## Archivos V72

- `server/rotating-session-verifier-v72.cjs`
- `tests/rotating-session-verifier-v72.test.cjs`
- `tests/rotating-session-integration-v72.test.cjs`
- `.github/workflows/mg-web-studio-v72-offline-rotation.yml`
- `docs/V72-ROTACION-JWKS-REVOCACION-SESIONES.md`

## Siguiente paso sugerido — V73

Diseñar el **contrato de proveedores externos con deadlines, cancelación y límites de carga**, usando dobles locales y sin acceso a sistemas reales. Documentar el modelo de confianza y evidencias requeridas para una futura integración Auth controlada antes de solicitar permisos para STAGING. Mantener `NO_GO` hasta completar validaciones reales y autorizaciones separadas.

**Dictamen:** V72 completa en código y QA nativa aislada; **164/164 tests PASS**, producción **NO GO**.
