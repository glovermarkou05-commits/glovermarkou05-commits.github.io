# MG WEB STUDIO CLOUD — V100 | Procedencia verificable de MFA reciente

**Fecha de corte:** 2026-11-02 (Ecuador). **Resultado técnico:** **61/61 PASS** (19 V100, 22 V98, 20 V97) en [GitHub Actions 41465990624](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41465990624).  
**Estado del entorno real:** no existe sandbox V99 identificado/autorizado; no se establecieron conexiones, usuarios, sesiones, SQL ni MFA real.

## Hallazgo de documentación oficial

La guía oficial de Supabase Auth MFA documenta el claim `amr` en los JWT firmados: una lista de métodos con `timestamp` Unix que puede indicar cuándo se completó TOTP u otro método soportado. Es más específico que limitarse a `aal2`:

- https://supabase.com/docs/guides/auth/auth-mfa
- https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-mfa.mdx
- https://supabase.com/docs/guides/auth/jwt-fields

El esquema histórico de código abierto del proveedor incluye `auth.mfa_amr_claims`, con `session_id`, `authentication_method`, `created_at` y `updated_at`, y `auth.mfa_challenges.verified_at`. **No se verificó en un proyecto real que un registro `created_at`/`updated_at` represente siempre la última verificación correcta del factor**. No inferirlo ni activar SELECT sobre tablas de `auth` sin validación de versión/permisos y autorización previa.

- https://github.com/supabase/auth/blob/master/migrations/20221003041349_add_mfa_schema.up.sql
- https://supabase.com/docs/guides/auth/sessions

## Solución implementada (sin conexión a Supabase)

Se creó `server/v100-mfa-amr-provenance.cjs`, exportando `createVerifiedMfaAmrProvenanceV100`. El control utiliza exclusivamente *callbacks* inyectados por un backend confiable y exige **dos observaciones distintas que concuerdan**:

1. `verifySignedJwtAmr`: verificación criptográfica externa de JWT, emisor, audiencia, expiración, sujeto y `session_id`, con claim `aal2` y **exactamente un método MFA reconocido** (`totp` o `phone`) acompañado de `timestamp` reciente, no futuro ni superior a 300 s. Se rechaza AMR ambiguo, faltante, duplicado o inválido.
2. `readAuthoritativeMfaEvent`: fuente **independiente de la mera lectura del JWT**, que debe devolver el mismo usuario, sesión, método y fecha exacta de confirmación. Requiere `freshnessSemanticsVerified: true`, `origin: INDEPENDENT_AUTH_VERIFICATION_EVENT` y consulta con antigüedad máxima de 2 s. No admite un `auth.mfa_amr_claims.created_at` no validado ni un evento de enrolamiento.
3. Solo si ambas concuerdan se devuelve un objeto mínimo de evidencia de factor. Este objeto puede integrarse en `V98.readAuthoritativeFactor` y, a través de V98, alimentar el control V97 (autorización actual por organización/sitio/acción).

**Cambio V98 mínimo y revisable:** el módulo entrega el `accessToken` opaco **solo al proveedor inyectado de MFA del backend**, sin publicarlo, registrarlo ni guardarlo. El adaptador V100 puede verificar la firma y extraer la fecha del JWT independientemente de la verificación previa de V98. Todas las pruebas previas V98 y V97 vuelven a pasar.

**Sin operaciones remotas:** no se crearon ni ejecutaron consultas SQL, conexiones, bases o usuarios; el módulo no tiene drivers Supabase/PG, red, timers, escritura de ficheros, caché ni logs.

## Evidencia CI

- Primer intento [run 41465853073](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41465853073): 60/61; una expectativa incorrecta en el test de configuración trataba un conjunto válido de proveedores como si debiera fallar. Se corrigió el test, no el mecanismo MFA.
- Ensayo final [run 41465990624](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41465990624): **61/61 PASS**, cero fallos, con el guard de red nativo V70 y acciones GitHub fijadas por SHA. Se verificó además la cadena completa V100→V98→V97: la fuente corroborada permite continuar, la semántica no acreditada devuelve `STEP_UP_REQUIRED`.
- No se reejecutó el laboratorio PostgreSQL V94B ni se alteraron sus respaldos.

## Límites antes de usarlo en una operación real

- El proveedor verificador del JWT y la lectura de evento independiente **están simulados**. El resultado 61/61 certifica comportamiento del contrato, no Supabase real.
- La presencia de `amr.timestamp` en un JWT validado **no convierte** `auth.mfa_amr_claims.created_at` o `updated_at` en fecha de último MFA sin evidencia de la semántica exacta en la versión desplegada. Esto debe revisarse antes de implementar un lector de solo lectura.
- No se ha identificado una fuente permitida de evento independiente para ese sandbox, ni sus roles/privilegios ni el procedimiento de auditoría. No crear `SECURITY DEFINER` ni conceder `SELECT` a `anon`/`authenticated` en `auth`.
- Los callbacks V98/V100 no deben recibir tokens de clientes no verificados como fuente de autorización. Sus resultados tampoco sustituyen la verificación de sesión en `auth.sessions` ni la RLS por recurso.
- **No hay sandbox MG V99 dedicado aprobado**, ni persona revisora asignada. Debe autorizarse por separado cualquier integración, MFA real, coste o SQL de ensayo.

## Estado

**V100 contrato/código/pruebas: terminado en QA offline.**  
**AUTH-01..03 y DATA-01..02: sin cierre formal.**  
**V67: 32 PENDING/0 PASS.**  
**PR #7 borrador sin merge. Producción NO_GO.**
