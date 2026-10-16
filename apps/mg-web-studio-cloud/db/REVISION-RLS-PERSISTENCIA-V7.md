# MG WEB STUDIO CLOUD — REVISIÓN DE SEGURIDAD Y PERSISTENCIA V7

**Solo análisis y diseño. NO EJECUTAR MIGRACIONES, NO APLICAR SQL.**
Revisión realizada el 16/10/2026 sobre:
- \`db/schema_core.review.sql\`
- \`db/modelo-contenido-compartido.review.sql\`
- \`PERMISOS-MULTIORGANIZACION-REVISION.md\`

## Bloqueos detectados antes de aprobar un esquema productivo

### 1. Alcance de sitio insuficiente en políticas RLS propuestas
\`schema_core.review.sql\` permite que cualquier miembro activo de una organización lea todos sus sitios y páginas, y que cualquier CLIENT_EDITOR activo pueda crear/editar páginas de cualquier sitio de ese tenant. El diseño comercial del producto, sin embargo, restringe EDITOR y VIEWER a uno o varios **sitios autorizados**. Las políticas actuales no incluyen una relación persistida de sitios asignados a la membresía.

**Obligatorio:** crear scopes por sitio y probar consultas de otro sitio del mismo tenant, además de cruces entre tenants. OWNER/ADMIN abarcan el tenant; EDITOR/VIEWER consultan y editan según relación de permisos. No habilitar estas políticas en producción hasta corregirlas.

### 2. Autorización de lectura del personal MG
\`mg_memberships\` expone solamente la propia membresía al usuario; el SUPERADMIN debe disponer de consultas de administración protegidas por identidad corporativa, autorización real y MFA. Nunca crear una política pública que muestre membresías de otros clientes o asigne SUPERADMIN desde el navegador.

### 3. Identidad y vínculo de los borradores
Los datos ficticios usan códigos \`c1\`/\`s1\`; Postgres requerirá UUID. Planificar mapeo estable entre código comercial, IDs reales y slug único por sitio. El slug de Inicio es vacío en el prototipo mientras \`mg_pages.slug\` solo permite slugs no vacíos: **definir representación explícita de la página home**, por ejemplo \`is_home\` y slug reservado, con restricción de una sola home por sitio.

### 4. Escritura concurrente, revisiones y publicación integral
El borrador actual de SQL no tiene una versión numérica por documento/site draft ni CAS/expectedVersion para evitar overwrite silencioso. El modelo de releases incluye JSON de publicaciones, pero no resuelve:
- Transacción que bloquee el sitio y verifique número esperado.
- Copia inmutable de todas las páginas, catálogo, promociones, branding y medios vinculados.
- Puntero activo de release y comprobación de dominio.
- Manejo de reintentos con clave de idempotencia única por operación/actor/sitio.
- Creación de evento de cambios/outbox **en la misma transacción** de la escritura.
- Recuperación/reversión que no destruya borradores y garantice referencias multimedia anteriores.

**No usar un INSERT en \`mg_site_content_releases\` aislado como operación completa de publicación.**

### 5. Suscripciones y recursos privados
Se deben separar estados de servicio, facturación y pagos; no derivar facturas pagadas desde flags ficticios de suscripción. Fotografías y solicitudes de contacto implican almacenamiento privado, protección de datos personales, retención y borrado seguro. Nunca exponer mensajes de clientes o notas del SUPERADMIN en releases públicos.

### 6. Política de acceso mínimo
En el borrador propuesto se otorgan INSERT/UPDATE directos de sitios y páginas a miembros de ciertas categorías. Revisar si la arquitectura definitiva requiere backend obligatorio para versionado, validación, auditoría y control de cuotas; no mezclar writes directos con operaciones transaccionales API sin una regla inequívoca. Revalidar grants, \`USING\`, \`WITH CHECK\` y la política \`SELECT\` exigida para \`UPDATE\`. No exponer \`service_role\` en frontend.

## Secuencia de aprobación futura
1. Aprobar planes, cuotas, costos y región del proyecto Supabase **exclusivo**.
2. Definir modelo tenant/site/membership scopes, importación sin datos reales y restricciones.
3. Diseñar versiones editoriales, CAS, idempotencia, release atómico y outbox.
4. Crear migraciones con CLI vigente **solo después de autorización**, en una nueva base de staging, no en BAZAR-ONLINE ni Regaladitos Club.
5. Revisar RLS/grants y ejecutar pruebas positivas/negativas anon, Viewer, Editor de otro sitio, Owner de otro tenant, SUPERADMIN legítimo y tokens revocados.
6. Revisar seguridad/MFA, políticas de privacidad, restauración y respaldos.
7. Solo tras revisión explícita, desplegar servicios y conectar un panel con tráfico ficticio.

Referencias de seguridad actuales para revisión técnica:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/views

**Esta revisión no es una migración ni ha sido ejecutada en Supabase.**
