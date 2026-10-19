# MG WEB STUDIO CLOUD — V19 | Compatibilidad SQL y aislamiento de permisos

**Fecha:** 19 de octubre de 2026  
**Rama:** \`feature/mg-digital-v5-web-services\`  
**Estado:** **NO GO para migraciones, staging, publicación, cobros e IA real**. Se analizaron archivos SQL como texto; no se aplicó ninguna sentencia.

## Alcance realmente revisado

Orden de lectura de los cuatro diseños:
1. \`db/schema_core.review.sql\` — organizaciones, membresías, sitios, páginas, dominios y auditoría.
2. \`db/modelo-contenido-compartido.review.sql\` — identidad, productos, promociones y releases.
3. \`db/v13-propuestas-scopes.review.sql\` — asignación de sitios, propuestas, decisiones, revisiones, notificaciones, borradores, eventos e idempotencia.
4. \`db/v13-endurecimiento-rls-legado.review.sql\` — revocación de escrituras directas, eliminación de políticas antiguas y lecturas restringidas por sitio.

Para verificar las diferencias con la demo se usó además \`tests/transactional-api-v14.test.cjs\`, que contiene páginas Inicio con \`slug=""\`, y el manifiesto NO GO \`staging/v18-manifest.review.json\`.

## Hallazgos confirmados

| ID | Gravedad | Hallazgo | Propuesta de corrección **sin aplicar** |
|---|---|---|---|
| \`HOME_SLUG_CONFLICT\` | **Bloqueante** | \`mg_pages.slug\` exige slug no vacío, mientras que el motor de prueba usa \`""\` para Inicio | Unificar el modelo: guardar internamente \`home\` como slug reservado y resolver la URL raíz \`/\` a esa página desde el servidor; o elegir alternativa explícita y ajustar ambas capas antes de migrar |
| \`STATUS_CONTRACT_MISMATCH\` | **Bloqueante** | SQL V13 enumera \`submitted_for_review\` / \`applied_to_draft\`; la API simulada usa \`submitted\` / \`applied\` | Recomiendo normalizar una única enumeración común en SQL, API, UI, eventos, auditoría y tests; mantener las transiciones y reglas de revisión con control de versión |
| \`SECURITY_DEFINER_REVIEW\` | Revisión crítica previa a staging | \`mg_private.mg_can_access_site\` usa \`SECURITY DEFINER\` | Auditar propietario, \`search_path\`, permisos \`EXECUTE\`, bypass RLS, revocación de miembros y posibles efectos de caché. Exponer solo una función booleana controlada |
| \`CAS_SQL_TRANSACTION_UNPROVEN\` | Revisión crítica previa a staging | Una columna \`revision\` no implementa por sí sola CAS o transacciones seguras | Diseñar escrituras atómicas: revisión esperada, actualización condicional, idempotencia y outbox en una transacción; demostrar rollback y carreras con PostgreSQL/pgTAP |
| \`POSTGRES_REQUIRED\` | Revisión técnica | La extracción mediante patrones no verifica sintaxis ni semántica real de SQL | Validar parser, instalación aislada, permisos, índices/FK, RLS y pruebas reales tras autorización dedicada |

### Qué verificó favorablemente el análisis estático

- **21 tablas** \`public\`/\`mg_private\` identificadas; todas con la sentencia \`ENABLE ROW LEVEL SECURITY\` en su archivo de creación.
- **0 referencias a tablas inexistentes detectadas** dentro del inventario analizado, usando \`auth.users\` como dependencia externa conocida.
- **0 infracciones de orden de dependencias detectadas** en el orden de lectura definido.
- **10 órdenes \`DROP POLICY IF EXISTS\`** encontrados para políticas anteriores.
- **17 políticas vigentes identificadas** tras aplicar solo una simulación textual de creación/retirada (no demuestra semántica de RLS).
- Se detectaron las seis políticas finales de lectura restringida por sitio, la revocación de permisos de escritura por tabla y la retirada de los \`UPDATE\` por columna.
- La FK compuesta \`(site_id,organization_id)\`, la FK de revisión exacta y sus índices de unicidad aparecen en los diseños.

Esto es una inspección **heurística** del texto. Cualquier política nueva, columna, trigger, vista o schema externo podría cambiar la conclusión. PostgreSQL puede rechazar sentencias cuya forma parezca correcta a un analizador de texto.

## Decisiones recomendadas para V20 — SIN ejecutar

1. Crear un **contrato canónico** de página Inicio y rutas. Preferencia: \`slug='home'\` almacenado y ruta \`/\` resuelta por backend; reservar \`home\`, impedir duplicados y comprobar las redirecciones.
2. Unificar los **estados**. Preferencia: \`draft\`, \`submitted\`, \`needs_changes\`, \`rejected\`, \`approved\`, \`applied\`, porque ya son utilizados por el simulador V14 y sus pruebas; editar el diseño SQL V13 solo después de acordar cambios de todos los consumidores.
3. Separar los **permisos de escritura** y la pertenencia a tenant: RLS + grants + autorización del servicio + MFA; un \`EDITOR\` de A1 no debe leer A2 ni aunque sea de la misma empresa.
4. Convertir la función privilegiada en objeto de revisión dedicada: aplicar mínimo privilegio, investigar si puede hacerse \`SECURITY INVOKER\` sin recursión; si se conserva \`DEFINER\`, demostrar que no expone otras capacidades.
5. Diseñar una **matriz de pruebas pgTAP** para usuarios anónimos, OWNER A/B, ADMIN, EDITOR A1/A2, VIEWER, revocado y SUPERADMIN con/sin MFA; cada caso debe cubrir \`SELECT/INSERT/UPDATE/DELETE\`, más intentos entre organizaciones.
6. Consolidar migraciones **nuevas** solo después de revisión, presupuesto, región, cuenta/proyecto MG WEB STUDIO CLOUD y autorización explícita. No copiar \`*.review.sql\` a \`supabase/migrations\` como si estuvieran listas.
7. Completar backups/restore, integridad de outbox, rate limits, CSRF y auditoría antes de ninguna puesta en producción.

## Entregables y validación

- \`shared/mg-sql-compat-v19.js\`: informe tipado con dependencias, tablas, políticas, bloqueos y revisiones.
- \`tests/sql-compat-v19.test.cjs\`: pruebas con mutaciones deliberadas (crear tablas duplicadas, romper FKs, reabrir políticas antiguas, remover RLS y revocaciones, etc.).
- \`staging/v19-sql-audit.cjs\`: **CLI local de solo lectura** que informa NO GO y devuelve código distinto de cero si encuentra bloqueos. No ejecuta SQL, HTTP, shell ni cambios Git.
- \`staging/V19-HALLAZGOS-COMPATIBILIDAD.md\`: este informe de revisión.
- \`QA-AUDITORIA-SQL-V19.md\`: verificación final de regresión, después de completar pruebas.

Comandos reproducibles, desde la raíz del repositorio:

\`\`\`powershell
node apps/mg-web-studio-cloud/tests/sql-compat-v19.test.cjs
node apps/mg-web-studio-cloud/staging/v19-sql-audit.cjs
\`\`\`

**Advertencia:** el segundo comando devuelve exit code \`2\` cuando persisten los problemas bloqueantes conocidos. Esto es intencional, no una falla de instalación. No genera migraciones ni cambia bases de datos.

## Fuentes y límites

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Database Migrations: https://supabase.com/docs/guides/deployment/database-migrations
- Supabase pgTAP: https://supabase.com/docs/guides/local-development/testing/overview

Los permisos \`GRANT\` y las políticas RLS son mecanismos diferentes; las políticas previas deben retirarse porque una política permisiva adicional puede ampliar el acceso final. Se debe validar en PostgreSQL real con identidades de prueba.

**Nunca reutilizar proyectos o datos existentes de FINZY, BAZAR-ONLINE, Regaladitos Club u otros productos. Ninguna aprobación anterior de etapas de diseño autoriza desplegar.**
