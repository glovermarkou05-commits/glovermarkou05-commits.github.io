# MG WEB STUDIO CLOUD — V54 | Defaults ACL y trazabilidad

**Fecha:** 20 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Proyecto:** MG WEB STUDIO CLOUD - STAGING · `yefcgjtovfnsqtdjdsod` · PostgreSQL 17.11.0.003  
**Estado:** V54 aplicado y verificado solo en STAGING. Producción y publicación siguen **NO GO**.

## Cambio V54 aplicado

Migración registrada en Supabase con versión `20261020191612`, nombre `mg_web_studio_v54_postgres_public_table_sequence_defaults`. Fuente canónica: `supabase/migrations/20261020191612_mg_web_studio_v54_postgres_public_table_sequence_defaults.sql`.

El cambio se limita a los defaults para objetos futuros creados por `postgres` dentro de `public`:

- Revoca los privilegios por defecto de `anon` y `authenticated` sobre TABLES.
- Revoca los privilegios por defecto de `anon` y `authenticated` sobre SEQUENCES.
- Conserva los defaults de `service_role`.
- No cambia funciones, grants de objetos existentes, otros esquemas ni defaults de `supabase_admin`.

## Verificación posterior

- `pg_default_acl`: en TABLES y SEQUENCES de `postgres/public` ya no aparecen `anon` ni `authenticated`; `service_role` permanece. Los defaults de funciones de `postgres` permanecen como estaban.
- Las tres entradas de `supabase_admin/public` (TABLES, SEQUENCES y FUNCTIONS) conservan sus ACL previos.
- Los grants de las 12 tablas MG en `public` siguen intactos: `authenticated` conserva SELECT y `service_role` conserva sus privilegios operativos.
- `auth.users` y las 16 tablas MG de `public` y `mg_private`: 0 filas cada una.
- Security Advisor devuelve 4 avisos INFO `rls_enabled_no_policy` en tablas `mg_private`; se mantienen aisladas del esquema expuesto y sin políticas deliberadamente. No se modificaron en V54.
- No se ejecutó backup, restore, despliegue ni cambio en producción.

## Límites y trabajo pendiente

PostgreSQL suma los defaults por esquema a los globales: un REVOKE por esquema no puede quitar un grant global. Las funciones nuevas reciben normalmente EXECUTE para PUBLIC; la mitigación requiere una decisión de alcance global por rol creador o revocaciones por función. Se deja pendiente el análisis de impacto y no se agregaron cambios a funciones.

La sesión STAGING disponible opera como `postgres`, no es superusuario y no pertenece a `supabase_admin`. No se cambió ni se intentó elevar el rol propietario de esos defaults.

La migración V45 sigue registrada en Supabase como `20261020181753`, pero su fuente permanece en `db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt`; aún no existe copia canónica en `supabase/migrations/`. No se reejecutó ni se alteró su historial.

## Registro de etapas

| Etapa | Estado |
|---|---|
| V45 — esquema y RLS base | Aplicado previamente en STAGING; fuente canónica pendiente de conciliación |
| V53 — pgTAP y RLS runtime | 56/56 aserciones; fixtures transaccionales revertidos |
| V54 — defaults de tablas/secuencias | Aplicado y verificado en STAGING |
| Defaults de `supabase_admin` | Pendiente; requiere una ruta privilegiada soportada |
| Defaults/ejecución pública de funciones | Pendiente; requiere revisión de impacto |
| Backend/Auth/PostgREST, EXPLAIN/índices y restore real | Pendiente |
| Producción/publicación | NO GO; requiere autorización específica |

