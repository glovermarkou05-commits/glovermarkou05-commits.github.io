# MG WEB STUDIO CLOUD — V98 | Adaptador de confianza para sesiones y MFA

**Fecha:** 2 de noviembre de 2026 (Ecuador). **Ejecución:** [GitHub Actions V98 #41463023856](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41463023856). **Resultado:** 42/42 pruebas correctas (22 V98, 20 regresiones V97), sin fallos. Trabajo limitado al PR #7 en borrador.

## Alcance y justificación

Supabase documenta que el JWT tiene `session_id`, correspondiente al identificador de `auth.sessions`, y que la verificación MFA eleva el `aal` a `aal2`. No obstante, las filas de sesión pueden permanecer temporalmente tras ciertas expiraciones, y los cambios de `aal` pueden requerir refresco de JWT. **La presencia de sesión o el claim `aal2` solos no demuestran la verificación reciente de MFA requerida por V97.**

Fuentes del proveedor consultadas:
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/auth/auth-mfa

El objetivo de V98 es exigir evidencias separadas, sin comprometer a un proveedor real que aún no ha sido configurado ni auditado.

## Implementación realizada

`server/v98-trusted-assurance-adapter.cjs` exporta:
`createTrustedAssuranceAdapterV98({ verifyBoundJwt, readPrimarySession, readAuthoritativeFactor, nowSec, maxSessionAgeSec, maxFactorEvidenceAgeSec })`.

Las tres funciones se **inyectan obligatoriamente** desde código del servidor y deben estar respaldadas por fuentes autoritativas. No hay conexión, clave, cliente Supabase, red, SQL, caché, almacenamiento ni escucha HTTP en V98.

1. **JWT y enlace con sesión:** `verifyBoundJwt` debe comprobar criptográficamente firma, emisor, audiencia, expiración, sujeto y `session_id`; devolver identidad y sesión verificadas desde backend. El verificador previo V71 retorna solo `subject`, por lo que **no puede usarse como proveedor completo de V98** sin un mecanismo independiente que certifique `session_id` y demás campos.
2. **Lectura primaria y revocación:** `readPrimarySession` debe verificar una sesión actual del mismo sujeto, en origen primario y con constancia reciente de revocación. V75 ya tiene un contrato SQL parametrizado de `auth.sessions`, pero no realiza una conexión real; su salida requiere una traducción revisada para añadir la prueba de lectura primaria.
3. **Constancia MFA real:** `readAuthoritativeFactor` debe comprobar un **evento verificable de segundo factor** asociado a la misma sesión/usuario, con tipo `totp` o `phone`, marca temporal y origen server-side. No se debe sintetizar esta constancia únicamente desde `aal2`, un factor *enrolado* o `user_metadata`. **La disponibilidad y compatibilidad de esa evidencia en el esquema/API efectivo de Supabase aún requieren verificación en sandbox**, antes de implementar el proveedor.
4. **Salida mínima para V97:** las tres comprobaciones deben coincidir exactamente; V98 crea entonces una acreditación corta, sin payload de usuario. V97 continúa verificando, además, el permiso actual sobre organización, sitio y acción.
5. **Fallos:** denegación ante expiración, respuestas con propiedades extra, identidad cruzada, sesión ausente/revocada, MFA no confirmado, fuente no confiable, reloj inválido, error de proveedor o cancelación. No se exponen secretos ni datos personales en resultados.

## QA real y correcciones

| Ejecución | Resultado | Acción |
| --- | --- | --- |
| [Primer ensayo V98 #41462832136](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41462832136) | 37/42 PASS; 5 errores | El adaptador rechazaba UUID legítimos por una expresión regular con un grupo ausente; la denegación fue segura |
| [Segundo ensayo V98 #41463023856](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41463023856) | **42/42 PASS** | UUID corregido a formato 8-4-4-4-12; las reglas de MFA y sesión permanecieron estrictas |

El workflow `.github/workflows/mg-web-studio-v98-trusted-assurance-offline.yml` ejecuta Node 22 con un guard de red local, `contents: read`, acciones GitHub fijadas por SHA y checkout sin credenciales persistentes. **No se ejecutó de nuevo PostgreSQL V94B ni la prueba JWT V88.**

## Qué falta para habilitar un sandbox auténtico

- Un proyecto Supabase **de prueba identificado y autorizado por separado**, distinto de otros productos o datos de clientes; todavía no se ha seleccionado ni conectado.
- Implementar el proveedor de JWT realmente verificado, incluyendo `session_id`; documentar claves públicas rotatorias y revocación; no reutilizar tokens sin validar criptográficamente.
- Revisar el esquema real `auth.sessions`, la forma de confirmar un desafío MFA **en la sesión vigente** y el registro de evento usado para sostener `factorConfirmedAtSec`. La verificación debe usar canales documentados y privilegios mínimos, sin `SECURITY DEFINER` improvisados.
- Validar, en una prueba autorizada, logout/revocación, cambio de usuario, expiración, falta de MFA, retrasos de refresco y reintento; sin usar cuentas productivas.
- Designar revisor independiente para Issue #8, revisar costos/credenciales/privacidad, compatibilidad Auth y permisos antes de cualquier integración o despliegue.

## Decisión

**V98: contrato de seguridad y QA offline completados.**  
**Supabase real, MFA real y permisos reales: NO VERIFICADOS.**  
**V67: 32 PENDING / 0 PASS.**  
**PR #7 sin fusión, producción NO_GO, sin cambios en `main`, STAGING, BAZAR-ONLINE, FINZY, MG CLUB+ o cuentas existentes.**
