# P0 — Supabase Auth `auth.sessions` tiene RLS activo sin política para el lector QA

**Constatado:** 2026-11-04, proyecto `MG WEB STUDIO AUTH QA` (`tbfhiqkivsoeuudlpkgi`) mediante SELECT de catálogo, sin modificar datos ni permisos.  
**Estado:** `BLOCKING_QA_DB_SESSION_READER / NO_GO`, revisión independiente DBA/Seguridad necesaria antes de solicitar cualquier SQL QA.

## Evidencia real, no simulada

El SELECT de metadatos `pg_class`/ `pg_namespace`/ `pg_policies` realizado sobre QA devolvió:
- `auth.sessions`: **`relrowsecurity=true`**, **`relforcerowsecurity=false`**, **0 políticas**.
- `auth.mfa_challenges` y `auth.mfa_factors`: también `relrowsecurity=true`, 0 políticas; **no** se pide SELECT directo sobre estas tablas.
- Propietario de `auth.sessions`: `supabase_auth_admin`; `authenticator` carece de SELECT.
- Cualquier rol privado independiente **no propietario**, **sin BYPASSRLS** y sin política aplicable verá **0 filas** aun cuando un DBA otorgase `USAGE` en el esquema y `SELECT(id,user_id,not_after)` en la tabla. Es justamente lo esperado por RLS, no un defecto a sortear.

Consulta reproducible **solo lectura**:

```sql
SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity,
       c.relowner::regrole AS owner,
       (SELECT count(*) FROM pg_policies p
        WHERE p.schemaname=n.nspname AND p.tablename=c.relname) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='auth' AND c.relname='sessions';
```

## Evidencia adicional de laboratorio y corrección preventiva

El workflow V122 anterior simulaba `auth.sessions` **sin RLS**, de modo que podía pasar con solo GRANT SELECT. Esto no reproducía el proyecto real.

- En [CI V122 #41842888590](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41842888590) **31/31 PASS (18 offline + 13 PG17)**, se activó `ENABLE/FORCE ROW LEVEL SECURITY` en **tabla Auth ficticia**, se confirmó que un lector privado con GRANT SELECT **no** ve la sesión mientras no haya política, y solo después se creó una **política de fixture CI** para continuar comprobando revocación/columna/expiración.
- La política temporal **jamás** se creó en Supabase QA. No es recomendación para modificar tablas administradas por Auth.
- Se fortaleció el lector V122 para exigir **`session_user` y `current_user` iguales** al rol privado permitido; una simple impersonación por `SET ROLE` se deniega. Regresión complementaria [CI #41842888611](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41842888611), **27/27 PASS**.
- Ambos runs: **58/58 PASS**, pero **no** habilitan lectura real en QA ni garantías de revocación linealizable.

## Decisión técnica necesaria del DBA externo

**No ejecutar SQL en QA ni añadir `SECURITY DEFINER` o `BYPASSRLS` como solución rápida.**

El DBA/Seguridad debe decidir, documentar y probar **una arquitectura autorizada y soportable** para confirmar la sesión del usuario y su revocación cuando una operación sensible lo requiera, con estos criterios:

1. Compatibilidad con el esquema **gestionado por Supabase Auth** y futuras actualizaciones de ese esquema.
2. Sin `SELECT` generalizado ni acceso a refresh tokens, secretos o metadatos de sesión. No usar roles de navegador, `service_role` en cliente, BYPASSRLS ni políticas amplias sobre `auth.sessions`.
3. Demostrar que la vía aprobada detecta la sesión exacta `session_id`/ `sub` desde backend confiable y qué garantía ofrece realmente frente a revocación.
4. Prueba real de la identidad/privilegios, aislamiento de la Data API, tasa de solicitudes, registros de auditoría, retención y rollback con autorización expresa solo en QA.
5. Si no hay mecanismo aceptable de consulta a Auth sin modificar internals administrados, **modificar el diseño de autorización** en vez de fingir que existe una consulta válida; mantener las operaciones sensibles bloqueadas hasta esa decisión.
6. Evaluar y documentar específicamente la ventana entre última verificación de sesión y `COMMIT`; el token JWT válido por sí solo **no demuestra** ausencia de revocación instantánea.

**No se afirma que ninguna alternativa esté aprobada.** La revisión no debe darse por finalizada simplemente porque las pruebas PG17 pasaron.

## Puerta de aceptación

`PASS` solo cuando el revisor independiente firme el mecanismo Auth/DB de sesiones y exista una propuesta completa de instalación/rollback para el **único QA**; después el propietario decidirá autorizar la prueba MFA real por separado. **Sin firma y consentimiento, NO_GO.**

**PR #7:** DRAFT, no merge. **V67:** 0/32 aprobaciones formales. **V95:** 69% técnico estimado / 31% pendiente (no recalculado). **Producción:** NO_GO.
