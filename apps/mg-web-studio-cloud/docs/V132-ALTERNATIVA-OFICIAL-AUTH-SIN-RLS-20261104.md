# MG Web Studio — V132: comprobación de sesión mediante API oficial, sin GRANT en Auth

**Fecha:** 4 de noviembre de 2026 (Ecuador). **Estado:** `P0_CODE_ALTERNATIVE_PASS / REAL_QA_NOT_TESTED / NO_GO`.  
**PR:** [#7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7), borrador, no fusionado.

## 1. Por qué el cambio es necesario

El proyecto real `MG WEB STUDIO AUTH QA` (`tbfhiqkivsoeuudlpkgi`) tiene `auth.sessions` con RLS ON y **ninguna política de lectura** para un rol privado. El lector propuesto V122 no funcionaría con `GRANT SELECT` por sí solo. La vía de instalar una política sobre una tabla interna administrada por Supabase es más arriesgada y necesita revisión especial.

La documentación de Supabase recomienda:
- [`getClaims`](https://supabase.com/docs/guides/auth/server-side/advanced-guide): verificar JWT firmado y expiración; **no** basta para demostrar que el usuario cerró sesión.
- [`getUser(jwt)`](https://supabase.com/docs/reference/javascript/auth-getuser): solicitud de red al servidor Auth para identidad y estado de sesión más reciente. [Guía avanzada](https://supabase.com/docs/guides/auth/server-side/advanced-guide): usarlo en operaciones donde la brecha de revocación importa.
- [Sesiones y revocación](https://supabase.com/docs/guides/auth/sessions): los tokens JWT siguen siendo válidos hasta su expiración; las comprobaciones de revocación merecen control adicional.

**Diseño recomendado:** comprobar cada petición sensible en servidor con `getClaims(jwt)` + `getUser(jwt)`, validar `iss` **QA fijado**, `aud=authenticated`, `sub`, `session_id`, `exp`, vigencia de 2 segundos y que el usuario devuelto pertenece al mismo `sub`. No almacenar JWTs ni códigos MFA. No consultar ni modificar `auth.sessions` desde la aplicación.

## 2. Código concreto

- `server/v132-auth-server-session-gate.cjs`: autentica actor backend desde claims firmados y consulta `auth.getUser(token)` en **cada** comprobación. No permite cambiar la referencia de proyecto `tbfhiqkivsoeuudlpkgi` ni aportar sujeto/sesión distintos. Retorna evidencia `authServerConfirmed` diferenciada de `primaryRead`; **no finge una consulta SQL primaria**.
- `server/v127-supabase-native-mfa-bridge.cjs`: admite esa evidencia de Auth server para iniciar y confirmar MFA, conservando el requisito de JWT `aal2` tras `mfa.verify`.
- `qa/v119-atomic-business-lab.cjs`: operación **ficticia y CI-only** acepta de modo estricto la evidencia Auth server o una fila primaria, comprobando la sesión antes de actuar y otra vez antes de COMMIT. No cambia el negocio real.

## 3. Evidencia reproducible

| Ejecución | Resultado | Lo que demuestra |
| --- | --- | --- |
| [V132 offline #41849141865](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41849141865) | **12/12 PASS** | `getClaims/getUser` con respuestas sintéticas: sesión inicial AAL1, rechazo de JWT incorrecto, red caída, usuario ajeno, cierre de sesión, binding del actor, MFA V127 |
| [V126 + V132 PG17 #41849141097](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41849141097) | **32/32 PASS** | V130/V125/V119 realizan una operación ficticia en PG17 con Auth server **simulado** sin una sola fila en `auth.sessions`; revocación sintética durante transacción revierte ledger y negocio |

**Incidencia de CI:** un run intermedio obtuvo 31/32 porque un test antiguo exigía que los 16 intentos simultáneos de emisión devolvieran éxito. La verificación de integridad exige un solo evento persistente; algunos intentos pueden **fallar cerrados** por tiempo/conexión. Se ajustó el test para aceptar rechazos seguros, conservando el requisito de **un único ID registrado y sin éxito falso**. El run final completó 32/32.

## 4. Lo que NO certifica

1. No hay llamada **real** a Auth QA `getUser/getClaims`, ni prueba de cierre de sesión en remoto; la simulación no permite afirmar una semántica de revocación garantizada. Debe probarse, con usuario temporal y permiso del propietario.
2. `getUser` consulta el servidor antes de la operación, pero **no bloquea una revocación que suceda después de la última consulta y antes de COMMIT**. No es linealizable.
3. El resultado de `mfa.verify` y el commit en PostgreSQL siguen en servicios distintos; el caso de confirmación incierta requiere conciliación y dictamen externo.
4. Todavía falta instalar los **otros** esquemas privados journal, recibos y ledger en QA, con permisos RLS mínimos, TLS, mantenimiento/retención y rollback revisados.
5. V132 es una composición de backend: todavía no está conectada a un endpoint real de la aplicación ni permite operar sobre datos productivos.

## 5. Próximo paso sin repetir V107

Una vez autorizado de forma **específica** el único ensayo QA:
- Crear una identidad QA temporal; usar SDK oficial de Auth ligado al usuario; validar `getUser/getClaims` primero con sesión activa y después con `signOut({scope:'local'})`.
- Confirmar denegación con un token previamente firmado después de cerrar sesión; si Auth no niega en el escenario real, **NO declarar la mitigación válida** y mantener bloqueadas las operaciones sensibles.
- Ensayar una verificación MFA genuina nueva con `aal2`, una única operación ficticia, replay rechazado y limpieza. No repetir la prueba histórica V107.
- Registrar tiempos, fallos de red y carrera de revocación sin imprimir JWT, TOTP, claves ni otros secretos.

**Estado formal:** dictamen DBA/Seguridad externo pendiente; SQL/usuario QA no autorizado; PR DRAFT/no merge; V67 **0/32**; cobertura técnica V95 **69% estimada, 31% pendiente**; producción **NO_GO**.
