# MG WEB STUDIO CLOUD — V105 | Contrato de observación Auth API sin permisos SQL

**Corte:** 2026-11-02 (Ecuador). **Pruebas:** [GitHub Actions V105 #41477902700](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41477902700), **22/22 PASS y 0 FAIL**.  
**Alcance real:** implementación y pruebas totalmente offline. **No se conectó el código V105 a Supabase Auth real, no se crearon usuarios, tokens, factores o sesiones, no se ejecutó SQL ni se realizaron cambios productivos.**

## 1. Hallazgos documentados en las APIs oficiales

Supabase documenta tres métodos JavaScript de Auth que se pueden emplear desde un cliente **aislado por solicitud en el backend**:

1. [`auth.getClaims(jwt)`](https://supabase.com/docs/reference/javascript/auth-getclaims): verifica el JWT con las claves públicas JWKS cuando corresponde, y retorna reclamaciones verificadas (por ejemplo `sub`, `session_id`, `iss`, `aud`, `exp`, `aal` y `amr`). Las comprobaciones criptográficas o el resultado de un JWT todavía vigente **no significan** que su sesión siga activa tras una revocación.
2. [`auth.getUser(jwt)`](https://supabase.com/docs/reference/javascript/auth-getuser): realiza llamada a Supabase Auth para obtener identidad actual y auténtica. No asumir sin una prueba específica que `getUser` verifica en todas las configuraciones que `session_id` siga presente en `auth.sessions`.
3. [`auth.mfa.getAuthenticatorAssuranceLevel(jwt)`](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel): con JWT explícito efectúa comprobación remota; se distinguen `currentLevel`, `nextLevel` y métodos de autenticación. Un factor **enrolado** o `nextLevel:'aal2'` **no cumple** la exigencia de `currentLevel:'aal2'`. Aun así, estas señales pueden derivarse en parte del mismo JWT y **no son una fuente independiente de desafío**.

**Advertencia de seguridad confirmada**: [sesiones de Supabase](https://supabase.com/docs/guides/auth/sessions) y [gestión de usuarios](https://supabase.com/docs/guides/auth/managing-user-data) explican que los JWT emitidos pueden continuar válidos hasta `exp` tras ciertas revocaciones o bajas. Para operaciones sensibles es necesario validar la sesión contra una fuente autoritativa adecuada. No conceder SELECT sobre `auth.sessions` para solucionarlo de forma improvisada.

## 2. Antecedente real V104

En el laboratorio independiente `MG WEB STUDIO AUTH QA` (`ACTIVE_HEALTHY`, PostgreSQL 17.11.0.011), la inspección de permisos del catálogo demostró que **`anon`, `authenticated` y `service_role` no tienen privilegios directos SELECT/INSERT/UPDATE/DELETE** sobre las siete tablas críticas estudiadas, incluida `auth.sessions` y `auth.mfa_amr_claims`. Los resultados están en `docs/V104-AUDITORIA-LECTURA-AUTH-REAL-20261102.md`.

**V105 no cambia estos permisos ni añade SQL, vistas, funciones `SECURITY DEFINER`, roles o políticas RLS.**

## 3. Implementación V105 en PR #7

Se agregó el módulo CommonJS opcional `server/v105-auth-api-observation.cjs`, que exporta `createAuthApiObservationV105`:

- Exige `clientFactory` de servidor, `expectedIssuer` exacto sobre HTTPS, audiencia prevista y límite máximo de antigüedad AMR de cinco minutos. La aplicación que lo conecte deberá crear **una instancia aislada del SDK por solicitud** con sesión no persistida; **V105 no importa ni instala el SDK**.
- Recibe contexto estrictamente cerrado `{accessToken, expectedSubject, expectedSessionId, signal}`, que debe ser construido desde información confiable del servidor (jamás roles/metadatos del body del usuario). Rechaza claves agregadas, JWT mal formados, cancelaciones y entradas de longitud excesiva.
- Ejecuta `getClaims(jwt)` y verifica que identidad, `session_id`, emisor, audiencia, caducidad, nivel `aal2` y un método AMR `totp` o `mfa/phone` reciente coincidan con el contexto esperado.
- Consulta `getUser(jwt)` para corroborar sujeto y luego `mfa.getAuthenticatorAssuranceLevel(jwt)` para comparar `currentLevel`, `nextLevel` y método/fecha; todas las llamadas reciben explícitamente el JWT y no usan la sesión del almacenamiento local.
- **Nunca devuelve un comprobante V97/V98 válido**. Su salida es una `AUTH_API_SIGNAL_OBSERVATION` inmutable con los flags `sessionRevocationVerified:false`, `independentMfaChallengeProven:false`, `tenantPermissionVerified:false`, `canAuthorizeSensitiveAction:false`, `productionAuthorized:false`.
- Rechaza respuestas inesperadas, fallos de red del proveedor, discrepancias de usuario/sesión/método/AAL o expiración durante una llamada. No imprime tokens, datos de perfil ni mensajes de error.

Esta separación impide convertir un JWT firmado o un resultado `aal2` en una autorización completa sin revisar las fuentes de sesión/MFA y los permisos de la organización/sitio.

## 4. Evidencia técnica

- `tests/v105-auth-api-observation.test.cjs`: **22 casos** adversariales y de integración sintética.
- [Run 41477902700](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41477902700): **22 PASS / 0 FAIL** con Node 22 y guard de red V70. Los clientes de Auth utilizados por la suite son mocks, no se establecieron conexiones a Supabase.
- Comprobación de integración con V97: pasar una observación V105 como `readTrustedAssurance` termina en **`403 STEP_UP_REQUIRED`**.
- Workflow: `.github/workflows/mg-web-studio-v105-auth-api-observation-offline.yml`, permisos de GitHub únicamente `contents:read`, acciones fijadas por SHA, checkout sin credenciales persistentes.
- No se lanzaron de nuevo PG17 V94B ni se cambiaron datos. Otros workflows históricos de PR podrían ejecutarse al sincronizar cambios por sus filtros `paths`, que se evalúan sobre el diff completo del PR; revisar esa posible duplicidad en una refactorización futura.

## 5. Bloqueos concretos antes de una prueba real

1. Validar la compatibilidad y configuración del SDK en un entorno de pruebas con versión fija y lockfile, sin servicio de credenciales en el navegador.
2. Obtener **mecanismo oficial y revisado de comprobación de revocación de sesión** `session_id` para operaciones sensibles. No sustituirlo automáticamente por `getUser`, `getClaims` o `aal2`, ni abrir privilegios internos de `auth` a `service_role`.
3. Autorizar **separadamente** el uso de una cuenta sintética para inicio de sesión, TOTP, challenge/verify, actualización de JWT y revocación; preparar borrado y costes. La autorización actual de V104 fue de auditoría de solo lectura, no de creación de identidades.
4. Resolver la protección contra replay entre instancias (V102 ofrece un WeakMap local únicamente).
5. Nombrar revisor independiente en [Issue #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8) y registrar un dictamen auténtico antes de modificar aprobaciones canónicas V67.

**Estado V105:** contrato ejecutable y QA offline terminados, **Supabase Auth real sin conectar**. **32 V67 PENDING / 0 PASS**, PR #7 en borrador sin fusión, **producción NO_GO**.
