# V131 — propuesta de DDL para MG WEB STUDIO AUTH QA (NO EJECUTAR)

**Estado:** DOCUMENTACIÓN PARA REVISIÓN EXTERNA, NO MIGRACIÓN, NO AUTORIZACIÓN.
**Proyecto objetivo futuro:** `tbfhiqkivsoeuudlpkgi` — nunca producción.
**Fecha:** 4 de noviembre de 2026, Ecuador. Código propuesto en PR #7.

## Cambio comprobado en código

Anteriormente, aunque los roles V126/V128 permitían nombres QA, ambas capas usaban SQL fijado a esquemas ficticios (`mg_v126_fictional` y `mg_v128_fictional`). V131 añade **dos mapas de consultas constantes**, seleccionados **exclusivamente** por identidades de backend en listas cerradas:

| Servicio | Principal de CI | Esquema CI | Principal propuesto QA | Esquema QA propuesto |
| --- | --- | --- | --- | --- |
| Recibo emisor | `mg_v126_ci_issuer` | `mg_v126_fictional` | `mg_qa_mfa_receipt_issuer` | `mg_qa_mfa_receipts` |
| Recibo lector | `mg_v126_ci_reader` | `mg_v126_fictional` | `mg_qa_mfa_receipt_reader` | `mg_qa_mfa_receipts` |
| Desafío journal | `mg_v128_ci_journal` | `mg_v128_fictional` | `mg_qa_mfa_challenge_journal` | `mg_qa_mfa_challenges` |
| Sesión privada | `mg_v122_ci_auth_reader` | `auth.sessions` ficticia | `mg_qa_auth_session_reader` | `auth.sessions` real; **solo las 3 columnas autorizadas** |

Una pareja de roles V126 mezclada (emisor QA + lector CI, o viceversa) **se rechaza**; no se acepta un esquema, nombre de tabla o rol proporcionado por el cliente. El mapeo no crea roles por sí mismo.

## DDL de estudio — copia de referencia, NO desplegar

Este bloque es **ilustrativo e incompleto deliberadamente**; el DBA debe diseñar y generar las migraciones finales con seguridad, credenciales externas, aprobación del propietario, SHA y rollback. **No copiar en el SQL Editor de Supabase.**

```sql
-- SOLO REVISIÓN: NO EJECUTAR EN NINGUNA BASE
-- El DBA debe fijar proyecto, roles LOGIN, contraseñas/certificados, TLS,
-- ownership, default privileges, backup y comprobación de preexistencias.
-- Esquemas PRIVADOS que NO deben figurar en la lista de exposición Data API.
CREATE SCHEMA mg_qa_mfa_challenges;
CREATE SCHEMA mg_qa_mfa_receipts;

CREATE TABLE mg_qa_mfa_challenges.challenge_journal (
  proof_reference uuid PRIMARY KEY,
  challenge_id uuid NOT NULL UNIQUE,
  factor_id uuid NOT NULL,
  subject uuid NOT NULL,
  session_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('totp','mfa/phone')),
  created_at_sec bigint NOT NULL CHECK (created_at_sec > 0),
  state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CLAIMED')),
  claimed_at_sec bigint,
  CONSTRAINT claimed_consistency CHECK (
    (state='PENDING' AND claimed_at_sec IS NULL)
    OR (state='CLAIMED' AND claimed_at_sec IS NOT NULL))
);
CREATE TABLE mg_qa_mfa_receipts.verified_mfa_events (
  receipt_id uuid PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE DEFAULT pg_catalog.gen_random_uuid(),
  proof_reference uuid NOT NULL UNIQUE,
  subject uuid NOT NULL,
  session_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('totp','mfa/phone')),
  verified_at_sec bigint NOT NULL CHECK(verified_at_sec > 0)
);
ALTER TABLE mg_qa_mfa_challenges.challenge_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE mg_qa_mfa_challenges.challenge_journal FORCE ROW LEVEL SECURITY;
ALTER TABLE mg_qa_mfa_receipts.verified_mfa_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mg_qa_mfa_receipts.verified_mfa_events FORCE ROW LEVEL SECURITY;
-- SOLO EL DBA PUEDE DEFINIR las identidades LOGIN, GRANT mínimos,
-- policies SELECT/INSERT/UPDATE, restricción de otros roles,
-- y política de retención y protección de filas.
```

**Importante:** el SQL precedente **NO** incluye `CREATE ROLE`, `GRANT` ni `CREATE POLICY`, deliberadamente. El DBA debe aprobar primero el mecanismo de autenticación PostgreSQL de cuatro identidades distintas, autorización por columna, `RLS FORCE` y el acceso a `auth.sessions` sin ampliar permisos a `anon/authenticated/service_role`. Sin esos elementos la aplicación no funcionará: **no es una migración completa**.

## Qué tendría que verificar el DBA antes de aprobar cualquier migración

1. Proyecto y base correctos; preflight de esquema y roles ausentes; backup y recuperación ensayados.
2. Objetos internos no expuestos en PostgREST/GraphQL; `USAGE` únicamente para los roles privados, ninguno para `PUBLIC`, `anon`, `authenticated`, `service_role`.
3. Permisos específicos de `auth.sessions`: `SELECT(id,user_id,not_after)` solo a lector de sesión de backend; ningún permiso sobre `private_refresh_token` y no permitir escritura sobre Auth.
4. `mg_qa_mfa_challenge_journal` con SELECT para aplicar RLS de UPDATE; INSERT limitado a columnas iniciales; UPDATE **solo** `state` y `claimed_at_sec`; prohibido DELETE/TRUNCATE para cuenta de aplicación.
5. `mg_qa_mfa_receipt_issuer` solo SELECT/INSERT en columnas indispensables; `mg_qa_mfa_receipt_reader` solo SELECT; ninguna actualización/borrado.
6. Políticas RLS concretas; ningún `SECURITY DEFINER` ni grants heredados imprevistos; funciones con privilegios por defecto verificadas.
7. Credenciales provisionadas fuera del repositorio, TLS verificado, `pg_is_in_recovery()=false`, límites de conexión y rotación.
8. Contrato V127/V130: el bridge real emite/recibe el mismo `challenge_id`, `getClaims` de proyecto QA valida firma AAL2, el journal no guarda OTP/JWT, confirmación incierta falla cerrado.
9. Política de retención: los tombstones de ledger no pueden borrarse antes del horizonte anti-replay. Rollback no debe eliminar evidencia con filas ni afectar dependencias externas.
10. **Rollback QA específico y reversible**, con comprobación de ausencia de filas / objetos ajenos; nunca ejecutar `v129-full-rollback-disposable-review-only.sql` contra QA porque fue diseñado para `qa_ledger`.

## Puertas no cerradas

- Esquema real QA, conexión real, cuenta TOTP temporal: **NO INSTALADOS**.
- Revisión DBA/Seguridad externa: **PENDIENTE**.
- Consentimiento concreto del propietario para DDL/prueba QA: **NO OTORGADO**.
- PR #7: **DRAFT / NO MERGE**; V67 formal **0/32**, producción **NO_GO**.
- La estimación técnica V95 permanece **69% / 31%** hasta reevaluación humana; no es un porcentaje de liberación.

**Siguiente acción real:** compartir esta propuesta y el expediente de revisión V130 con un DBA/Seguridad; el especialista entregará DDL+rollback completos y firmados, tras lo cual se solicitará autorización QA delimitada.
