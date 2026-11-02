# MG Web Studio Cloud — V102 | Vinculación de desafío MFA con sesión verificada

**Fecha:** 2 de noviembre de 2026, Ecuador.  
**Resultado de laboratorio:** [GitHub Actions #41471990965](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41471990965) — **100/100 pruebas PASS, 0 FAIL** (20 V102 + 19 V101 + 19 V100 + 22 V98 + 20 V97).
**Estado de ejecución:** exclusivamente pruebas offline sintéticas, red prohibida mediante el guard V70. **No** se conectó Supabase, no se ejecutó SQL, no se crearon usuarios ni se publicó.

## 1. Decisión de arquitectura

En la documentación oficial, Supabase ofrece `auth.mfa.challenge({factorId})`, que devuelve `challengeId`, y `auth.mfa.verify({factorId,challengeId,code})`, que verifica el desafío; el flujo de MFA modifica el nivel de aseguramiento de la sesión a `aal2`. Referencias:
- https://supabase.com/docs/reference/javascript/auth-mfa-challenge
- https://supabase.com/docs/reference/javascript/auth-mfa-verify
- https://supabase.com/docs/guides/auth/auth-mfa/totp

El esquema histórico `auth.mfa_challenges` **no incluye `session_id`**. Vincular el desafío a una sesión por coincidencia aproximada de fecha o pertenencia de factor no es suficiente. Por eso, V102 propone **correlación en un flujo gestionado por backend**, no un JOIN hipotético sobre tablas internas.

## 2. Implementación de contrato V102

`server/v102-challenge-session-transaction.cjs` exporta `createMfaChallengeSessionTransactionV102`, que exige cinco adaptadores de confianza **inyectados**. El módulo no contiene un cliente de Supabase, consultas de base de datos ni operaciones de red:

1. `readOriginalSession`: debe comprobar JWT original, sujeto, `session_id`, consulta primaria de sesión activa y revocación, sin confiar en metadatos editables por el usuario.
2. `readOwnedFactor`: debe confirmar que el factor TOTP o `mfa/phone` está verificado y pertenece al sujeto autenticado.
3. `createChallenge`: debe iniciar el desafío en el **contexto autenticado de la misma sesión**, conservar su `challengeId`, `factorId` y fecha.
4. `verifyChallenge`: debe verificar el código opaco en ese desafío y obtener un token de acceso renovado. El módulo exige que factor y desafío coincidan con los del paso previo.
5. `readUpdatedSession`: debe verificar criptográficamente el token renovado, su `aal2`, sujeto y **misma sesión**, revocación vigente y método AMR con fecha compatible. Si el proveedor renueva o rota la sesión a otro identificador, esta versión deniega por seguridad.

La salida de `run` es una referencia **vacía y congelada**, sin código OTP, JWT, `challengeId` ni datos personales. Esa referencia se registra únicamente en un `WeakMap` local del proceso. `consume` admite un único uso y elimina la referencia incluso si el intento presenta valores incorrectos de sujeto, sesión, método o fecha; su evidencia resultante tiene la forma que espera `readVerifiedChallenge` de V101.

**Invariante clave:** ningún campo `sessionBoundByAuthorizedFlow:true` puede establecerse legítimamente desde el navegador, desde una consulta a `mfa_challenges` aislada o desde una prueba JWT `aal2` sin flujo verificado.

## 3. Pruebas reales de CI

- Primer ensayo [#41471881367](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41471881367): **98/100**. Dos expectativas de timestamps sintéticos quedaron desalineadas; se corrigieron los datos del test sin relajar el módulo de seguridad.
- Ensayo final [#41471990965](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41471990965): **100/100 PASS**, 0 FAIL.
- Casos ensayados: sujeto o sesión cruzados, JWT no verificado, factor no perteneciente al usuario, desafío no emitido por proveedor, código inválido, token renovado falso, `aal1` posterior, fechas incoherentes, fallo/cancelación de adaptadores, lectura reiterada de comprobante, comprobante falsificado/clonado y expiración.
- Integración probada: V102 → `readVerifiedChallenge` V101 → V100, utilizando únicamente identidades y tokens ficticios.
- **No se repitieron** los ensayos PostgreSQL V94B.

## 4. Límites y riesgos antes de integración

- **No hay proveedores reales conectados**. `providerIssued`, `providerVerified`, `jwtVerified` y `primaryRead` son campos producidos por adaptadores simulados; deben validarse contra SDK/Auth y base reales en un sandbox expresamente autorizado. Un booleano fabricado no es evidencia independiente.
- `WeakMap` protege únicamente un proceso. **No es una defensa suficiente en múltiples instancias** ni sobre reinicios. Antes de una arquitectura distribuida se requiere un almacén de consumo único **atómico**, con TTL, controles de acceso y revisión independiente, o mantener toda la operación sensible dentro de una misma transacción segura de backend. No implementar aún.
- El backend debe mantener la correlación de desafío, factor y sesión en un contexto inaccesible a datos arbitrarios del cliente; los códigos OTP no deben guardarse en logs ni trasladarse a URLs.
- La prueba de renovación de token y revocación tiene que realizarse con identidad real **solo en un proyecto de pruebas dedicado**. No sustituye RLS ni políticas de autorización de negocio.
- La evidencia `sessionBoundByAuthorizedFlow` que entrega V102 representa exclusivamente un **contrato técnico simulado**, no una firma de revisor humano. El permiso formal V67 sigue bloqueado.
- El STAGING MG Web Studio previamente observado figura inactivo; **no reactivarlo** ni reutilizar proyectos FINZY, BAZAR ONLINE o MG CLUB+.

## 5. Bloqueos para V103

Antes de un ensayo end-to-end real hacen falta: proyecto Supabase exclusivo y autorizado, política de MFA para cuentas sintéticas, lector servidor con permisos mínimos, validación del SDK respecto a tokens actualizados, decisión sobre consumidor único distribuido y revisión técnica humana de la [incidencia #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8).

**V102: implementación y pruebas offline completas.**  
**AUTH-01/02/03: PENDING.**  
**V67 formal: 32 PENDING / 0 PASS.**  
**PR #7: borrador sin merge. Producción: NO_GO.**
