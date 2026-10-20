# MG WEB STUDIO CLOUD — V50 | Índices FK y filtros RLS

**Fecha:** 20 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**SQL revisado:** V45, blob `135ff2c25d935d87e5c8e9e0f9189705cd40b411`  
**Dictamen:** **10 claves foráneas sin índice completo de soporte y 1 filtro RLS sin índice con columna inicial. Hallazgos estáticos; falta medir planes en PostgreSQL.**

## Método

Se compararon las columnas de cada FK con claves primarias, restricciones UNIQUE e índices declarados. Los índices parciales no cuentan como cobertura completa si excluyen filas válidas de la relación. También se revisó el filtro de la política `mg_v40_notification_reads_recipient`.

PostgreSQL no crea automáticamente índices en las columnas que referencian una FK. Supabase recomienda indexar las columnas filtradas por RLS; en B-tree compuesto, la columna filtrada debe ser la primera para servir directamente al filtro. Esto no sustituye mediciones con `EXPLAIN (ANALYZE, BUFFERS)`.  
Fuentes: [PostgreSQL 17 — Constraints](https://www.postgresql.org/docs/17/ddl-constraints.html) · [Supabase — RLS performance](https://supabase.com/docs/guides/database/postgres/row-level-security#add-indexes).

## FKs sin índice completo detectado

| Tabla hija | FK | Referencia | Candidato a validar |
|---|---|---|---|
| `public.mg_memberships` | `user_id` | `auth.users(id)`, CASCADE | `(user_id)` completo. El índice actual es parcial para `status='active'`. |
| `public.mg_membership_site_scopes` | `site_id, organization_id` | `public.mg_sites(id, organization_id)`, CASCADE | `(site_id, organization_id)`. |
| `mg_private.mg_audit_events` | `organization_id` | `public.mg_organizations(id)`, RESTRICT | `(organization_id)`. |
| `public.mg_site_draft_versions` | `updated_by` | `auth.users(id)`, SET NULL | `(updated_by)`. |
| `public.mg_site_proposals` | `created_by` | `auth.users(id)`, RESTRICT | `(created_by)`. |
| `public.mg_proposal_revisions` | `created_by` | `auth.users(id)`, RESTRICT | `(created_by)`. |
| `public.mg_proposal_reviews` | `reviewed_by` | `auth.users(id)`, RESTRICT | `(reviewed_by)`. |
| `public.mg_proposal_notifications` | `proposal_id, revision, organization_id, site_id` | `public.mg_proposal_revisions`, RESTRICT | Mismo orden de columnas de la FK. |
| `mg_private.mg_proposal_outbox` | `proposal_id, revision, organization_id, site_id` | `public.mg_proposal_revisions`, RESTRICT | Mismo orden de columnas de la FK. |
| `mg_private.mg_operation_idempotency` | `actor_user_id` | `auth.users(id)`, NO ACTION | `(actor_user_id)`. |

Un índice extra tiene coste de almacenamiento y escritura. Confirmar primero consultas, volumen, cardinalidad, planes y frecuencia de operaciones sobre las filas padre.

## Filtro RLS sin columna inicial

La política de lecturas filtra `mg_notification_reads.recipient_user_id`. Su PK es `(notification_id, recipient_user_id)`; no comienza por el destinatario. Evaluar `(recipient_user_id, notification_id)` con consultas reales. Esto es una observación de rendimiento, no un bypass de autorización.

## Cobertura estática

El borrador tiene 23 FKs: 13 se cubren por PK, UNIQUE o índices no parciales según el criterio del test. El índice parcial de membresías activas sirve al filtro RLS de membresías, pero no se cuenta como cobertura general de la FK `user_id` para todos los estados.

## Pruebas y límites

- Suite local: recuento de tablas y FKs, lista exacta de 10 FKs sin cobertura, filtro RLS y estado de borrador.
- Solo se analiza el texto versionado; no se conecta a PostgreSQL.
- No se ejecutaron planes, SQL, migraciones, consultas de Supabase, restauraciones ni despliegues.
- V45 no se editó; cambiarlo invalidaría el blob fijado y requeriría otra revisión.

## Registro de etapas

| Etapa | Estado |
|---|---|
| V46 | 72/72 comprobaciones estáticas reportadas; PostgreSQL runtime y recuperación no probados. |
| V47 | 8/8 pruebas locales de integridad. |
| V48 | Plantilla de recuperación; responsable, retención, RPO/RTO y destino pendientes. |
| V49 | RLS revisado estáticamente; aislamiento runtime pendiente. |
| V50 | Auditoría estática de índices; 10 FKs y un filtro RLS necesitan validación de planes. |
| Estado general | **NO GO** para instalar SQL, probar Supabase STAGING, recuperar o publicar en producción. |

**Siguiente:** preparar EXPLAIN y pgTAP para PostgreSQL aislado; conectar o ejecutar requiere autorización específica.
