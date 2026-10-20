# MG WEB STUDIO CLOUD — V52 | Instalación V45 y auditoría real de catálogo

**Fecha:** 20 de octubre de 2026  
**Rama GitHub:** feature/mg-digital-v5-web-services  
**Proyecto Supabase:** MG WEB STUDIO CLOUD - STAGING · yefcgjtovfnsqtdjdsod · PostgreSQL 17.11.0.003 · sa-east-1  
**Decisión:** V45 quedó aplicado solo en STAGING con autorización contextual del usuario. La auditoría de catálogo pasó; pruebas de acceso con usuarios, planes EXPLAIN y recuperación siguen pendientes.

## Registro exacto

- Fuente aplicada: db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt, blob 135ff2c25d935d87e5c8e9e0f9189705cd40b411.
- Supabase registró la migración mg_web_studio_v45_object_scoped_security, versión 20261020181753.
- El preflight encontró cero tablas y cero migraciones MG en este proyecto.
- V45 creó 16 tablas: 12 en public y 4 en mg_private. Todas estaban vacías al verificar.

**Desfase de trazabilidad:** el registro de Supabase existe, pero la fuente sigue almacenada en GitHub como borrador .sql.txt; no se creó una migración canónica en el repositorio ni se cambió V45 de ubicación. No sincronizar/rebasar ni preparar otro despliegue contra esta base hasta definir cómo se reconciliará el historial sin volver a ejecutar V45.

## Resultados de catálogo

| Control | Resultado observado |
|---|---|
| Tablas MG y RLS | 16/16 tablas tienen RLS habilitado: 12 public, 4 mg_private; owner observado postgres. |
| Filas | 0 filas en las 16 tablas. |
| Políticas | 12; todas SELECT para authenticated; ninguna política de escritura ni política para anon. |
| Privilegios de navegador | anon: sin privilegios de tabla en las 16. authenticated: SELECT en las 12 públicas, sin DML; sin SELECT/DML en las 4 privadas. |
| Esquema privado | anon y authenticated no tienen USAGE en mg_private. |
| Secuencias privadas | 2; sin acceso de anon/authenticated; service_role tiene USAGE y SELECT en ambas. |
| service_role | SELECT/INSERT/UPDATE/DELETE concedidos en las 16 tablas, según lo diseñado para un backend futuro. Su aislamiento depende de validación de actor/organización/sitio en el servidor; no se probó ningún endpoint. |

El owner postgres es un rol privilegiado que puede omitir RLS. El resultado 16/16 RLS describe flags de catálogo, no evidencia de autorización de usuario. La suite cross-tenant aún no se ejecutó.

## Defaults futuros: bloqueo activo

La consulta de pg_default_acl observó seis entradas en public: para los creadores postgres y supabase_admin, cada uno con defaults de tablas, secuencias y funciones que incluyen privilegios amplios de PUBLIC/roles de navegador. V45 no los cambió deliberadamente.

Las revocaciones por objeto protegen las 16 tablas instaladas. **No se debe crear otra tabla/función/secuencia pública** hasta resolver de forma aprobada los defaults para ambos roles y definir cómo cada futura migración hará revocaciones explícitas. No se aplicó ninguna corrección de ACL global.

## Asesores de Supabase

- Seguridad: 4 avisos INFO rls_enabled_no_policy, uno por cada tabla de mg_private. No tienen políticas; es intencional en este paquete porque el navegador carece de USAGE en el esquema y de privilegios de tabla. Esto no prueba las autorizaciones del backend.
- Rendimiento: 14 avisos unindexed_foreign_keys. V50 había identificado estáticamente 10 conjuntos FK sin cobertura completa según su criterio. El asesor también señala cinco relaciones compuestas cuyos índices contienen las columnas en otro orden; y no marca la FK mg_memberships.user_id, cuyo índice es parcial para status='active'. No se debe tratar el 14 del asesor ni el 10 estático como una decisión automática: comparar consultas y planes con fixtures aislados.
- Rendimiento: 9 avisos unused_index. Las tablas están vacías y no hubo tráfico de MG; estos avisos no justifican retirar índices.

Remediación del linter: [FK sin índice de cobertura](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) · [RLS habilitado sin política](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) · [Índice no utilizado](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Límites de las pruebas

- Pasaron antes de aplicar: 49/49 comprobaciones estáticas V45 y 22/22 pruebas Node de V49–V51.
- V45 se aplicó correctamente en el proyecto indicado; Supabase registró la migración.
- Se consultaron catálogos y privilegios solo en lectura después de la instalación.
- No se insertaron usuarios/tenants de prueba; no se corrieron pgTAP, consultas como roles de navegador, EXPLAIN ANALYZE, backups ni restores. El catálogo de extensiones muestra pgTAP 1.3.3 disponible pero no instalado; activarlo también modifica el esquema y sigue pendiente de autorización.
- No se tocaron otros proyectos, producción, despliegues ni servicios pagos.

## Registro de etapas

| Etapa / puerta | Estado |
|---|---|
| V46 | 72/72 comprobaciones estáticas reportadas. |
| V47 | 8/8 pruebas locales. |
| V48 | Política de recuperación incompleta; responsable, retención, RPO/RTO y destino pendientes. |
| V49 | Revisión estática RLS aprobada; runtime cross-tenant pendiente. |
| V50 | Auditoría estática de índices; discrepancia documentada con asesor real. |
| V51 P51-01 | Proyecto/versión confirmados; destino STAGING exacto. |
| V51 P51-02 | V45 aplicada en STAGING con autorización. |
| V51 P51-03 | Catálogo, RLS y grants por objeto comprobados. Defaults futuros siguen abiertos. |
| V51 P51-04 | Matriz real RLS: pendiente; sin fixtures ni pgTAP. |
| V51 P51-05 | Grants service_role verificados; backend y validación de actor: pendientes. |
| V51 P51-06 | Asesores leídos; planes y cardinalidad sintética: pendientes. |
| V51 P51-07 | Backup/restore: pendiente. |
| **Estado** | **NO GO** para backend, datos reales, nuevas tablas públicas, recuperación, producción y publicación. |

**Próximo trabajo seguro:** preparar casos pgTAP y plan de EXPLAIN reproducibles con identidad de prueba y limpieza transaccional; para insertar fixtures o ejecutar pruebas como roles hacen falta autorización específica. Resolver aparte defaults ACL e historial de migración antes de avanzar a despliegue.
