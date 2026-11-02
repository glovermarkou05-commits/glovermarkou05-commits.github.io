# MG WEB STUDIO CLOUD — V94A | Matriz de permisos y dependencias por objeto

**Fecha:** 01/11/2026. **Revisión:** documental/estática. **Rama:** `docs/mg-web-studio-v94-preflight-20261101` (PR #7, borrador).  
**DICTAMEN:** `G1 PENDING` / `G2 PENDING` / `G4 NOT_AUTHORIZED` / `V67 32 PENDING, 0 PASS` / `PRODUCCIÓN NO_GO`.

Esta matriz recoge lo **declarado en el archivo V45** y dependencias visibles. **No describe ACL efectivas comprobadas ni un respaldo restaurado.** No ejecutar ninguno de los ficheros consultados ni reutilizarlos como migraciones de producción.

## 1. Referencias de código verificadas

| Artefacto | Blob SHA |
| --- | --- |
| `db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt` | `135ff2c25d935d87e5c8e9e0f9189705cd40b411` |
| `tests/v53-rls-runtime.test.sql` | `18a10e935ef1487524da93f3e49ee849ba3784bf` |
| `supabase/migrations/20261020191612_mg_web_studio_v54_postgres_public_table_sequence_defaults.sql` | `a4b7221a4c38696a1c2abeef79a56ee68e151a5a` |
| `db/schema_core.review.sql` | `02912849894f6968560211d596002d409f6a1d3a` |

## 2. Inventario completo por objeto (V45, no catálogos PostgreSQL)

| # | Tabla | Referencias FK textuales | Políticas SELECT declaradas | Índices CREATE INDEX declarados | Rol de acceso previsto |
| ---: | --- | --- | --- | --- | --- |
| 1 | `public.mg_profiles` | `auth.users` | `mg_v40_profiles_self` | — | authenticated SELECT / service_role DML |
| 2 | `public.mg_organizations` | — | `mg_v40_org_active_member` | — | authenticated SELECT / service_role DML |
| 3 | `public.mg_memberships` | `public.mg_organizations`, `auth.users` | `mg_v40_memberships_self` | `mg_v40_memberships_user_idx` | authenticated SELECT / service_role DML |
| 4 | `public.mg_sites` | `public.mg_organizations` | `mg_v40_sites_scoped` | `mg_v40_sites_org_idx` | authenticated SELECT / service_role DML |
| 5 | `public.mg_pages` | `public.mg_sites` | `mg_v40_pages_site_read` | `mg_v40_pages_org_site_idx` | authenticated SELECT / service_role DML |
| 6 | `public.mg_membership_site_scopes` | `public.mg_memberships`, `public.mg_sites` | `mg_v40_scope_self` | `mg_v40_scopes_user_site_idx` | authenticated SELECT / service_role DML |
| 7 | `mg_private.mg_staff_roles` | `auth.users` | Sin policy en V45 | — | mg_private / service_role |
| 8 | `mg_private.mg_audit_events` | `public.mg_organizations` | Sin policy en V45 | — | mg_private / service_role |
| 9 | `public.mg_site_draft_versions` | `auth.users`, `public.mg_sites` | `mg_v40_drafts_site_read` | — | authenticated SELECT / service_role DML |
| 10 | `public.mg_site_proposals` | `auth.users`, `public.mg_sites` | `mg_v40_proposals_site_read` | `mg_v40_proposals_inbox_idx` | authenticated SELECT / service_role DML |
| 11 | `public.mg_proposal_revisions` | `auth.users`, `public.mg_site_proposals` | `mg_v40_revisions_site_read` | `mg_v40_revisions_site_idx` | authenticated SELECT / service_role DML |
| 12 | `public.mg_proposal_reviews` | `auth.users`, `public.mg_proposal_revisions` | `mg_v40_reviews_site_read` | `mg_v40_reviews_site_idx` | authenticated SELECT / service_role DML |
| 13 | `public.mg_proposal_notifications` | `auth.users`, `public.mg_proposal_revisions` | `mg_v40_notifications_recipient` | `mg_v40_notifications_recipient_idx`, `mg_v42_notification_event_recipient_key` | authenticated SELECT / service_role DML |
| 14 | `public.mg_notification_reads` | `public.mg_proposal_notifications` | `mg_v40_notification_reads_recipient` | — | authenticated SELECT / service_role DML |
| 15 | `mg_private.mg_proposal_outbox` | `public.mg_proposal_revisions` | Sin policy en V45 | `mg_v40_outbox_pending_idx`, `mg_v42_outbox_business_key` | mg_private / service_role |
| 16 | `mg_private.mg_operation_idempotency` | `public.mg_organizations`, `auth.users` | Sin policy en V45 | — | mg_private / service_role |

**Conteos:** 16 tablas (12 públicas, 4 privadas), `16` declaraciones RLS habilitado, `12` políticas `SELECT`, `11` índices explícitos (incluidos `2` únicos). Las PK generan también índices implícitos, por lo que el recuento de índices reales del catálogo sería mayor; este documento solo cuenta `CREATE INDEX`.

**V53:** 12 destinos de `INSERT INTO public.mg_*` figuran en V45 y hay 0 nombres de tabla destinataria faltantes. V53 depende además de `auth.users`, `extensions.pgtap`, roles `authenticated`/`anon`/`service_role` y claims simulados. El resultado histórico fue 56/56 aserciones sobre STAGING, NO sobre PG17 restaurado.

## 3. Matriz de privilegios previstos por rol (no efectiva)

| Rol | Objetos `public` | Objetos `mg_private` | Estado |
| --- | --- | --- | --- |
| `anon` | V45 explicitly REVOKE ALL; no GRANT to anon | V45 REVOKE ALL | STATIC_ONLY |
| `authenticated` | V45 explicit SELECT grants to 12 public tables, policy-based read only | V45 REVOKE ALL on schema and private tables | STATIC_ONLY |
| `service_role` | V45 grants SELECT/INSERT/UPDATE/DELETE on public MG tables | V45 grants schema USAGE and SELECT/INSERT/UPDATE/DELETE on 4 tables | STATIC_ONLY |
| `postgres` | Object creator/default privileges require review, V54 only revokes TABLE/SEQUENCE defaults in public | Owner/actual grants not proven | UNVERIFIED_RUNTIME |
| `supabase_admin` | V45 flags broad historical default grants; V54 does not alter this role | Actual role/ACL not proven | UNVERIFIED_RUNTIME |
| `PUBLIC` | Function default EXECUTE and future objects require separate review | Private functions REVOKE ALL from PUBLIC in V45, but runtime/catalog not checked | UNVERIFIED_RUNTIME |

**Límites técnicos:** las cláusulas `GRANT`/`REVOKE` inspeccionadas son la intención del autor en V45. No hay prueba en `pg_class`, `pg_authid`, `pg_roles`, `pg_default_acl`, `information_schema`, políticas efectivas, propietarios, `BYPASSRLS`, `SECURITY DEFINER`, herencia de roles ni `PUBLIC EXECUTE`. Los roles con bypass o ownership podrían ver/saltar RLS aun cuando las políticas se declaren.

**V54:** sólo cambia permisos *por defecto futuros* sobre `TABLES` y `SEQUENCES` del creador `postgres` en `public`; no modifica necesariamente los objetos existentes ni defaults de `supabase_admin` o `FUNCTIONS`. Nunca concluir que esto cierra la seguridad de las 16 tablas.

## 4. Orden de dependencia conceptual (NO comandos)

1. Preparar roles de laboratorio ficticios (`anon`, `authenticated`, `service_role`) y compatibilidad mínima de `auth.users` y `auth.uid()`, sin identidades reales.
2. Declarar el esquema `mg_private` e instalar las tablas sin referencias FK aún no disponibles según orden del baseline V45.
3. Crear primero organizaciones/usuarios y tablas padres; después membresías, sitios y documentos, propuestas, revisiones, notificaciones, outbox e idempotencia de acuerdo con sus FK.
4. Evaluar índices, restricciones, `ENABLE RLS`, políticas, `REVOKE/GRANT` y defaults con el propietario real revisado, no heredados de borradores antiguos.
5. Habilitar herramienta pgTAP en `extensions` únicamente dentro del laboratorio sintético autorizado.
6. Ejecutar las 56 aserciones V53 **sobre el destino restaurado**, verificar limpieza completa e independencia de STAGING, y luego realizar revisión humana de evidencia.

## 5. Bloqueos y criterio para la siguiente autorización

- **G1 sigue PENDING:** fuente canónica portable, hashes, orden DDL y validación en parser PostgreSQL todavía sin dictamen independiente.
- **G2 sigue PENDING:** no existe prueba de que el laboratorio simule correctamente las dependencias de Auth/pgTAP.
- **G3 sigue PENDING:** la presencia de `ROLLBACK` en el script V53 no acredita residuos cero tras restaurar.
- **G4 es NOT_AUTHORIZED:** no iniciar PG17 ni ejecutar SQL, migración, dump, restore o pgTAP sin autorización expresa adicional.
- **G5/G6 siguen PENDING/UNASSIGNED:** aislamiento, recursos y revisión humana todavía pendientes.
- **G7 NO_GO:** 32 controles V67 sin aceptación formal.

**Acción segura siguiente:** entregar esta matriz a revisor independiente y cerrar el checklist de compatibilidad del objeto/rol, sin reejecutar las pruebas históricas ni publicar cambios.
