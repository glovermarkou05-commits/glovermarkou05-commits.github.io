# MG WEB STUDIO CLOUD — V21 | Compatibilidad SQL ↔ API (revisión)
**Fecha:** 2026-10-19  
**Rama:** `feature/mg-digital-v5-web-services`  
**Decisión:** **NO GO** para SQL, staging y producción.

## Alcance real
Se revisaron `db/schema_core.review.sql`, `db/v13-propuestas-scopes.review.sql`, `db/v20-contratos-propuestos.review.sql` y el contrato V20. No se modificaron archivos SQL originales. El auditor `shared/mg-sql-api-compat-v21.js` solo inspecciona texto; no ejecuta SQL, no usa conexiones y nunca habilita GO.

## Matriz de compatibilidad
| Área | SQL revisado | Contrato V20 | V21 / decisión |
|---|---|---|---|
| Home | `mg_pages.slug` no vacío, `unique(site_id,slug)` | `home` guardado, `/` público | Regex ya admite `home`. **Pendiente** asegurar Home obligatoria al publicar y transición de datos heredados |
| Enviado | `submitted_for_review` | `submitted` | Alias lectura únicamente; **no escribir estado canónico al SQL V13** |
| Aplicado | `applied_to_draft` | `applied` | Alias lectura únicamente; **no escribir estado canónico al SQL V13** |
| Otros estados | `draft,needs_changes,rejected,approved` | mismos | Coinciden |
| RLS/privilegios | políticas y helper SECURITY DEFINER propuestos | permisos simulados | No prueba autorización real |
| Versiones/concurrencia | estructuras propuestas | revision / draftVersion | Falta CAS transaccional real |
| Eventos/outbox | tablas propuestas | acciones de dominio | Falta atomicidad, deduplicación y rollback |

## Regla de integración futura
Un adaptador de lectura puede traducir estados históricos, pero un adaptador de escritura no debe aceptar los nuevos estados contra un CHECK V13 sin migración coordinada. Para solicitudes incompatibles debe responder un error explícito (por ejemplo, `SCHEMA_CONTRACT_NOT_READY`) y evitar escrituras parciales. La aplicación de propuestas nunca debe publicar automáticamente el sitio.

## Plan revisable, NO ejecutable
1. Verificar en base aislada creada solo con autorización específica qué migraciones están presentes y qué datos existen.
2. Preparar DDL transaccional revisado, estrategia de bloqueo/rollback y actualizaciones simultáneas de API, UI, auditoría, eventos, exportaciones y notificaciones.
3. Probar los casos de Home ausente/duplicada, cambios de estado heredado, idempotencia, revisiones obsoletas y rollback.
4. Verificar grants más RLS, revocación, privilegios de función, propietario y search_path con roles reales en PostgreSQL.
5. Mantener bloqueos de despliegue hasta aprobar proveedor, región, presupuesto y proyecto segregado.

## QA
`node apps/mg-web-studio-cloud/tests/sql-api-compat-v21.test.cjs` valida detección del diseño existente, estados heredados y prohibición de GO. Es comprobación JavaScript estática; **no sustituye** parser SQL real, tests PostgreSQL, navegador o infraestructura. Ninguna cifra histórica debe incrementarse sin volver a ejecutar las suites originales.

**Restricciones:** `main` intacta; sin Lovable, Supabase, SQL ejecutado, servicios de pago, publicación ni modificación de otros proyectos.
