# MG WEB STUDIO CLOUD — V57 | Trazabilidad de V45

**Fecha:** 20 de octubre de 2026  
**Rama revisada:** `feature/mg-digital-v5-web-services`  
**STAGING:** `yefcgjtovfnsqtdjdsod` · PostgreSQL 17.11.0.003  
**Resultado:** procedencia de V45 reconciliada con evidencia de GitHub, historial de migraciones y logs PostgreSQL. No se ejecutó SQL ni se modificó la base de datos durante V57.

## Evidencia

| Fuente | Resultado |
|---|---|
| Archivo de rama `db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt` | Blob SHA `135ff2c25d935d87e5c8e9e0f9189705cd40b411`; contiene 16 `CREATE TABLE`, políticas/grants y límites de seguridad de V45. |
| Historial Supabase | `20261020181753` · `mg_web_studio_v45_object_scoped_security`; seguido por V53 y V54. |
| Logs PostgreSQL del STAGING | A las `2026-10-20T18:17:53.372Z` aparece el cuerpo enviado por la operación de migración, cuyo SQL coincide con el archivo de la rama. La gestión registró la versión V45. |
| Logs transaccionales | Se registraron avisos sobre `BEGIN` dentro de una transacción existente y `COMMIT` sin transacción activa, coherentes con el control transaccional incluido en el archivo y el envoltorio de aplicación. |

## Hallazgo de seguridad y decisión de repositorio

El encabezado del archivo dice **“DO NOT EXECUTE, DO NOT REGISTER AS MIGRATION”** y lo llama borrador, pero la evidencia de STAGING confirma que ese mismo SQL fue enviado y registrado como V45. Ese encabezado quedó obsoleto y no describe el estado real de STAGING.

V45 **no se volvió a ejecutar**. El archivo no se copió a `supabase/migrations/` ni se renombró como SQL ejecutable en V57: un archivo activo allí podría aplicarse accidentalmente en otro entorno. La fuente conserva la extensión `.sql.txt` y la ruta `db/v45-drafts/` hasta completar revisión PostgreSQL aislada, recuperación y decisión explícita de promoción por entorno.

## Próximas puertas

1. Completar la exportación lógica y restauración aislada V56 cuando estén disponibles PostgreSQL 17/Supabase CLI o Docker; comparar el esquema restaurado con STAGING.
2. Validar V45 con parser PostgreSQL y reproducirlo únicamente en un destino local desechable, verificando el comportamiento del control transaccional y el catálogo esperado.
3. Preparar una fuente canónica de recuperación con una estrategia de versionado que no vuelva a aplicar V45 sobre STAGING ni alcance producción.
4. Mantener producción, publicación y cualquier migración nueva en **NO GO** hasta revisión y autorización específicas.

**Resultado final V57:** origen de V45 verificado; discrepancia del encabezado documentada; archivo ejecutable canónico y prueba de recuperación pendientes. Sin cambios en STAGING o producción.
